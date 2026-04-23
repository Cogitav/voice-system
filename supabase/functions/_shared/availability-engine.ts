import { getServiceClient } from './supabase-client.ts';
import { SlotSuggestion } from './types.ts';

interface AvailabilityRequest {
  empresa_id: string;
  service_id: string;
  date: string;
  timezone: string;
  allow_same_day?: boolean;
  minimum_advance_minutes?: number;
  preferred_time?: string;
}

interface AvailabilityResult {
  slots: SlotSuggestion[];
  has_availability: boolean;
  date_checked: string;
  preferred_time_unavailable?: boolean;
}

interface BusinessHours {
  start_time: string;
  end_time: string;
  is_closed: boolean;
}

interface Resource {
  id: string;
  name: string;
  capacity: number;
}

interface ExistingBooking {
  id: string;
  start_datetime: string;
  end_datetime: string;
  resource_id: string;
  estado?: string | null;
  scheduling_state?: string | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDisplayLabel(date: string, startTime: string, endTime: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const d = new Date(year, month - 1, day);
  const weekday = weekdays[d.getDay()];
  const monthName = months[month - 1];
  return `${weekday}, ${day} de ${monthName} — ${startTime}`;
}

export async function checkAvailability(req: AvailabilityRequest): Promise<AvailabilityResult> {
  const db = getServiceClient();

  const dateObj = new Date(req.date + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();

  const { data: businessHoursData } = await db
    .from('scheduling_business_hours')
    .select('start_time, end_time, is_closed')
    .eq('empresa_id', req.empresa_id)
    .eq('day_of_week', dayOfWeek)
    .single();

  const businessHours: BusinessHours = businessHoursData ?? {
    start_time: '09:00',
    end_time: '18:00',
    is_closed: false,
  };

  if (businessHours.is_closed) {
    return { slots: [], has_availability: false, date_checked: req.date };
  }

  const { data: serviceData } = await db
    .from('scheduling_services')
    .select('duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', req.service_id)
    .eq('empresa_id', req.empresa_id)
    .single();

  if (!serviceData) {
    return { slots: [], has_availability: false, date_checked: req.date };
  }

  const duration = serviceData.duration_minutes ?? 30;
  const bufferBefore = serviceData.buffer_before_minutes ?? 0;
  const bufferAfter = serviceData.buffer_after_minutes ?? 0;
  const totalSlotTime = bufferBefore + duration + bufferAfter;

  const { data: resourceLinks } = await db
    .from('scheduling_service_resources')
    .select('resource_id, scheduling_resources(id, name, capacity)')
    .eq('service_id', req.service_id)
    .eq('is_required', true);

  let resources: Resource[] = [];
  if (resourceLinks && resourceLinks.length > 0) {
    resources = resourceLinks
      .map((r: any) => r.scheduling_resources)
      .filter(Boolean)
      .map((r: any) => ({ id: r.id, name: r.name, capacity: r.capacity ?? 1 }));
  }

  const { data: existingBookings } = await db
    .from('agendamentos')
    .select('id, start_datetime, end_datetime, resource_id, estado, scheduling_state')
    .eq('empresa_id', req.empresa_id)
    .gte('start_datetime', req.date + 'T00:00:00Z')
    .lt('start_datetime', req.date + 'T23:59:59Z')
    .not('estado', 'eq', 'cancelado')
    .not('scheduling_state', 'eq', 'cancelled');

  const bookings: ExistingBooking[] = existingBookings ?? [];

  const startMinutes = timeToMinutes(businessHours.start_time);
  const endMinutes = timeToMinutes(businessHours.end_time);
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: req.timezone });
  const isToday = req.date === todayStr;

  const slots: SlotSuggestion[] = [];
  let cursor = startMinutes;

