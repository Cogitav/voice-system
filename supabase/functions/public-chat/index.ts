import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  determineSchedulingState,
  getInternalSchedulingProvider,
  generateSchedulingPromptInstructions,
  type SchedulingState,
  type SchedulingProvider,
} from '../_shared/scheduling-engine.ts';
import {
  generateBehavioralContractPrompt,
  mapToContractLanguage,
} from '../_shared/behavioral-contract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform default welcome message
const PLATFORM_DEFAULT_WELCOME = "Olá 👋 Sou o assistente virtual. Como posso ajudá-lo hoje?";

// Platform default response delay (milliseconds)
const PLATFORM_DEFAULT_RESPONSE_DELAY_MS = 2000;

// Rate limiting: simple in-memory store (resets on cold start)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30; // requests per window
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(sessionId);
  
  if (!record || now > record.resetAt) {
    rateLimitStore.set(sessionId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Generate a deterministic session hash from request info
function generateSessionId(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return `${ip}-${userAgent.substring(0, 50)}`;
}

// Language detection kept for scheduling instructions in chat-ai-response
// (Mock AI responder removed — all AI responses delegated to chat-ai-response)

// ============================================================================
// Type definitions for database entities
// ============================================================================

interface Empresa {
  id: string;
  nome: string;
  slug: string;
  default_welcome_message: string | null;
  default_response_delay_ms: number | null;
  // Chat AI configuration
  chat_ai_provider: string | null;
  chat_ai_model: string | null;
  chat_ai_real_enabled: boolean;
  // Widget branding
  widget_primary_color: string | null;
  widget_secondary_color: string | null;
  widget_background_color: string | null;
  widget_user_message_color: string | null;
  widget_agent_message_color: string | null;
  widget_agent_text_color: string | null;
  widget_user_text_color: string | null;
  widget_button_color: string | null;
  widget_input_background_color: string | null;
  widget_input_text_color: string | null;
  widget_theme_mode: 'light' | 'dark' | 'auto' | null;
  widget_border_radius: 'normal' | 'rounded' | 'soft' | null;
  widget_size: 'small' | 'medium' | 'large' | null;
  widget_header_text: string | null;
  widget_avatar_url: string | null;
}

// Platform default branding
const PLATFORM_DEFAULT_BRANDING = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  backgroundColor: '#ffffff',
  userMessageColor: '#6366f1',
  agentMessageColor: '#f3f4f6',
  userTextColor: '#ffffff',
  agentTextColor: '#111827',
  buttonColor: '#6366f1',
  inputBackgroundColor: '#f3f4f6',
  inputTextColor: '#111827',
  themeMode: 'light' as const,
  borderRadius: 'normal' as const,
  size: 'medium' as const,
};

// Resolve branding with fallbacks
function resolveEmpresaBranding(empresa: Empresa) {
  return {
    primaryColor: empresa.widget_primary_color || PLATFORM_DEFAULT_BRANDING.primaryColor,
    secondaryColor: empresa.widget_secondary_color || PLATFORM_DEFAULT_BRANDING.secondaryColor,
    backgroundColor: empresa.widget_background_color || PLATFORM_DEFAULT_BRANDING.backgroundColor,
    userMessageColor: empresa.widget_user_message_color || PLATFORM_DEFAULT_BRANDING.userMessageColor,
    agentMessageColor: empresa.widget_agent_message_color || PLATFORM_DEFAULT_BRANDING.agentMessageColor,
    userTextColor: empresa.widget_user_text_color || PLATFORM_DEFAULT_BRANDING.userTextColor,
    agentTextColor: empresa.widget_agent_text_color || PLATFORM_DEFAULT_BRANDING.agentTextColor,
    buttonColor: empresa.widget_button_color || PLATFORM_DEFAULT_BRANDING.buttonColor,
    inputBackgroundColor: empresa.widget_input_background_color || PLATFORM_DEFAULT_BRANDING.inputBackgroundColor,
    inputTextColor: empresa.widget_input_text_color || PLATFORM_DEFAULT_BRANDING.inputTextColor,
    themeMode: empresa.widget_theme_mode || PLATFORM_DEFAULT_BRANDING.themeMode,
    borderRadius: empresa.widget_border_radius || PLATFORM_DEFAULT_BRANDING.borderRadius,
    size: empresa.widget_size || PLATFORM_DEFAULT_BRANDING.size,
    headerText: empresa.widget_header_text || empresa.nome,
    avatarUrl: empresa.widget_avatar_url || null,
  };
}

interface Conversation {
  id: string;
  status: string;
  owner: string;
  channel: string;
  client_identifier: string;
  empresa_id: string;
  created_at: string;
  last_message_at: string;
  customer_id?: string | null;
}

// ============================================================================
// Customer Identity Resolution
// ============================================================================

/**
 * Resolve or create a customer based on session identifier.
 * Searches customer_identifiers for a match, creates a new customer if none found.
 */
// deno-lint-ignore no-explicit-any
async function resolveCustomerId(
  supabase: any,
  empresaId: string,
  identifierType: string,
  identifierValue: string,
): Promise<string> {
  // Step 1: Search existing identifiers
  const { data: existing } = await supabase
    .from('customer_identifiers')
    .select('customer_id, customers!inner(empresa_id)')
    .eq('type', identifierType)
    .eq('value', identifierValue)
    .limit(10);

  // Find one that belongs to this empresa
  const match = existing?.find((row: any) => row.customers?.empresa_id === empresaId);
  if (match) {
    // Update last_seen
    await supabase
      .from('customers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', match.customer_id);
    console.log(`[CustomerIdentity] Resolved existing customer: ${match.customer_id}`);
    return match.customer_id;
  }

  // Step 2: Create new customer
  const { data: newCustomer, error: custErr } = await supabase
    .from('customers')
    .insert({ empresa_id: empresaId })
    .select('id')
    .single();

  if (custErr || !newCustomer) {
    console.error('[CustomerIdentity] Failed to create customer:', custErr);
    throw new Error('Failed to create customer');
  }

  const customerId = newCustomer.id;

  // Step 3: Create identifier entry
  await supabase
    .from('customer_identifiers')
    .insert({
      customer_id: customerId,
      type: identifierType,
      value: identifierValue,
    });

  console.log(`[CustomerIdentity] Created new customer: ${customerId} with ${identifierType}=${identifierValue}`);
  return customerId;
}

interface Message {
  id: string;
  sender_type: string;
  content: string;
  created_at: string;
}

interface Agent {
  id: string;
  nome: string;
  prompt_base: string | null;
  personalidade: string | null;
  contexto_negocio: string | null;
  is_default_chat_agent: boolean;
  welcome_message: string | null;
  response_delay_ms: number | null;
  initial_greeting: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // deno-lint-ignore no-explicit-any
    const supabase: any = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, empresaSlug, sessionId: clientSessionId, conversationId, content } = body;

    // Validate required fields
    if (!action || !empresaSlug) {
      return new Response(
        JSON.stringify({ error: 'action and empresaSlug are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use client-provided session ID or generate one
    const sessionId = clientSessionId || generateSessionId(req);

    // Rate limiting
    if (!checkRateLimit(sessionId)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please wait before sending more messages.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate empresa exists and is active (including service flags)
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select(`
        id, nome, slug, default_welcome_message, default_response_delay_ms,
        chat_ai_provider, chat_ai_model, chat_ai_real_enabled,
        widget_primary_color, widget_secondary_color, widget_background_color,
        widget_user_message_color, widget_agent_message_color, widget_agent_text_color,
        widget_user_text_color, widget_button_color, widget_input_background_color,
        widget_input_text_color, widget_theme_mode, widget_border_radius, widget_size, 
        widget_header_text, widget_avatar_url,
        service_chat_enabled, service_voice_enabled, service_scheduling_enabled, service_email_enabled
      `)
      .eq('slug', empresaSlug)
      .eq('status', 'ativo')
      .single();

    if (empresaError || !empresa) {
      console.error('Empresa not found:', empresaError);
      return new Response(
        JSON.stringify({ error: 'Company not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const empresaData = empresa as Empresa & {
      service_chat_enabled?: boolean;
      service_voice_enabled?: boolean;
      service_scheduling_enabled?: boolean;
      service_email_enabled?: boolean;
    };

    // Check if chat service is enabled for this empresa
    if (!empresaData.service_chat_enabled && action !== 'get-empresa') {
      console.log('Chat service disabled for empresa:', empresaSlug);
      return new Response(
        JSON.stringify({ 
          error: 'Chat service is not enabled for this company',
          blocked: true,
          reason: 'De momento, o serviço de Chat não está ativo para esta empresa.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different actions
    switch (action) {
      case 'get-empresa': {
        const branding = resolveEmpresaBranding(empresaData);
        
        // Get default agent to resolve welcome message for immediate display
        const agent = await getDefaultChatAgent(supabase, empresaData.id);
        const welcomeMessage = getWelcomeMessage(agent, empresaData);
        
        return new Response(
          JSON.stringify({ 
            empresa: { 
              id: empresaData.id, 
              nome: empresaData.nome, 
              slug: empresaData.slug 
            },
            branding,
            welcomeMessage, // Return welcome message for immediate display
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-conversation':
        return await handleGetConversation(supabase, empresaData.id, sessionId, corsHeaders);

      case 'get-messages':
        return await handleGetMessages(supabase, conversationId, sessionId, corsHeaders);

      case 'send-message':
        return await handleSendMessage(supabase, empresaData, sessionId, conversationId, content, corsHeaders);

      case 'init-conversation':
        return await handleInitConversation(supabase, empresaData, sessionId, corsHeaders);

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function handleGetConversation(
  supabase: any,
  empresaId: string,
  sessionId: string,
  corsHeaders: Record<string, string>
) {
  // Find existing conversation for this session
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, status, owner, channel, created_at, last_message_at')
    .eq('empresa_id', empresaId)
    .eq('client_identifier', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch conversation' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ conversation }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// deno-lint-ignore no-explicit-any
async function handleGetMessages(
  supabase: any,
  conversationId: string | undefined,
  sessionId: string,
  corsHeaders: Record<string, string>
) {
  if (!conversationId) {
    return new Response(
      JSON.stringify({ messages: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify the conversation belongs to this session
  const { data: conversation } = await supabase
    .from('conversations')
    .select('client_identifier')
    .eq('id', conversationId)
    .single();

  const convData = conversation as Conversation | null;
  if (!convData || convData.client_identifier !== sessionId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Fetch messages (only non-internal)
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ messages: messages || [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Handle init-conversation: create conversation + guided greeting without requiring a user message
// deno-lint-ignore no-explicit-any
async function handleInitConversation(
  supabase: any,
  empresa: Empresa,
  sessionId: string,
  corsHeaders: Record<string, string>
) {
  // Check if there's already an active conversation for this session
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, status, owner')
    .eq('empresa_id', empresa.id)
    .eq('client_identifier', sessionId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    // Conversation already exists, return it (messages will be fetched separately)
    return new Response(
      JSON.stringify({ conversationId: existingConv.id, alreadyExists: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check for recently closed conversation to reopen (within 24h)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentClosed } = await supabase
    .from('conversations')
    .select('id, closed_at')
    .eq('empresa_id', empresa.id)
    .eq('client_identifier', sessionId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentClosed && recentClosed.closed_at && recentClosed.closed_at > twentyFourHoursAgo) {
    const { error: reopenErr } = await supabase
      .from('conversations')
      .update({
        status: 'ai_active',
        owner: 'ai',
        last_message_at: new Date().toISOString(),
        closed_at: null,
        closed_by: null,
        closure_reason: null,
        closure_note: null,
      })
      .eq('id', recentClosed.id);

    if (!reopenErr) {
      console.log(`[InitConversation] Reopened closed conversation: ${recentClosed.id}`);
      return new Response(
        JSON.stringify({ conversationId: recentClosed.id, alreadyExists: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Resolve customer identity
  let customerId: string | null = null;
  try {
    customerId = await resolveCustomerId(supabase, empresa.id, 'widget', sessionId);
  } catch (e) {
    console.error('[InitConversation] Customer resolution failed:', e);
  }

  // Create new conversation
  const { data: newConversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      empresa_id: empresa.id,
      client_identifier: sessionId,
      owner: 'ai',
      status: 'ai_active',
      channel: 'chat',
      ...(customerId ? { customer_id: customerId } : {}),
    })
    .select('id')
    .single();

  if (convError) {
    console.error('[InitConversation] Error creating conversation:', convError);
    return new Response(
      JSON.stringify({ error: 'Failed to create conversation' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const conversationId = (newConversation as { id: string }).id;

  // Customer memory injection
  if (customerId) {
    try {
      const { data: lastClosed } = await supabase
        .from('conversations')
        .select('id, summary, main_intent, result')
        .eq('customer_id', customerId)
        .eq('status', 'closed')
        .not('summary', 'is', null)
        .neq('id', conversationId)
        .order('closed_at', { ascending: false })
        .limit(1)
        .single();

      if (lastClosed?.summary) {
        await supabase
          .from('conversations')
          .update({
            conversation_context: {
              previous_interaction: {
                summary: lastClosed.summary,
                main_intent: lastClosed.main_intent || null,
                result: lastClosed.result || null,
              },
            },
          })
          .eq('id', conversationId);
      }
    } catch (e) {
      console.error('[InitConversation] Memory injection failed:', e);
    }
  }

  // Get agent and generate guided greeting
  const agent = await getDefaultChatAgent(supabase, empresa.id);
  const empresaName = empresa.nome || 'nossa empresa';
  const agentName = agent?.nome || 'Assistente';

  const greetingTemplate = agent?.initial_greeting?.trim()
    || `Olá! 👋\nSou o assistente virtual da {empresa}.\n\nPosso ajudar com informações, preços ou marcação de atendimento.`;

  const resolvedGreeting = greetingTemplate
    .replace(/\{empresa\}/g, empresaName)
    .replace(/\{agente\}/g, agentName);

  const { data: menuServices } = await supabase
    .from('scheduling_services')
    .select('id, name')
    .eq('empresa_id', empresa.id)
    .eq('status', 'active')
    .eq('show_in_chat_menu', true)
    .order('priority', { ascending: true })
    .limit(3);

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
  let menuLines = '';
  const serviceMap: Record<string, string> = {};

  if (menuServices && menuServices.length > 0) {
    menuLines = menuServices.map((svc: { id: string; name: string }, idx: number) => {
      serviceMap[String(idx + 1)] = svc.id;
      return `${numberEmojis[idx]} ${svc.name}`;
    }).join('\n');
  }

  const equipaOptionNum = (menuServices?.length || 0) + 1;
  const equipaEmoji = numberEmojis[equipaOptionNum - 1] || `${equipaOptionNum}️⃣`;
  menuLines += `\n${equipaEmoji} Falar com a equipa`;
  serviceMap[String(equipaOptionNum)] = '_human_escalation';

  const menuIntro = 'Como prefere começar?';
  const guidedContent = `${resolvedGreeting}\n\n${menuIntro}\n\n${menuLines}`;

  const { data: guidedMsg, error: guidedError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'ai',
      content: guidedContent,
      is_internal: false,
    })
    .select('id, sender_type, content, created_at')
    .single();

  if (guidedError) {
    console.error('[InitConversation] Error inserting guided greeting:', guidedError);
  } else {
    await supabase
      .from('conversations')
      .update({ conversation_context: { _guided_greeting_sent: true, _guided_service_map: serviceMap } })
      .eq('id', conversationId);
    try {
      await registerCreditUsage(supabase, empresa.id, 'message', guidedMsg.id);
    } catch {}
  }

  console.log(`[InitConversation] Created conversation ${conversationId} with guided greeting`);

  return new Response(
    JSON.stringify({
      conversationId,
      greetingMessage: guidedMsg || null,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}


// deno-lint-ignore no-explicit-any
async function getDefaultChatAgent(supabase: any, empresaId: string): Promise<Agent | null> {
  // Priority 1: Agent marked as is_default_chat_agent
  const { data: defaultAgent } = await supabase
    .from('agentes')
    .select('id, nome, prompt_base, personalidade, contexto_negocio, is_default_chat_agent, welcome_message, response_delay_ms, initial_greeting')
    .eq('empresa_id', empresaId)
    .eq('is_default_chat_agent', true)
    .eq('status', 'ativo')
    .limit(1)
    .maybeSingle();

  if (defaultAgent) {
    return defaultAgent as Agent;
  }

  // Priority 2: Any active agent of the company
  const { data: anyAgent } = await supabase
    .from('agentes')
    .select('id, nome, prompt_base, personalidade, contexto_negocio, is_default_chat_agent, welcome_message, response_delay_ms, initial_greeting')
    .eq('empresa_id', empresaId)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return anyAgent as Agent | null;
}

// Get the response delay with priority fallback
function getResponseDelayMs(agent: Agent | null, empresa: Empresa): number {
  // Priority 1: Agent's response delay
  if (agent?.response_delay_ms != null && agent.response_delay_ms > 0) {
    return agent.response_delay_ms;
  }

  // Priority 2: Empresa's default response delay
  if (empresa.default_response_delay_ms != null && empresa.default_response_delay_ms > 0) {
    return empresa.default_response_delay_ms;
  }

  // Priority 3: Platform default
  return PLATFORM_DEFAULT_RESPONSE_DELAY_MS;
}

// Get the welcome message with priority fallback
function getWelcomeMessage(agent: Agent | null, empresa: Empresa): string {
  // Priority 1: Agent's welcome message
  if (agent?.welcome_message?.trim()) {
    return agent.welcome_message.trim();
  }

  // Priority 2: Empresa's default welcome message
  if (empresa.default_welcome_message?.trim()) {
    return empresa.default_welcome_message.trim();
  }

  // Priority 3: Platform default
  return PLATFORM_DEFAULT_WELCOME;
}

// deno-lint-ignore no-explicit-any
async function handleSendMessage(
  supabase: any,
  empresa: Empresa,
  sessionId: string,
  conversationId: string | undefined,
  content: string,
  corsHeaders: Record<string, string>
) {
  if (!content?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Message content is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let activeConversationId = conversationId;
  let isNewConversation = false;

  // Create conversation if it doesn't exist
  if (!activeConversationId) {
    // Check for recently closed conversation to reopen (within 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentClosed } = await supabase
      .from('conversations')
      .select('id, closed_at')
      .eq('empresa_id', empresa.id)
      .eq('client_identifier', sessionId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentClosed && recentClosed.closed_at && recentClosed.closed_at > twentyFourHoursAgo) {
      // Reopen the recently closed conversation
      const { error: reopenErr } = await supabase
        .from('conversations')
        .update({
          status: 'ai_active',
          owner: 'ai',
          last_message_at: new Date().toISOString(),
          closed_at: null,
          closed_by: null,
          closure_reason: null,
          closure_note: null,
        })
        .eq('id', recentClosed.id);

      if (!reopenErr) {
        activeConversationId = recentClosed.id;
        console.log(`[Conversation] Reopened closed conversation: ${recentClosed.id}`);
      } else {
        console.error('[Conversation] Failed to reopen, will create new:', reopenErr);
      }
    }

    if (!activeConversationId) {
      isNewConversation = true;

      // Resolve customer identity from session (widget identifier)
      let customerId: string | null = null;
      try {
        customerId = await resolveCustomerId(supabase, empresa.id, 'widget', sessionId);
      } catch (e) {
        console.error('[CustomerIdentity] Resolution failed, continuing without:', e);
      }

      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          empresa_id: empresa.id,
          client_identifier: sessionId,
          owner: 'ai',
          status: 'ai_active',
          channel: 'chat',
          ...(customerId ? { customer_id: customerId } : {}),
        })
        .select('id')
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      activeConversationId = (newConversation as { id: string }).id;

      // === CUSTOMER MEMORY INJECTION ===
      if (customerId) {
        try {
          const { data: lastClosed } = await supabase
            .from('conversations')
            .select('id, summary, main_intent, result')
            .eq('customer_id', customerId)
            .eq('status', 'closed')
            .not('summary', 'is', null)
            .neq('id', activeConversationId)
            .order('closed_at', { ascending: false })
            .limit(1)
            .single();

          if (lastClosed?.summary) {
            await supabase
              .from('conversations')
              .update({
                conversation_context: {
                  previous_interaction: {
                    summary: lastClosed.summary,
                    main_intent: lastClosed.main_intent || null,
                    result: lastClosed.result || null,
                  },
                },
              })
              .eq('id', activeConversationId);
            console.log(`[CustomerMemory] Injected previous interaction context for customer ${customerId}`);
          }
        } catch (e) {
          console.error('[CustomerMemory] Failed to inject, continuing:', e);
        }
      }
    }
  } else {
    // Verify the conversation belongs to this session
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('client_identifier')
      .eq('id', activeConversationId)
      .single();

    const convData = existingConv as Conversation | null;
    if (!convData || convData.client_identifier !== sessionId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Get the default chat agent for this empresa
  const agent = await getDefaultChatAgent(supabase, empresa.id);

  // If this is a new conversation, insert dynamic guided greeting (ONLY greeting)
    let welcomeMessage = null;
    let guidedGreetingMessage = null;
    if (isNewConversation) {
      // === DYNAMIC GUIDED GREETING: Query active services for menu ===
      const empresaName = empresa.nome || 'nossa empresa';
      const agentName = agent?.nome || 'Assistente';
      
      // Resolve greeting template from agent or use default
      const greetingTemplate = agent?.initial_greeting?.trim() 
        || `Olá! 👋\nSou o assistente virtual da {empresa}.\n\nPosso ajudar com informações, preços ou marcação de atendimento.`;
      
      // Replace variables
      const resolvedGreeting = greetingTemplate
        .replace(/\{empresa\}/g, empresaName)
        .replace(/\{agente\}/g, agentName);
      
      const { data: menuServices } = await supabase
        .from('scheduling_services')
        .select('id, name')
        .eq('empresa_id', empresa.id)
        .eq('status', 'active')
        .eq('show_in_chat_menu', true)
        .order('priority', { ascending: true })
        .limit(3);

      const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
      let menuLines = '';
      const serviceMap: Record<string, string> = {}; // option_number → service_id
      
      if (menuServices && menuServices.length > 0) {
        menuLines = menuServices.map((svc: { id: string; name: string }, idx: number) => {
          serviceMap[String(idx + 1)] = svc.id;
          return `${numberEmojis[idx]} ${svc.name}`;
        }).join('\n');
      }
      
      // Always add "Falar com a equipa" as last option
      const equipaOptionNum = (menuServices?.length || 0) + 1;
      const equipaEmoji = numberEmojis[equipaOptionNum - 1] || `${equipaOptionNum}️⃣`;
      menuLines += `\n${equipaEmoji} Falar com a equipa`;
      serviceMap[String(equipaOptionNum)] = '_human_escalation';
      
      const menuIntro = 'Como prefere começar?';
      const guidedContent = `${resolvedGreeting}\n\n${menuIntro}\n\n${menuLines}`;

      const { data: guidedMsg, error: guidedError } = await supabase
        .from('messages')
        .insert({
          conversation_id: activeConversationId,
          sender_type: 'ai',
          content: guidedContent,
          is_internal: false,
        })
        .select('id, sender_type, content, created_at')
        .single();

      if (guidedError) {
        console.error('Error inserting guided greeting:', guidedError);
      } else {
        guidedGreetingMessage = guidedMsg;
        // Mark guided greeting as sent + store service map in conversation context
        await supabase
          .from('conversations')
          .update({ conversation_context: { _guided_greeting_sent: true, _guided_service_map: serviceMap } })
          .eq('id', activeConversationId);
        // Register credit for guided message
        try {
          await registerCreditUsage(supabase, empresa.id, 'message', guidedMsg.id);
        } catch {}
      }
    }

  // Insert client message
  const { data: clientMessage, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: activeConversationId,
      sender_type: 'client',
      content: content.trim(),
      is_internal: false,
    })
    .select('id, sender_type, content, created_at')
    .single();

  if (msgError) {
    console.error('Error inserting message:', msgError);
    return new Response(
      JSON.stringify({ error: 'Failed to send message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', activeConversationId);

  // Update customer last_seen_at if linked
  const { data: convForCustomer } = await supabase
    .from('conversations')
    .select('customer_id')
    .eq('id', activeConversationId)
    .single();
  if (convForCustomer?.customer_id) {
    await supabase
      .from('customers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', convForCustomer.customer_id);
  }

  // Fetch conversation to check if AI should respond
  const { data: conversation } = await supabase
    .from('conversations')
    .select('owner, status, empresa_id')
    .eq('id', activeConversationId)
    .single();

  const convData = conversation as { owner: string; status: string; empresa_id: string } | null;

  // Trigger AI response via chat-ai-response edge function if conversation is AI-owned
  let aiMessage = null;
  if (convData?.owner === 'ai') {
    aiMessage = await delegateToAIResponse(supabase, activeConversationId!, content);
  }

  // Get the response delay configuration
  const responseDelayMs = getResponseDelayMs(agent, empresa);

  return new Response(
    JSON.stringify({
      conversationId: activeConversationId,
      welcomeMessage,
      guidedGreetingMessage,
      clientMessage,
      aiMessage,
      responseDelayMs,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Delegate AI response generation to chat-ai-response edge function
// This ensures all tool-calling, scheduling, booking recovery, and dynamic provider resolution
// are handled in a single place.
// deno-lint-ignore no-explicit-any
async function delegateToAIResponse(
  supabase: any,
  conversationId: string,
  userMessage: string
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log(`[AI] Delegating to chat-ai-response for conversation: ${conversationId}`);

    const response = await fetch(`${supabaseUrl}/functions/v1/chat-ai-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        conversationId,
        message: userMessage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI] chat-ai-response error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    console.log('[AI] chat-ai-response completed successfully');

    // The edge function inserts the AI message and registers credits.
    // Fetch the latest AI message to return to the frontend.
    const { data: latestAiMessage } = await supabase
      .from('messages')
      .select('id, sender_type, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'ai')
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return latestAiMessage || null;
  } catch (error) {
    console.error('[AI] Failed to delegate to chat-ai-response:', error);
    return null;
  }
}

/**
 * Register credit usage for an action.
 * This is called ONLY after the action succeeds.
 * Uses reference_id for idempotency to prevent double-charging.
 */
// deno-lint-ignore no-explicit-any
async function registerCreditUsage(
  supabase: any,
  empresaId: string,
  eventType: string,
  referenceId: string
) {
  // Credit values (should match src/lib/credits.ts)
  const CREDIT_VALUES: Record<string, number> = {
    message: 1,
    call_completed: 30,
    call_short: 5,
    agent_test: 1,
    email: 0,
    knowledge: 0,
  };

  const creditsConsumed = CREDIT_VALUES[eventType] || 0;
  
  if (creditsConsumed === 0) {
    console.log(`[Credits] Skipping ${eventType} - 0 credits`);
    return;
  }

  // Defensive: require empresa context
  if (!empresaId) {
    console.error('[Credits] BLOCKED: Missing empresa_id');
    return;
  }

  // Defensive: require reference for idempotency
  if (!referenceId) {
    console.error('[Credits] BLOCKED: Missing reference_id');
    return;
  }

  // Check for duplicate (idempotency)
  const { data: existing } = await supabase
    .from('credits_events')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('event_type', eventType)
    .eq('reference_id', referenceId)
    .maybeSingle();

  if (existing) {
    console.log(`[Credits] BLOCKED: Already registered ${eventType} for ${referenceId}`);
    return;
  }

  // Insert credit event
  const { error: eventError } = await supabase
    .from('credits_events')
    .insert({
      empresa_id: empresaId,
      event_type: eventType,
      credits_consumed: creditsConsumed,
      reference_id: referenceId,
      metadata: { registered_at: new Date().toISOString() },
    });

  if (eventError) {
    console.error('[Credits] Failed to insert event:', eventError);
    return;
  }

  // Update or create usage record
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  
  const { data: existingUsage } = await supabase
    .from('credits_usage')
    .select('id, credits_used')
    .eq('empresa_id', empresaId)
    .eq('month', currentMonth)
    .maybeSingle();

  if (existingUsage) {
    await supabase
      .from('credits_usage')
      .update({ 
        credits_used: existingUsage.credits_used + creditsConsumed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingUsage.id);
  } else {
    await supabase
      .from('credits_usage')
      .insert({
        empresa_id: empresaId,
        month: currentMonth,
        credits_used: creditsConsumed,
        credits_limit: 1000, // Default
      });
  }

  console.log(`[Credits] ✓ Registered: ${eventType} = ${creditsConsumed} credits for empresa ${empresaId}`);
}