const SUSPICIOUS_TLDS = ['cococ', 'con', 'coom', 'comm', 'gmai', 'gmial'];

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!regex.test(trimmed)) return false;
  const tld = trimmed.split('.').pop()!.toLowerCase();
  if (SUSPICIOUS_TLDS.includes(tld)) return false;
  return true;
}

export function isValidPhonePT(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  const regex = /^(\+351|00351)?[239]\d{8}$/;
  return regex.test(cleaned);
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+351')) return cleaned;
  if (cleaned.startsWith('00351')) return '+351' + cleaned.slice(5);
  if (cleaned.length === 9) return '+351' + cleaned;
  return cleaned;
}

export function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function isDateInPast(dateStr: string, timezone: string = 'Europe/Lisbon'): boolean {
  const now = new Date();
  const date = new Date(dateStr + 'T00:00:00');
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
  return dateStr < todayStr;
}

export function isValidTimeSlot(time: string): boolean {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 500);
}

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return false;
  return /[a-zA-ZÀ-ÿ]/.test(trimmed);
}

export function normalizeName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
