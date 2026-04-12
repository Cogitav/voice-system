import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { getContext, updateContext, createEmptyContext } from '../_shared/context-manager.ts';
import { classifyIntent } from '../_shared/intent-router.ts';
import { extractEntities, getMissingFields } from '../_shared/entity-extractor.ts';
import { resolveService, loadServices } from '../_shared/service-resolver.ts';
import { orchestrateBooking, selectSlotFromContext } from '../_shared/booking-orchestrator.ts';
import { executeBooking } from '../_shared/booking-executor.ts';
import { executeReschedule, resolveRescheduleSlot } from '../_shared/reschedule-handler.ts';
import { answerFromKnowledge } from '../_shared/knowledge-retriever.ts';
import { generateResponse, buildConfirmationMessage, getFallbackResponse } from '../_shared/response-generator.ts';
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
      .select('id, nome, prompt_base, regras, welcome_message, response_delay_ms')
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

    // Classify intent
    const intentResult = await classifyIntent(userMessage, context, empresaId);
    const intent = intentResult.intent;

    // Handle human handoff request immediately
    if (intent === 'HUMAN_REQUEST') {
      await triggerHandoff(conversationId, empresaId, context, 'User requested human');
      const reply = 'Vou transferir para um operador humano agora. Um momento, por favor.';
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message');
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto handoff if too many errors
    if (shouldAutoHandoff(context)) {
      await triggerHandoff(conversationId, empresaId, context, 'Auto handoff: consecutive errors');
      const reply = getFallbackResponse('human_handoff', '');
      await db.from('messages').insert({ conversation_id: conversationId, sender_type: 'ai', content: reply });
      await consumeCredits(empresaId, 'message');
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract entities from message
    const entities = await extractEntities(userMessage, context, empresaId, timezone);

    // Build context updates from extraction
    const extractionUpdates: Partial<ConversationContext> = {
      current_intent: intent,
    };
    if (entities.customer_name && !context.customer_name) extractionUpdates.customer_name = entities.customer_name;
    if (entities.customer_email && !context.customer_email) extractionUpdates.customer_email = entities.customer_email;
    if (entities.customer_phone && !context.customer_phone) extractionUpdates.customer_phone = entities.customer_phone;
    if (entities.customer_reason && !context.customer_reason) extractionUpdates.customer_reason = entities.customer_reason;
    if (entities.preferred_date) extractionUpdates.preferred_date = entities.preferred_date;
    if (entities.preferred_time) extractionUpdates.preferred_time = entities.preferred_time;

    // Resolve service if not yet resolved
    if (!context.service_id && intent !== 'INFO_REQUEST') {
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
    if (intent === 'INFO_REQUEST' || (context.state === 'idle' && intent === 'OTHER')) {
      // Knowledge base lookup
      const knowledge = await answerFromKnowledge(userMessage, empresaId, agentId, agentPrompt);
      if (knowledge.found && knowledge.answer) {
        reply = knowledge.answer;
        await consumeCredits(empresaId, 'knowledge_lookup');
      } else {
        reply = await generateResponse(userMessage, updatedContext, 'Responde à questão do utilizador com base no contexto da empresa.', null, {
          agent_name: agent?.nome ?? 'Assistente',
          agent_prompt: agentPrompt,
          empresa_name: empresa?.nome ?? '',
          language: 'pt-PT',
        }, empresaId);
      }
      updatedContext = await updateContext(conversationId, { state: 'idle' }, updatedContext.context_version);

    } else if (intent === 'CANCEL') {
      reply = 'Para cancelar um agendamento, por favor indique o dia e hora do agendamento que pretende cancelar.';
      updatedContext = await updateContext(conversationId, { state: 'collecting_data', current_intent: 'CANCEL' }, updatedContext.context_version);

    } else if (intent === 'RESCHEDULE' || context.state === 'reschedule_pending' || context.state === 'reschedule_confirm') {
      // Reschedule flow
      if (context.state === 'reschedule_confirm' && /\b(sim|confirmo|confirmar|ok|certo|yes)\b/i.test(userMessage)) {
        const result = await executeReschedule(updatedContext, empresaId, agentId, conversationId);
        if (result.success) {
          reply = `O seu agendamento foi remarcado com sucesso! ${updatedContext.reschedule_new_slot?.display_label ?? ''}`;
          updatedContext = await updateContext(conversationId, { state: 'completed', agendamento_id: result.agendamento_id }, updatedContext.context_version);
          await createLeadIfEligible(updatedContext, empresaId, agentId, conversationId);
        } else {
          reply = result.error ?? 'Erro ao remarcar. Tente novamente.';
          updatedContext = await updateContext(conversationId, { consecutive_errors: updatedContext.consecutive_errors + 1 }, updatedContext.context_version);
        }
      } else {
        const rescheduleUpdates = resolveRescheduleSlot(updatedContext, entities.preferred_date ?? null, entities.preferred_time ?? null);
        updatedContext = await updateContext(conversationId, { ...rescheduleUpdates, state: 'reschedule_pending', current_intent: 'RESCHEDULE' }, updatedContext.context_version);
        reply = 'Para remarcar, indique a nova data e horário que pretende.';
      }

    } else if (intent === 'BOOKING_NEW' || ['collecting_data', 'awaiting_slot_selection', 'awaiting_confirmation', 'booking_processing'].includes(context.state) || ['collecting_data', 'awaiting_slot_selection', 'awaiting_confirmation', 'booking_processing'].includes(updatedContext.state)) {
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
              reply = `O seu agendamento foi confirmado! ✅\n\n${updatedContext.selected_slot?.display_label ?? ''}\nServiço: ${updatedContext.service_name}\n\nReceberá uma confirmação no email ${updatedContext.customer_email}.`;
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
          reply = buildConfirmationMessage(updatedContext);
        } else {
          reply = await generateResponse(userMessage, updatedContext, 'O utilizador não selecionou um horário válido. Re-apresenta as opções disponíveis numeradas.', updatedContext.available_slots, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
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

        if (orchestration.action === 'SHOW_SLOTS' || orchestration.action === 'NO_AVAILABILITY_SUGGEST_ALTERNATIVES' || orchestration.action === 'SINGLE_SLOT_CONFIRM') {
          reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, orchestration.slots ?? null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        } else {
          reply = await generateResponse(userMessage, updatedContext, orchestration.response_hint, null, {
            agent_name: agent?.nome ?? 'Assistente',
            agent_prompt: agentPrompt,
            empresa_name: empresa?.nome ?? '',
            language: 'pt-PT',
          }, empresaId);
        }
      }

    } else {
      // Generic fallback
      reply = await generateResponse(userMessage, updatedContext, 'Responde de forma útil e encaminha para o serviço correto.', null, {
        agent_name: agent?.nome ?? 'Assistente',
        agent_prompt: agentPrompt,
        empresa_name: empresa?.nome ?? '',
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
