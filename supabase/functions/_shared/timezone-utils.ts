/**
 * Timezone Utilities v1.0
 * 
 * All scheduling operations MUST use Europe/Lisbon timezone.
 * This module is the SINGLE SOURCE OF TRUTH for timezone conversions.
 */

export interface LisbonParts {
  hours: number;
  minutes: number;
  dayOfWeek: number;
  dateStr: string;   // YYYY-MM-DD
  timeStr: string;   // HH:mm
}

/**
 * Convert a Date to Europe/Lisbon timezone components.
 * Handles DST transitions automatically via Intl API.
 */
export function toLisbonParts(date: Date): LisbonParts {
  const lisbonStr = date.toLocaleString('en-GB', { timeZone: 'Europe/Lisbon' });
  // en-GB format: "DD/MM/YYYY, HH:mm:ss"
  const parts = lisbonStr.split(', ');
  const [day, month, year] = parts[0].split('/');
  const [h, m] = parts[1].split(':').map(Number);
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Compute dayOfWeek from the Lisbon-local date
  const lisbonDate = new Date(`${dateStr}T12:00:00`);
  const dayOfWeek = lisbonDate.getDay();

  return { hours: h, minutes: m, dayOfWeek, dateStr, timeStr };
}
