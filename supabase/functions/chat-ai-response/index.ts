import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getContext, updateContext, createEmptyContext } from '../_shared/context-manager.ts';
import { callLLMSimple } from '../_shared/llm-provider.ts';
import { EXTRACTION_SYSTEM_PROMPT, parseExtractionResponse, validateExtraction, normalizeExtraction, isBelowConfidenceThreshold } from '../_shared/extraction-contract.ts';
import { handleValidationIssue, handleSystemError, handleUserCorrection, handleFrustration, resetErrorCount } from '../_shared/error-handler.ts';
import { EMOTION_KEYWORDS, ERROR_MESSAGES } from '../_shared/constants.ts';
import { resolveService, loadServices } from '../_shared/service-resolver.ts';
import { orchestrateBooking, selectSlotFromContext } from '../_shared/booking-orchestrator.ts';
import { executeBooking } from '../_shared/booking-executor.ts';
import { executeReschedule, resolveRescheduleSlot } from '../_shared/reschedule-handler.ts';
import { answerFromKnowledge } from '../_shared/knowledge-retriever.ts';
import { generateResponse, buildConfirmationMessage, getFallbackResponse } from '../_shared/response-generator.ts';
import { buildResponseDirective, serializeDirectiveToPrompt, getHardcodedResponse, HARDCODED_TEMPLATES } from '../_shared/response-directive.ts';
import { triggerHandoff, shouldAutoHandoff } from '../_shared/handoff-manager.ts';
import { createLeadIfEligible } from '../_shared/lead-manager.ts';
import { checkCredits, consumeCredits } from '../_shared/credit-manager.ts';
import { canTransition } from '../_shared/state-machine.ts';
import { log } from '../_shared/logger.ts';
import { ConversationContext } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateWithDirective(
  userMessage: string,
  context: any,
  mustSayType: string,
  mustSayContent: string,
  slots: any[] | null,
  agentCtx: any,
  emotionalCtx: any,
  empresaId: string
): Promise<string> {
  const directive = buildResponseDirective({
    state: context.state,
    mustSayBlocks: [{ type: mustSayType as any, content: mustSayContent, priority: 1 }],
    confirmedData: {
      service_name: context.service_name,
      customer_name: context.customer_name,
      customer_email: context.customer_email,
      customer_phone: context.customer_phone ?? null,
      date: context.preferred_date ?? null,
      time_start: null,
      time_end: null,
    },
    emotionalContext: emotionalCtx,
    language: 'pt-PT',
  });
  const directivePrompt = serializeDirectiveToPrompt(directive);
  return generateResponse(userMessage, context, directivePrompt, slots, agentCtx, empresaId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let empresaId = '';
  let conversationId = '';

  try {
    const body = await req.json();
    conversationId = body.conversation_id;
    const userMessage = body.message?.trim();

    if (!conversationId || !userMessage) {
      return new Response(JSON.stringify({ error: 'Missing conversation_id or message' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const db = getServiceClient();

    // Load conversation + empresa + agent
    const { data: conversation, error: convError } = await db
      .from('conversations')
      .select('id, empresa_id, status, owner, conversation_context, context_version')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    empresaId = conversation.empresa_id;

    // Block if conversation is not AI-owned
    if (conversation.owner !== 'ai' || conversation.status === 'closed' || conversation.status === 'completed') {
      return new Response(JSON.stringify({ reply: null, blocked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load empresa + agent
    const { data: empresa } = await db
      .from('empresas')
      .select('id, nome, fuso_horario, chat_ai_provider, chat_ai_model, chat_ai_real_enabled')
      .eq('id', empresaId)
      .single();

    const { data: agent } = await db
      .from('agentes')
      .select('id, nome, prompt_base, regras, welcome_message, response_delay_ms, response_style')
      .eq('empresa_id', empresaId)
      .eq('is_default_chat_agent', true)
      .eq('status', 'ativo')
      .single();

    const agentId = agent?.id ?? '';
    const agentPrompt = `${agent?.prompt_base ?? ''}\n${agent?.regras ?? ''}`.trim();
    const timezone = empresa?.fuso_horario ?? 'Europe/Lisbon';

    // Check credits before anything
    const creditCheck = await checkCredits(empresaId, 'message');
    if (!creditCheck.allowed) {
      return new Response(JSON.stringify({
        reply: 'De momento não é possível continuar. Por favor contacte-nos diretamente.',
        blocked: true,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load context
    const context = await getContext(conversationId);
    const currentVersion = context.context_version;

    // Save user message
    await db.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'client',
      content: userMessage,
    });

    // Single LLM call — extract intent, entities, emotion all at once
    let extraction;
    try {
      const llmRaw = await callLLMSimple(EXTRACTION_SYSTEM_PROMPT, userMessage, empresaId, 'json');
      extraction = parseExtractionResponse(llmRaw);
    } catch {
      extraction = parseExtractionResponse('');
    }

    // Normalize valid fields
    extraction = normalizeExtraction(extraction);

    // Validate extracted fields
    const fieldValidations = validateExtraction(extraction);

    // Detect emotion deterministically first
    let emotionalContext = null;
    const lowerMsg = userMessage.toLowerCase();
    for (const [tone, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      const found = (keywords as string[]).filter(kw => lowerMsg.includes(kw));
      if (found.length > 0) {
        emotionalContext = { tone, keywords: found, detected_by: 'deterministic' };
        break;
      }
    }
    // Use LLM emotional context as fallback if deterministic found nothing
    if (!emotionalContext && extraction.emotional_context) {
      emotionalContext = { ...extraction.emotional_context, detected_by: 'llm' };
    }

    // Map ExtractedIntent to routing intent
    const intent = extraction.intent;

    // Build context updates from extraction (accumulate, never overwrite with null)
    const extractionUpdates: Partial<ConversationContext> = {
      current_intent: intent as any,
    };
    if (extraction.customer_name) {
      const nameValidation = fieldValidations.find(v => v.field === 'customer_name');
      if (nameValidation?.status === 'valid' && !context.customer_name) {
        extractionUpdates.customer_name = extraction.customer_name;
      }
    }
    if (extraction.customer_email) {
      const emailValidation = fieldValidations.find(v => v.field === 'customer_email');
      if (emailValidation?.status === 'valid' && !context.customer_email) {
        extractionUpdates.customer_email = extraction.customer_email;
      }
    }
    if (extraction.customer_phone) {
      const phoneValidation = fieldValidations.find(v => v.field === 'customer_phone');
      if (phoneValidation?.status === 'valid' && !context.customer_phone) {
        extractionUpdates.customer_phone = extraction.customer_phone;
      }
    }
    if (extraction.date_parsed) extractionUpdates.preferred_date = extraction.date_parsed;
    if (extraction.time_parsed) extractionUpdates.preferred_time = extraction.time_parsed;

    // Resolve service if not yet resolved
    if (!context.service_id && extraction.intent !== 'INFO_REQUEST') {
      const services = await loadServices(empresaId);
      const serviceResult = await resolveService(userMessage, empresaId, services);
      if (serviceResult.service_id) {
        extractionUpdates.service_id = serviceResult.service_id;
        extractionUpdates.service_name = serviceResult.service_name;
      }
    }

    // Apply extraction updates
    let updatedContext = await updateContext(conversationId, extractionUpdates, currentVersion);

    let reply = '';

    // ROUTING
    if (intent === 'INFO_REQUEST') {
      // Knowledge base lookup
      const knowledge = await answerFromKnowledge(userMessage, empresaId, agentId, agentPrompt);
      if (knowledge.found && knowledge.answer) {
        reply = knowledge.answer;
        await consumeCredits(empresaId, 'knowledge_lookup');
      } else {
        reply = await generateResponse(userMessage, updatedContext, serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'inform', content: 'Responde à questão do utilizador com base no conhecimento da empresa. Sê directo e útil.', priority: 1 }], confirmedData: { service_name: updatedContext.service_name, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: updatedContext.preferred_date ?? null, time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })), null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          agent_style: agent?.response_style ?? 'friendly',
          empresa_name: empresa?.nome ?? '',
          language: 'pt-PT',
        }, empresaId);
      }
      updatedContext = await updateContext(conversationId, { state: 'idle' }, updatedContext.context_version);

    } else if (context.state === 'idle' || intent === 'UNCLEAR' || (intent === 'BOOKING_NEW' && context.state === 'idle')) {
      // First message or unclear intent — route to collecting_service first
      updatedContext = await updateContext(conversationId, {
        state: 'collecting_service',
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      const orchestration = await orchestrateBooking(updatedContext, empresaId);
      updatedContext = await updateContext(conversationId, {
        ...orchestration.context_updates,
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      reply = await generateResponse(userMessage, updatedContext,
        serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'ask_service', content: 'Sê empático, reconhece o contexto e guia para perceber que serviço o utilizador pretende.', priority: 1 }], confirmedData: { service_name: null, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: null, time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })),
        orchestration.slots ?? null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          agent_style: agent?.response_style ?? 'friendly',
          empresa_name: empresa?.nome ?? '',
          empresa_sector: '',
          language: 'pt-PT',
        }, empresaId);

    } else if (context.state === 'collecting_service') {
      // Service resolution state — identify service before collecting personal data
      if (updatedContext.service_id) {
        // Service resolved — move to collecting data
        updatedContext = await updateContext(conversationId, {
          state: 'collecting_data',
          current_intent: 'BOOKING_NEW',
        }, updatedContext.context_version);
        const orchestration = await orchestrateBooking(updatedContext, empresaId);
        updatedContext = await updateContext(conversationId, {
          ...orchestration.context_updates,
          current_intent: 'BOOKING_NEW',
        }, updatedContext.context_version);
        reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, orchestration.slots ?? null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          agent_style: agent?.response_style ?? 'friendly',
          empresa_name: empresa?.nome ?? '',
          empresa_sector: '',
          language: 'pt-PT',
        }, empresaId);
      } else {
        // Service not yet resolved — ask empathetically
        reply = await generateResponse(userMessage, updatedContext,
          serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'ask_service', content: 'Identifica o serviço pretendido. Não peças dados pessoais ainda.', priority: 1 }], confirmedData: { service_name: null, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: null, time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })),
          null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            agent_style: agent?.response_style ?? 'friendly',
            empresa_name: empresa?.nome ?? '',
            empresa_sector: '',
            language: 'pt-PT',
          }, empresaId);
      }

    } else if (intent === 'CANCEL') {
      reply = 'Para cancelar um agendamento, por favor indique o dia e hora do agendamento que pretende cancelar.';
      updatedContext = await updateContext(conversationId, { state: 'collecting_data', current_intent: 'CANCEL' }, updatedContext.context_version);

    } else if (intent === 'RESCHEDULE') {
      // Reschedule — guide user to provide new date/time
      updatedContext = await updateContext(conversationId, {
        state: 'collecting_data',
        current_intent: 'RESCHEDULE' as any,
      }, updatedContext.context_version);
      reply = await generateResponse(userMessage, updatedContext,
        serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'ask_date', content: 'Pede a nova data e hora para o reagendamento.', priority: 1 }], confirmedData: { service_name: updatedContext.service_name, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: null, time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })),
        null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          agent_style: agent?.response_style ?? 'friendly',
          empresa_name: empresa?.nome ?? '',
          empresa_sector: '',
          language: 'pt-PT',
        }, empresaId);

    } else if (intent === 'BOOKING_NEW' || ['collecting_service', 'collecting_data', 'awaiting_slot_selection', 'awaiting_confirmation', 'booking_processing'].includes(context.state) || ['collecting_service', 'collecting_data', 'awaiting_slot_selection', 'awaiting_confirmation', 'booking_processing'].includes(updatedContext.state)) {
      // Booking flow

      if (updatedContext.state === 'awaiting_confirmation') {
        if (/\b(sim|confirmo|confirmar|ok|certo|correto|exato|perfeito|yes)\b/i.test(userMessage)) {
          // Execute booking
          const creditBooking = await checkCredits(empresaId, 'booking_create');
          if (!creditBooking.allowed) {
            reply = 'Não foi possível criar o agendamento: créditos insuficientes.';
          } else {
            updatedContext = await updateContext(conversationId, { state: 'booking_processing' }, updatedContext.context_version);
            const result = await executeBooking(updatedContext, empresaId, agentId, conversationId);
            if (result.success) {
              const snapshot = {
                service_id: updatedContext.service_id!,
                service_name: updatedContext.service_name!,
                start: updatedContext.selected_slot!.start,
                end: updatedContext.selected_slot!.end,
                resource_id: updatedContext.selected_slot!.resource_id,
                customer_name: updatedContext.customer_name!,
                customer_email: updatedContext.customer_email!,
                customer_phone: updatedContext.customer_phone ?? null,
                agendamento_id: result.agendamento_id,
              };
              updatedContext = await updateContext(conversationId, {
                state: 'completed',
                agendamento_id: result.agendamento_id,
                confirmed_snapshot: snapshot,
                consecutive_errors: 0,
              }, updatedContext.context_version);
              const confirmedSnap = {
                service_name: updatedContext.service_name,
                customer_name: updatedContext.customer_name,
                customer_email: updatedContext.customer_email,
                customer_phone: updatedContext.customer_phone ?? null,
                date: updatedContext.selected_slot?.start?.slice(0, 10) ?? null,
                time_start: updatedContext.selected_slot?.display_label?.split('—')[1]?.trim()?.split(' ')[0] ?? null,
                time_end: updatedContext.selected_slot?.display_label?.split('—')[1]?.trim()?.split(' às ')[1] ?? null,
              };
              reply = HARDCODED_TEMPLATES.booking_confirmed(confirmedSnap);
              await createLeadIfEligible(updatedContext, empresaId, agentId, conversationId);
            } else if (result.error_code === 'SLOT_CONFLICT') {
              updatedContext = await updateContext(conversationId, {
                state: 'awaiting_slot_selection',
                selected_slot: null,
                available_slots: [],
                consecutive_errors: updatedContext.consecutive_errors + 1,
              }, updatedContext.context_version);
              reply = 'Este horário já não está disponível. Vou mostrar outras opções.';
            } else {
              updatedContext = await updateContext(conversationId, {
                consecutive_errors: updatedContext.consecutive_errors + 1,
                last_error: result.error,
              }, updatedContext.context_version);
              reply = result.error ?? 'Erro ao criar agendamento. Tente novamente.';
            }
          }
        } else {
          // User changed something — go back to collecting
          updatedContext = await updateContext(conversationId, { state: 'collecting_data', selected_slot: null }, updatedContext.context_version);
          const orchestration = await orchestrateBooking(updatedContext, empresaId);
          updatedContext = await updateContext(conversationId, orchestration.context_updates, updatedContext.context_version);
          reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, orchestration.slots ?? null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            agent_style: agent?.response_style ?? 'friendly',
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        }

      } else if (updatedContext.state === 'awaiting_slot_selection') {
        const selectedSlot = selectSlotFromContext(updatedContext, userMessage);
        if (selectedSlot) {
          updatedContext = await updateContext(conversationId, {
            selected_slot: selectedSlot,
            state: 'awaiting_confirmation',
          }, updatedContext.context_version);
          const confirmSnap = {
            service_name: updatedContext.service_name,
            customer_name: updatedContext.customer_name,
            customer_email: updatedContext.customer_email,
            customer_phone: updatedContext.customer_phone ?? null,
            date: updatedContext.selected_slot?.start?.slice(0, 10) ?? null,
            time_start: updatedContext.selected_slot?.display_label?.split('—')[1]?.trim()?.split(' ')[0] ?? null,
            time_end: updatedContext.selected_slot?.display_label?.split('—')[1]?.trim()?.split(' às ')[1] ?? null,
          };
          reply = HARDCODED_TEMPLATES.awaiting_confirmation(confirmSnap);
        } else {
          reply = await generateResponse(userMessage, updatedContext, 'O utilizador não selecionou um horário válido. Re-apresenta as opções disponíveis numeradas.', updatedContext.available_slots, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            agent_style: agent?.response_style ?? 'friendly',
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        }

      } else {
        // collecting_data or new booking intent — single atomic update after orchestration
        const preOrchestrationContext = {
          ...updatedContext,
          state: 'collecting_data' as const,
          current_intent: 'BOOKING_NEW' as const,
        };
        const orchestration = await orchestrateBooking(preOrchestrationContext, empresaId);
        updatedContext = await updateContext(conversationId, {
          ...orchestration.context_updates,
          current_intent: 'BOOKING_NEW',
        }, updatedContext.context_version);

        if (orchestration.action === 'SHOW_SLOTS' || orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' || orchestration.action === 'SINGLE_SLOT_CONFIRM' || orchestration.action === 'PROACTIVE_SLOTS') {
          reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, orchestration.slots ?? null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            agent_style: agent?.response_style ?? 'friendly',
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        } else {
          reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            agent_style: agent?.response_style ?? 'friendly',
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        }
      }

    } else {
      // Generic fallback — always try to move toward booking
      updatedContext = await updateContext(conversationId, {
        state: context.service_id ? 'collecting_data' as const : 'collecting_service' as const,
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      const orchestration = await orchestrateBooking(updatedContext, empresaId);
      updatedContext = await updateContext(conversationId, {
        ...orchestration.context_updates,
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      reply = await generateResponse(userMessage, updatedContext,
        orchestration.response_hint,
        orchestration.slots ?? null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          agent_style: agent?.response_style ?? 'friendly',
          empresa_name: empresa?.nome ?? '',
          empresa_sector: '',
          language: 'pt-PT',
        }, empresaId);
    }

    // Save AI reply
    await db.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'ai',
      content: reply,
    });

    // Consume message credit
    await consumeCredits(empresaId, 'message', conversationId);

    // Update last_message_at
    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[CHAT_AI_ERROR]', error);
    await log({
      empresa_id: empresaId,
      conversation_id: conversationId,
      event_type: 'ORCHESTRATOR_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 'error').catch(() => {});

    return new Response(JSON.stringify({
      reply: 'Peço desculpa, ocorreu um erro. Por favor tente novamente.',
      error: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
