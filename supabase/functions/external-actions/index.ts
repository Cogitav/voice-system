/**
 * External Actions Edge Function
 * 
 * POST /external-actions/execute
 * 
 * This is the ONLY gateway for all external action executions.
 * It receives action requests from internal platform services
 * and forwards them to the configured external executor.
 * 
 * SECURITY:
 * - Requires valid Supabase service role or authenticated user
 * - All requests are scoped by company_id
 * - Full audit logging
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  executeExternalAction,
  getBridgeInfo,
  isBridgeConfigured,
  ExternalActionType,
  ExternalProvider,
} from '../_shared/external-actions-bridge.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // GET /external-actions/status - Health check
    if (req.method === 'GET' && path === 'status') {
      const bridgeInfo = getBridgeInfo();
      
      return new Response(
        JSON.stringify({
          status: 'ok',
          bridge: bridgeInfo,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // POST /external-actions/execute - Execute action
    if (req.method === 'POST') {
      const body = await req.json();

      // Validate required fields
      if (!body.action_type || !body.provider || !body.company_id) {
        return new Response(
          JSON.stringify({
            error: 'Missing required fields',
            required: ['action_type', 'provider', 'company_id'],
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate action_type
      const validActionTypes: ExternalActionType[] = [
        'create_calendar_event',
        'update_calendar_event',
        'delete_calendar_event',
        'send_email',
        'create_crm_record',
        'update_crm_record',
      ];

      if (!validActionTypes.includes(body.action_type)) {
        return new Response(
          JSON.stringify({
            error: 'Invalid action_type',
            valid_types: validActionTypes,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate provider
      const validProviders: ExternalProvider[] = [
        'google_calendar',
        'outlook_calendar',
        'calendly',
        'gmail',
        'outlook_mail',
        'hubspot',
        'salesforce',
      ];

      if (!validProviders.includes(body.provider)) {
        return new Response(
          JSON.stringify({
            error: 'Invalid provider',
            valid_providers: validProviders,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate company exists
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('id', body.company_id)
        .single();

      if (empresaError || !empresa) {
        return new Response(
          JSON.stringify({
            error: 'Company not found',
            company_id: body.company_id,
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(`[ExternalActions] Processing request for company: ${empresa.nome}`);

      // Execute the action
      const result = await executeExternalAction(supabase, {
        action_type: body.action_type,
        provider: body.provider,
        company_id: body.company_id,
        conversation_id: body.conversation_id || null,
        agent_id: body.agent_id || null,
        payload: body.payload || {},
      });

      return new Response(
        JSON.stringify(result),
        {
          status: result.success ? 200 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[ExternalActions] Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
