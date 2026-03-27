/**
 * Check Availability Edge Function v1.0
 * 
 * Deterministic availability check + multi-day slot suggestion engine.
 * Uses existing checkInternalAvailability (multi-resource v2) for each candidate slot.
 * 
 * INPUT:
 * {
 *   company_id: string,
 *   service_id: string,
 *   requested_start?: string (ISO 8601),
 *   max_suggestions?: number (default 3, max 5),
 *   search_days?: number (default 7, max 7)
 * }
 * 
 * OUTPUT:
 * {
 *   requested_available: boolean,
 *   suggestions: [{ start_datetime, end_datetime }]
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checkInternalAvailability,
  type InternalAvailabilityResult,
} from '../_shared/scheduling-actions.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Hard limits
const MAX_SUGGESTIONS = 10;
const MAX_SEARCH_DAYS = 14;

interface BusinessHourRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

interface SuggestionSlot {
  start_datetime: string;
  end_datetime: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      company_id,
      service_id,
      requested_start,
      max_suggestions = 3,
      search_days = 7,
    } = await req.json();

    if (!company_id || !service_id) {
      return new Response(
        JSON.stringify({ error: 'company_id and service_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const effectiveMaxSuggestions = Math.min(Math.max(1, max_suggestions), MAX_SUGGESTIONS);
    const effectiveSearchDays = Math.min(Math.max(1, search_days), MAX_SEARCH_DAYS);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: If requested_start provided, check if it's available
    if (requested_start) {
      const result: InternalAvailabilityResult = await checkInternalAvailability(
        supabase, company_id, service_id, requested_start
      );

      if (result.available) {
        return new Response(
          JSON.stringify({ requested_available: true, suggestions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 2: Pre-check — verify resources exist before entering slot loop
    const { data: activeResources } = await supabase
      .from('scheduling_resources')
      .select('id')
      .eq('empresa_id', company_id)
      .eq('status', 'active')
      .limit(1);

    if (!activeResources || activeResources.length === 0) {
      // Also check service-resource links
      const { data: svcResLinks } = await supabase
        .from('scheduling_service_resources')
        .select('resource_id')
        .eq('service_id', service_id)
        .limit(1);

      if (!svcResLinks || svcResLinks.length === 0) {
        return new Response(
          JSON.stringify({ requested_available: false, suggestions: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 3: Generate suggestions
    // Fetch service details
    const { data: service } = await supabase
      .from('scheduling_services')
      .select('id, duration_minutes, buffer_before_minutes, buffer_after_minutes')
      .eq('id', service_id)
      .eq('status', 'active')
      .single();

    const durationMinutes = service?.duration_minutes || 30;
    const bufferBefore = service?.buffer_before_minutes || 0;
    const bufferAfter = service?.buffer_after_minutes || 0;

    // Fetch slot_increment_minutes from empresa
    const { data: empresaConfig } = await supabase
      .from('empresas')
      .select('slot_increment_minutes')
      .eq('id', company_id)
      .single();
    const slotIncrement = empresaConfig?.slot_increment_minutes || 15;

    // Fetch business hours
    const { data: businessHoursData } = await supabase
      .from('scheduling_business_hours')
      .select('day_of_week, start_time, end_time, is_closed')
      .eq('empresa_id', company_id);
    const businessHours: BusinessHourRow[] = businessHoursData || [];
    const bhMap = new Map<number, BusinessHourRow>();
    for (const bh of businessHours) {
      bhMap.set(bh.day_of_week, bh);
    }

    // Fetch booking_configuration for minimum_advance_minutes
    const { data: bookingConfig } = await supabase
      .from('booking_configuration')
      .select('minimum_advance_minutes')
      .eq('empresa_id', company_id)
      .maybeSingle();
    const minimumAdvanceMinutes = bookingConfig?.minimum_advance_minutes || 0;

    const now = new Date();
    const suggestions: SuggestionSlot[] = [];

    // Iterate day by day
    for (let dayOffset = 0; dayOffset < effectiveSearchDays; dayOffset++) {
      if (suggestions.length >= effectiveMaxSuggestions) break;

      const currentDay = new Date(now);
      currentDay.setDate(currentDay.getDate() + dayOffset);
      const dayOfWeek = currentDay.getDay();
      const dayStr = currentDay.toISOString().split('T')[0];

      // Resolve business hours for this day
      const bh = bhMap.get(dayOfWeek);
      let workStartHour = 9, workStartMin = 0, workEndHour = 18, workEndMin = 0;
      let isClosed = dayOfWeek === 0 || dayOfWeek === 6; // default weekends closed

      if (bh) {
        if (bh.is_closed) {
          isClosed = true;
        } else {
          isClosed = false;
          const [sh, sm] = bh.start_time.split(':').map(Number);
          const [eh, em] = bh.end_time.split(':').map(Number);
          workStartHour = sh; workStartMin = sm || 0;
          workEndHour = eh; workEndMin = em || 0;
        }
      }

      if (isClosed) continue;

      // Calculate day boundaries
      const dayStart = new Date(`${dayStr}T${String(workStartHour).padStart(2, '0')}:${String(workStartMin).padStart(2, '0')}:00`);
      const dayEnd = new Date(`${dayStr}T${String(workEndHour).padStart(2, '0')}:${String(workEndMin).padStart(2, '0')}:00`);

      // Determine the earliest valid cursor for this day
      const totalBlockMinutes = bufferBefore + durationMinutes + bufferAfter;
      const earliestAllowed = new Date(now.getTime() + minimumAdvanceMinutes * 60000);

      let cursor = new Date(dayStart);

      // If today, skip past current time + minimum advance
      if (dayOffset === 0 && earliestAllowed > cursor) {
        // Round up to next slot increment
        const msSinceStart = earliestAllowed.getTime() - dayStart.getTime();
        const slotMs = slotIncrement * 60000;
        const slotsElapsed = Math.ceil(msSinceStart / slotMs);
        cursor = new Date(dayStart.getTime() + slotsElapsed * slotMs);
      }

      // Generate candidate slots for this day
      while (cursor.getTime() + totalBlockMinutes * 60000 <= dayEnd.getTime()) {
        if (suggestions.length >= effectiveMaxSuggestions) break;

        const slotStart = new Date(cursor.getTime() + bufferBefore * 60000);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

        // Ensure slot end + buffer doesn't exceed business hours
        if (slotEnd.getTime() + bufferAfter * 60000 > dayEnd.getTime()) {
          break;
        }

        // Ensure not in the past
        if (slotStart <= now) {
          cursor = new Date(cursor.getTime() + slotIncrement * 60000);
          continue;
        }

        // Skip the exact requested_start if it was already checked and unavailable
        if (requested_start) {
          const reqStart = new Date(requested_start);
          if (Math.abs(slotStart.getTime() - reqStart.getTime()) < 60000) {
            cursor = new Date(cursor.getTime() + slotIncrement * 60000);
            continue;
          }
        }

        // Check multi-resource availability via existing engine
        const availability: InternalAvailabilityResult = await checkInternalAvailability(
          supabase, company_id, service_id, slotStart.toISOString()
        );

        if (availability.available) {
          suggestions.push({
            start_datetime: availability.start_datetime || slotStart.toISOString(),
            end_datetime: availability.end_datetime || slotEnd.toISOString(),
          });
        }

        cursor = new Date(cursor.getTime() + slotIncrement * 60000);
      }
    }

    return new Response(
      JSON.stringify({
        requested_available: false,
        suggestions,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[check-availability] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