  while (cursor + totalSlotTime <= endMinutes) {
    const slotStart = cursor + bufferBefore;
    const slotEnd = slotStart + duration;

    if (isToday && !(req.allow_same_day ?? true)) {
      cursor += 30;
      continue;
    }
    if (isToday) {
      const advanceBuffer = req.minimum_advance_minutes ?? 30;
      const nowMinutes = now.getHours() * 60 + now.getMinutes() + advanceBuffer;
      if (slotStart <= nowMinutes) {
        cursor += 30;
        continue;
      }
    }

    const slotStartISO = `${req.date}T${minutesToTime(slotStart)}:00.000Z`;
    const slotEndISO = `${req.date}T${minutesToTime(slotEnd)}:00.000Z`;
    const overlappingRows = bookings.filter((booking) => {
      const bookingStart = new Date(booking.start_datetime).getTime();
      const bookingEnd = new Date(booking.end_datetime).getTime();
      const candidateStart = new Date(slotStartISO).getTime();
      const candidateEnd = new Date(slotEndISO).getTime();
      return candidateStart < bookingEnd && candidateEnd > bookingStart;
    });

    let isAvailable = true;

    if (resources.length > 0) {
      for (const resource of resources) {
        const conflicts = bookings.filter(b => {
          if (b.resource_id !== resource.id) return false;
          const bStart = new Date(b.start_datetime).getTime();
          const bEnd = new Date(b.end_datetime).getTime();
          const sStart = new Date(slotStartISO).getTime();
          const sEnd = new Date(slotEndISO).getTime();
          return sStart < bEnd && sEnd > bStart;
        });
        if (conflicts.length >= resource.capacity) {
          isAvailable = false;
          break;
        }
      }
    } else {
      const conflicts = bookings.filter(b => {
        const bStart = new Date(b.start_datetime).getTime();
        const bEnd = new Date(b.end_datetime).getTime();
        const sStart = new Date(slotStartISO).getTime();
        const sEnd = new Date(slotEndISO).getTime();
        return sStart < bEnd && sEnd > bStart;
      });
      if (conflicts.length > 0) isAvailable = false;
    }

    if (isAvailable) {
      console.log('[FLOW_DEBUG_AVAILABILITY_SOURCE]', JSON.stringify({
        start: slotStartISO,
        end: slotEndISO,
        resource_id: resources[0]?.id ?? '',
        timezone: req.timezone,
        query_filters: {
          empresa_id: req.empresa_id,
          service_id: req.service_id,
          date: req.date,
          start_gte: req.date + 'T00:00:00Z',
          start_lt: req.date + 'T23:59:59Z',
          excluded_estado: 'cancelado',
          excluded_scheduling_state: 'cancelled',
          preferred_time: req.preferred_time ?? null,
        },
        conflicting_rows: overlappingRows.map((booking) => ({
          id: booking.id,
          start: booking.start_datetime,
          end: booking.end_datetime,
          resource_id: booking.resource_id,
          estado: booking.estado ?? null,
          scheduling_state: booking.scheduling_state ?? null,
        })),
      }));

      slots.push({
        start: slotStartISO,
        end: slotEndISO,
        resource_id: resources[0]?.id ?? '',
        display_label: formatDisplayLabel(req.date, minutesToTime(slotStart), minutesToTime(slotEnd)),
      });
    }

    cursor += 30;
  }

  // If user requested a specific time, check if it exists
  if (req.preferred_time) {
    const prefHour = req.preferred_time.slice(0, 2);
    const prefMin = req.preferred_time.slice(3, 5) ?? '00';
    const prefTimeStr = `${prefHour}:${prefMin}`;

    // Find exact match
    const exactMatch = slots.find(s => s.display_label.includes(prefTimeStr));

    if (exactMatch) {
      // Requested time is available - return it as first option + 4 alternatives
      const alternatives = slots.filter(s => !s.display_label.includes(prefTimeStr)).slice(0, 4);
      return { slots: [exactMatch, ...alternatives], has_availability: true, date_checked: req.date };
    } else {
      // Requested time not available - return 5 alternatives
      return { slots: slots.slice(0, 5), has_availability: slots.length > 0, date_checked: req.date, preferred_time_unavailable: true };
    }
  }

  // No preferred time - return first 5 slots
  return { slots: slots.slice(0, 5), has_availability: slots.length > 0, date_checked: req.date };
}

export async function findNextAvailableDays(
  empresaId: string,
  serviceId: string,
  fromDate: string,
  timezone: string,
  maxDays: number = 5,
  allowSameDay: boolean = true,
  minimumAdvanceMinutes: number = 0
): Promise<AvailabilityResult[]> {
  const results: AvailabilityResult[] = [];
  const start = new Date(fromDate + 'T12:00:00');
  let checked = 0;
  let daysScanned = 0;

  while (results.length < maxDays && daysScanned < 30) {
    const d = new Date(start);
    d.setDate(start.getDate() + daysScanned);
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: timezone });

    const result = await checkAvailability({
      empresa_id: empresaId,
      service_id: serviceId,
      date: dateStr,
      timezone,
      allow_same_day: allowSameDay,
      minimum_advance_minutes: minimumAdvanceMinutes,
    });

    if (result.has_availability) {
      results.push(result);
    }

    daysScanned++;
  }

  return results;
}
