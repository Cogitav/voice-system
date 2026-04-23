export interface ParsedDateTime {
  date: string | null;   // YYYY-MM-DD
  time: string | null;   // HH:MM
  raw_match: string;
}

export function parseDateTime(text: string, referenceDate: Date, timezone: string = 'Europe/Lisbon'): ParsedDateTime {
  const input = text.toLowerCase().trim();
  const todayStr = referenceDate.toLocaleDateString('en-CA', { timeZone: timezone });
  const today = new Date(todayStr + 'T12:00:00');

  let date: string | null = null;
  let time: string | null = null;
  let raw_match = '';

  // TIME PATTERNS
  const timePatterns = [
    { regex: /\bàs?\s*(\d{1,2})h(\d{2})\b/, handler: (m: RegExpMatchArray) => `${m[1].padStart(2,'0')}:${m[2]}` },
    { regex: /\bàs?\s*(\d{1,2}):(\d{2})\b/, handler: (m: RegExpMatchArray) => `${m[1].padStart(2,'0')}:${m[2]}` },
    { regex: /\bàs?\s*(\d{1,2})h\b/, handler: (m: RegExpMatchArray) => `${m[1].padStart(2,'0')}:00` },
    { regex: /\b(\d{1,2})\s*da\s*(manhã|tarde|noite)\b/, handler: (m: RegExpMatchArray) => {
      let h = parseInt(m[1]);
      if (m[2] === 'tarde' && h < 12) h += 12;
      if (m[2] === 'noite' && h < 12) h += 12;
      return `${String(h).padStart(2,'0')}:00`;
    }},
    { regex: /\b(\d{1,2}):(\d{2})\b/, handler: (m: RegExpMatchArray) => `${m[1].padStart(2,'0')}:${m[2]}` },
  ];

  for (const p of timePatterns) {
    const m = input.match(p.regex);
    if (m) { time = p.handler(m); raw_match += m[0] + ' '; break; }
  }

  // DATE PATTERNS
  if (/\bhoje\b/.test(input)) {
    date = todayStr; raw_match += 'hoje';
  } else if (/\bamanh[ãa]\b/.test(input)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    date = d.toLocaleDateString('en-CA', { timeZone: timezone }); raw_match += 'amanhã';
  } else if (/\bdepois\s+de\s+amanh[ãa]\b/.test(input)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    date = d.toLocaleDateString('en-CA', { timeZone: timezone }); raw_match += 'depois de amanhã';
  } else if (/\bpr[oó]xima?\s+semana\b/.test(input)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    date = d.toLocaleDateString('en-CA', { timeZone: timezone }); raw_match += 'próxima semana';
  } else if (/\bdaqui\s+a\s+(\d+)\s+dias?\b/.test(input)) {
    const m = input.match(/\bdaqui\s+a\s+(\d+)\s+dias?\b/);
    if (m) {
      const d = new Date(today); d.setDate(d.getDate() + parseInt(m[1]));
      date = d.toLocaleDateString('en-CA', { timeZone: timezone }); raw_match += m[0];
    }
  } else {
    const weekdays: Record<string, number> = {
      'domingo': 0, 'segunda': 1, 'segunda-feira': 1, 'terça': 2, 'terca': 2,
      'terça-feira': 2, 'terca-feira': 2, 'quarta': 3, 'quarta-feira': 3,
      'quinta': 4, 'quinta-feira': 4, 'sexta': 5, 'sexta-feira': 5, 'sábado': 6, 'sabado': 6,
    };
    for (const [name, dayNum] of Object.entries(weekdays)) {
      if (input.includes(name)) {
        const d = new Date(today);
        const currentDay = d.getDay();
        let daysAhead = dayNum - currentDay;
        if (daysAhead <= 0) daysAhead += 7;
        d.setDate(d.getDate() + daysAhead);
        date = d.toLocaleDateString('en-CA', { timeZone: timezone });
        raw_match += name; break;
      }
    }

    if (!date) {
      const monthNames: Record<string, number> = {
        'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
        'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
        'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      };
      const monthPattern = new RegExp(`(\\d{1,2})\\s+de\\s+(${Object.keys(monthNames).join('|')})`, 'i');
      const mMonth = input.match(monthPattern);
      if (mMonth) {
        const day = parseInt(mMonth[1]);
        const month = monthNames[mMonth[2].toLowerCase()];
        const year = today.getFullYear();
        const candidate = new Date(year, month - 1, day);
        if (candidate < today) candidate.setFullYear(year + 1);
        date = candidate.toLocaleDateString('en-CA', { timeZone: timezone });
        raw_match += mMonth[0];
      }
    }

    if (!date) {
      const mDay = input.match(/\bdia\s+(\d{1,2})\b/);
      if (mDay) {
        const day = parseInt(mDay[1]);
        const year = today.getFullYear();
        const month = today.getMonth();
        let candidate = new Date(year, month, day);
        if (candidate <= today) candidate = new Date(year, month + 1, day);
        date = candidate.toLocaleDateString('en-CA', { timeZone: timezone });
        raw_match += mDay[0];
      }
    }

    if (!date) {
      const mNumeric = input.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
      if (mNumeric) {
        const day = parseInt(mNumeric[1]);
        const month = parseInt(mNumeric[2]) - 1;
        const year = mNumeric[3] ? parseInt(mNumeric[3].length === 2 ? '20' + mNumeric[3] : mNumeric[3]) : today.getFullYear();
        const candidate = new Date(year, month, day);
        date = candidate.toLocaleDateString('en-CA', { timeZone: timezone });
        raw_match += mNumeric[0];
      }
    }
  }

  return { date, time, raw_match: raw_match.trim() };
}
