/**
 * Scheduling Availability & Resource Types - Frontend
 * 
 * Mirrors backend types for use in UI components.
 */

export interface SchedulingResource {
  id: string;
  empresa_id: string;
  name: string;
  type: 'person' | 'room' | 'equipment';
  status: 'active' | 'inactive';
  default_appointment_duration_minutes: number;
  calendar_type: string;
  external_calendar_id: string | null;
  priority: number;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  resource_id: string;
  resource_name: string;
  duration_minutes: number;
}

export interface ViewAvailabilityResult {
  success: boolean;
  slots: AvailabilitySlot[];
  resources_evaluated: string[];
  resolved_duration_minutes: number;
  message: string;
  error_code?: string;
}

export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  person: 'Pessoa',
  room: 'Sala',
  equipment: 'Equipamento',
};

export const CALENDAR_TYPE_LABELS: Record<string, string> = {
  internal: 'Interno',
  google: 'Google Calendar',
  outlook: 'Outlook',
  calendly: 'Calendly',
};

export const DURATION_RESOLUTION_ORDER = [
  'Duração explícita do workflow',
  'Duração padrão do recurso',
  'Duração padrão da empresa',
  'Duração padrão do sistema (30 min)',
] as const;
