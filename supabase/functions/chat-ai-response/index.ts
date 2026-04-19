import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getContext, updateContext, createEmptyContext } from '../_shared/context-manager.ts';
import { callLLMSimple } from '../_shared/llm-provider.ts';
import { EXTRACTION_SYSTEM_PROMPT, parseExtractionResponse, validateExtraction, normalizeExtraction, isBelowConfidenceThreshold } from '../_shared/extraction-contract.ts';
import { handleValidationIssue, handleSystemError, handleUserCorrection, handleFrustration, resetErrorCount } from '../_shared/error-handler.ts';
import { EMOTION_KEYWORDS, ERROR_MESSAGES, HANDOFF_RULES } from '../_shared/constants.ts';
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

    const { data: bookingConfig } = await db
      .from('booking_configuration')
      .select('require_name, require_email, require_phone, require_reason, allow_same_day_booking, allow_outside_business_hours, minimum_advance_minutes, fallback_service_id')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    const requirePhone = bookingConfig?.require_phone ?? false;
    const requireReason = bookingConfig?.require_reason ?? false;
    const allowSameDay = bookingConfig?.allow_same_day_booking ?? true;
    const minimumAdvanceMinutes = bookingConfig?.minimum_advance_minutes ?? 0;

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
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
      const extractionUserMessage = `[TODAY IS ${todayStr}]\n\n${userMessage}`;
      const llmRaw = await callLLMSimple(EXTRACTION_SYSTEM_PROMPT, extractionUserMessage, empresaId, 'json');
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
    if (extraction.date_parsed) {
      const fieldValidation = fieldValidations.find(v => v.field === 'date_parsed');
      if (fieldValidation?.status === 'valid') {
        extractionUpdates.preferred_date = extraction.date_parsed;
      } else if (fieldValidation?.status === 'invalid') {
        // Date is in the past or invalid — don't store it, let system ask for new date
        console.log('[DATE_REJECTED] Past or invalid date rejected:', extraction.date_parsed);
      } else {
        // Not validated — do basic check ourselves
        const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
        if (extraction.date_parsed >= today) {
          extractionUpdates.preferred_date = extraction.date_parsed;
        }
      }
    }
    if (extraction.time_parsed) extractionUpdates.preferred_time = extraction.time_parsed;

    // Apply extraction updates
    let updatedContext = await updateContext(conversationId, extractionUpdates, currentVersion);

    // Resolve service if not yet resolved — combine message + customer_reason for better matching
    if (!updatedContext.service_id && intent !== 'INFO_REQUEST') {
      const services = await loadServices(empresaId);
      // Combine current message with any reason already in context for better semantic matching
      const combinedInput = [
        userMessage,
        updatedContext.customer_reason,
        extraction.service_keywords?.join(' '),
      ].filter(Boolean).join(' ').trim();
      const serviceResult = await resolveService(combinedInput, empresaId, services);
      if (serviceResult.service_id) {
        const serviceUpdates: Partial<ConversationContext> = {
          service_id: serviceResult.service_id,
          service_name: serviceResult.service_name,
        };
        // Also save the reason for future reference
        if (!updatedContext.customer_reason && userMessage.length > 5) {
          serviceUpdates.customer_reason = userMessage.trim();
        }
        updatedContext = await updateContext(conversationId, serviceUpdates, updatedContext.context_version);
      }
    }

    // Handle human handoff request immediately
    if (intent === 'HUMAN_REQUEST') {
      await triggerHandoff(conversationId, empresaId, updatedContext, 'User requested human');
      const reply = 'Vou transferir para um operador humano agora. Um momento, por favor.';
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto handoff if error threshold reached
    const errorState = updatedContext.error_context;
    if (errorState && errorState.consecutive_errors >= HANDOFF_RULES.system_error_threshold) {
      await triggerHandoff(conversationId, empresaId, updatedContext, 'Auto handoff: system errors threshold');
      const reply = 'Peço desculpa pelas dificuldades. Vou transferir para um operador humano que pode ajudar melhor.';
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message', conversationId);
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    } else if (context.state === 'idle') {
      // First message or unclear intent — route to collecting_service first
      updatedContext = await updateContext(conversationId, {
        state: 'collecting_service',
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
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
        // Service resolved — show availability first (EC3: no personal data required before slots)
        // Always use orchestrateBooking as single source of truth for slots
        const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
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
        // Service not yet resolved — but check if we have enough personal data to proceed
        // If user just provided personal data, keep collecting_service and ask for service
        const justProvidedData = updatedContext.customer_name || updatedContext.customer_email || updatedContext.customer_phone;
        const hint = justProvidedData
          ? `Já tens os dados pessoais do utilizador. Agradece e pergunta qual o serviço ou motivo da consulta de forma natural.`
          : 'Identifica o serviço pretendido. Não peças dados pessoais ainda.';
        reply = await generateResponse(userMessage, updatedContext,
          serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'ask_service', content: hint, priority: 1 }], confirmedData: { service_name: null, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: null, time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })),
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
            if (canTransition(updatedContext.state, 'booking_processing')) {
              updatedContext = await updateContext(conversationId, { state: 'booking_processing' }, updatedContext.context_version);
            }
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
              if (canTransition(updatedContext.state, 'completed')) {
                updatedContext = await updateContext(conversationId, {
                  state: 'completed',
                  agendamento_id: result.agendamento_id,
                  confirmed_snapshot: snapshot,
                  error_context: resetErrorCount(updatedContext.error_context),
                }, updatedContext.context_version);
              }
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
              const { updatedErrorState } = handleSystemError(
                updatedContext.error_context,
                'slot_conflict',
                true
              );
              updatedContext = await updateContext(conversationId, {
                state: 'awaiting_slot_selection',
                selected_slot: null,
                available_slots: [],
                error_context: updatedErrorState,
              }, updatedContext.context_version);
              reply = ERROR_MESSAGES.system.slot_conflict;
            } else {
              const { updatedErrorState, shouldHandoff } = handleSystemError(
                updatedContext.error_context,
                'booking_creation_failed',
                false
              );
              updatedContext = await updateContext(conversationId, {
                error_context: updatedErrorState,
                last_error: result.error,
              }, updatedContext.context_version);
              if (shouldHandoff) {
                await triggerHandoff(conversationId, empresaId, updatedContext, 'Booking creation failed repeatedly');
                reply = ERROR_MESSAGES.system.general_failure;
              } else {
                reply = result.error ?? ERROR_MESSAGES.system.retry;
              }
            }
          }
        } else {
          // Check if user is requesting a different time (not confirming, not cancelling)
          const timeOnlyPattern = /\b(\d{1,2})\s*h(?:oras?)?(?:\s*(\d{2}))?\b|^às?\s+(\d{1,2})/i;
          const isTimeRequest = timeOnlyPattern.test(userMessage) && extraction.intent !== 'CANCEL';

          if (isTimeRequest && updatedContext.available_slots.length > 0) {
            // User wants a different time — try to match against existing slots
            const selectedSlot = selectSlotFromContext(updatedContext, userMessage);
            if (selectedSlot) {
              // Found matching slot — update selected slot and stay in confirmation
              updatedContext = await updateContext(conversationId, {
                selected_slot: selectedSlot,
                state: 'awaiting_confirmation',
              }, updatedContext.context_version);
              const confirmSnap = {
                service_name: updatedContext.service_name,
                customer_name: updatedContext.customer_name,
                customer_email: updatedContext.customer_email,
                customer_phone: updatedContext.customer_phone ?? null,
                date: selectedSlot.start?.slice(0, 10) ?? null,
                time_start: selectedSlot.display_label?.split('—')[1]?.trim()?.split(' ')[0] ?? null,
                time_end: null,
              };
              reply = HARDCODED_TEMPLATES.awaiting_confirmation(confirmSnap);
            } else {
              // Time not available — inform and re-show slots
              updatedContext = await updateContext(conversationId, { state: 'awaiting_slot_selection' }, updatedContext.context_version);
              reply = await generateResponse(userMessage, updatedContext,
                serializeDirectiveToPrompt(buildResponseDirective({
                  state: updatedContext.state,
                  mustSayBlocks: [
                    { type: 'report_error', content: 'Esse horário não está disponível.', priority: 1 },
                    { type: 'present_slots', content: updatedContext.available_slots.map((s: any, i: number) => ({ slot_number: i + 1, date: s.start?.slice(0, 10) ?? '', time_start: s.display_label?.split('—')[1]?.trim()?.split(' ')[0] ?? '', time_end: '', display: s.display_label })), priority: 2 }
                  ],
                  confirmedData: { service_name: updatedContext.service_name, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: updatedContext.preferred_date ?? null, time_start: null, time_end: null },
                  emotionalContext: null,
                  language: 'pt-PT',
                })),
                updatedContext.available_slots, {
                  agent_name: agent?.nome ?? 'Assistente',
                  agent_prompt: agentPrompt,
                  agent_style: agent?.response_style ?? 'friendly',
                  empresa_name: empresa?.nome ?? '',
                  empresa_sector: '',
                  language: 'pt-PT',
                }, empresaId);
            }
          } else {
            // User changed something else — go back to collecting
            updatedContext = await updateContext(conversationId, { state: 'collecting_data', selected_slot: null }, updatedContext.context_version);
            const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
            updatedContext = await updateContext(conversationId, orchestration.context_updates, updatedContext.context_version);
            reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, orchestration.slots ?? null, {
              agent_name: agent?.nome ?? 'Assistente',
              agent_prompt: agentPrompt,
              agent_style: agent?.response_style ?? 'friendly',
              empresa_name: empresa?.nome ?? '',
              language: 'pt-PT',
            }, empresaId);
          }
        }

      } else if (updatedContext.state === 'awaiting_slot_selection') {
        const selectedSlot = selectSlotFromContext(updatedContext, userMessage);
        if (selectedSlot) {
          // Check if personal data is still missing (EC3: collected after slot selection)
          const missingPersonal = !updatedContext.customer_name || !updatedContext.customer_email;
          if (missingPersonal) {
            updatedContext = await updateContext(conversationId, {
              selected_slot: selectedSlot,
              state: 'collecting_data',
            }, updatedContext.context_version);
            const missingFields = [];
            if (!updatedContext.customer_name) missingFields.push('nome completo');
            if (!updatedContext.customer_email) missingFields.push('email');
            if (!updatedContext.customer_phone) missingFields.push('telefone');
            reply = await generateResponse(userMessage, updatedContext,
              serializeDirectiveToPrompt(buildResponseDirective({ state: updatedContext.state, mustSayBlocks: [{ type: 'ask_multiple_fields', content: `Para confirmar o agendamento, só preciso do seu ${missingFields.join(', ')} 😊`, priority: 1 }], confirmedData: { service_name: updatedContext.service_name, customer_name: null, customer_email: null, customer_phone: null, date: selectedSlot.start.slice(0, 10), time_start: null, time_end: null }, emotionalContext: emotionalContext as any, language: 'pt-PT' })),
              null, {
                agent_name: agent?.nome ?? 'Assistente',
                agent_prompt: agentPrompt,
                agent_style: agent?.response_style ?? 'friendly',
                empresa_name: empresa?.nome ?? '',
                empresa_sector: '',
                language: 'pt-PT',
              }, empresaId);
          } else {
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
          }
        } else {
          // Re-present existing slots — do NOT regenerate
          reply = await generateResponse(userMessage, updatedContext,
            serializeDirectiveToPrompt(buildResponseDirective({
              state: updatedContext.state,
              mustSayBlocks: [{ type: 'present_slots', content: updatedContext.available_slots.map((s: any, i: number) => ({ slot_number: i + 1, date: s.start?.slice(0, 10) ?? '', time_start: s.display_label?.split('—')[1]?.trim()?.split(' ')[0] ?? '', time_end: s.display_label?.split('—')[1]?.trim()?.split(' às ')[1] ?? '', display: s.display_label })), priority: 1 }, { type: 'clarify', content: 'O horário indicado não está na lista. Pede para escolher um dos horários numerados acima.', priority: 2 }],
              confirmedData: { service_name: updatedContext.service_name, customer_name: updatedContext.customer_name, customer_email: updatedContext.customer_email, customer_phone: updatedContext.customer_phone ?? null, date: updatedContext.preferred_date ?? null, time_start: null, time_end: null },
              emotionalContext: null,
              language: 'pt-PT',
            })),
            updatedContext.available_slots, {
              agent_name: agent?.nome ?? 'Assistente',
              agent_prompt: agentPrompt,
              agent_style: agent?.response_style ?? 'friendly',
              empresa_name: empresa?.nome ?? '',
              empresa_sector: '',
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
        const orchestration = await orchestrateBooking(preOrchestrationContext, empresaId, requirePhone, requireReason);
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
        state: updatedContext.service_id ? 'collecting_data' as const : 'collecting_service' as const,
        current_intent: 'BOOKING_NEW',
      }, updatedContext.context_version);
      const orchestration = await orchestrateBooking(updatedContext, empresaId, requirePhone, requireReason);
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
