import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const checks: Record<string, number> = {};

    // 1. Closed conversations without result
    const { data: closedWithoutResult } = await supabase
      .from("conversations")
      .select("id")
      .eq("status", "closed")
      .is("result", null);

    checks["closed_without_result"] = closedWithoutResult?.length || 0;

    // 2. booking_active without appointment_id in context
    const { data: activeBookings } = await supabase
      .from("conversations")
      .select("id, conversation_context")
      .eq("conversation_state", "booking_active");

    checks["booking_active_without_appointment"] = (activeBookings || []).filter(
      (c: any) => !c.conversation_context?.appointment_id
    ).length;

    // 3. booking_active without confirmed_snapshot in context
    checks["booking_active_without_snapshot"] = (activeBookings || []).filter(
      (c: any) => !c.conversation_context?.confirmed_snapshot
    ).length;

    // 4. State/status mismatch: state says idle but status is closed
    const { data: stateMismatch } = await supabase
      .from("conversations")
      .select("id")
      .eq("conversation_state", "idle")
      .eq("status", "closed");

    checks["idle_closed_mismatch"] = stateMismatch?.length || 0;

    // 5. Duplicate appointments (RPC)
    const { data: duplicateAppointments } = await supabase.rpc(
      "check_duplicate_appointments"
    );

    checks["duplicate_appointments"] = duplicateAppointments?.length || 0;

    // 6. Stuck booking_processing > 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: stuckProcessing } = await supabase
      .from("conversations")
      .select("id")
      .eq("conversation_state", "booking_processing")
      .lt("last_message_at", fiveMinutesAgo);

    checks["stuck_booking_processing"] = stuckProcessing?.length || 0;

    // 7. awaiting_slot_selection without conflict_suggestions
    const { data: slotSelectionNoSuggestions } = await supabase
      .from("conversations")
      .select("id, conversation_context")
      .eq("conversation_state", "awaiting_slot_selection");

    checks["awaiting_slot_selection_without_suggestions"] = (slotSelectionNoSuggestions || []).filter(
      (c: any) => {
        const ctx = c.conversation_context || {};
        const suggestions = ctx.conflict_suggestions;
        return !suggestions || (Array.isArray(suggestions) && suggestions.length === 0);
      }
    ).length;

    const totalIssues = Object.values(checks).reduce((a, b) => a + b, 0);

    return new Response(
      JSON.stringify({
        status: totalIssues === 0 ? "healthy" : "issues_detected",
        total_issues: totalIssues,
        checks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: error.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
