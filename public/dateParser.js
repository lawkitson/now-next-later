const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTHS_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Returns { date: 'YYYY-MM-DD' } | { error: string } | { error: null } (empty input)
function parseNaturalDate(input) {
  const raw = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return { error: null };

  const now = todayMidnight();

  if (raw === 'today') return { date: toISO(now) };

  if (raw === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return { date: toISO(d) };
  }

  // next week → Monday of next calendar week
  if (raw === 'next week') {
    const d = new Date(now);
    const daysToNextMonday = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysToNextMonday);
    return { date: toISO(d) };
  }

  // next month → 1st of next month
  if (raw === 'next month') {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { date: toISO(d) };
  }

  // end of week → this Friday (or next Friday if already past)
  if (raw === 'end of week') {
    const d = new Date(now);
    const daysToFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToFriday);
    return { date: toISO(d) };
  }

  // end of month → last day of this month
  if (raw === 'end of month') {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { date: toISO(d) };
  }

  // this weekend → this Saturday (or today if already Saturday/Sunday)
  if (raw === 'this weekend') {
    const d = new Date(now);
    const day = d.getDay();
    if (day === 0 || day === 6) return { date: toISO(d) }; // already the weekend
    d.setDate(d.getDate() + (6 - day));
    return { date: toISO(d) };
  }

  // next weekend → Saturday of next week
  if (raw === 'next weekend') {
    const d = new Date(now);
    const daysToSaturday = (6 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + daysToSaturday + 7);
    return { date: toISO(d) };
  }

  // "in X days / weeks / months" — also accepts "a" / "an" as 1
  const inMatch = raw.match(/^in\s+(a|an|\d+)\s+(day|days|week|weeks|month|months)$/);
  if (inMatch) {
    const amount = (inMatch[1] === 'a' || inMatch[1] === 'an') ? 1 : parseInt(inMatch[1]);
    const unit = inMatch[2].replace(/s$/, '');
    const d = new Date(now);
    if (unit === 'day')   d.setDate(d.getDate() + amount);
    if (unit === 'week')  d.setDate(d.getDate() + amount * 7);
    if (unit === 'month') d.setMonth(d.getMonth() + amount);
    return { date: toISO(d) };
  }

  // "next monday" or just "monday"
  const dayMatch = raw.match(/^(?:next\s+)?([a-z]+)$/);
  if (dayMatch) {
    const dayIdx = DAYS.indexOf(dayMatch[1]);
    if (dayIdx !== -1) {
      const d = new Date(now);
      let diff = (dayIdx - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // never today, always next occurrence
      d.setDate(d.getDate() + diff);
      return { date: toISO(d) };
    }
  }

  // Strip ordinals: 23rd → 23, 1st → 1, "of" → ""
  const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/g, '$1').replace(/\bof\b/g, '').replace(/\s+/g, ' ').trim();

  // Match: "23 may [2027]" or "may 23 [2027]"
  const dmMatch = cleaned.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?$/);
  const mdMatch = cleaned.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);

  const parts = dmMatch
    ? { day: parseInt(dmMatch[1]), monthStr: dmMatch[2], year: dmMatch[3] ? parseInt(dmMatch[3]) : null }
    : mdMatch
    ? { day: parseInt(mdMatch[2]), monthStr: mdMatch[1], year: mdMatch[3] ? parseInt(mdMatch[3]) : null }
    : null;

  if (parts) {
    const { day, monthStr, year } = parts;
    let monthIdx = MONTHS.indexOf(monthStr);
    if (monthIdx === -1) monthIdx = MONTHS_SHORT.indexOf(monthStr);

    if (monthIdx === -1) return { error: `Unknown month "${monthStr}"` };

    const resolvedYear = year !== null && year < 100 ? 2000 + year : year;
    const targetYear = resolvedYear ?? now.getFullYear();
    const d = new Date(targetYear, monthIdx, day);

    if (d.getMonth() !== monthIdx) return { error: 'Invalid date' };

    if (d < now) {
      return resolvedYear
        ? { error: 'That date is in the past' }
        : { error: 'That date has already passed — add a year if you meant a future date (e.g. "23 may 27")' };
    }

    return { date: toISO(d) };
  }

  return { error: 'Try: "tomorrow", "next monday", "end of week", "in 3 days"' };
}

// Format a YYYY-MM-DD string for display
function formatDueDate(isoDate, completed) {
  const due = new Date(isoDate + 'T00:00:00');
  const now = todayMidnight();
  const diff = Math.round((due - now) / 86400000);

  let text, cls = 'todo-due';

  if (diff === 0)       text = 'Today';
  else if (diff === 1)  text = 'Tomorrow';
  else if (diff > 1 && diff < 7) text = due.toLocaleDateString(undefined, { weekday: 'long' });
  else                  text = due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  if (!completed) {
    if (diff < 0)      { cls += ' overdue'; text = `Overdue · ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`; }
    else if (diff <= 1) cls += ' due-soon';
  }

  return { text, cls };
}

if (typeof module !== 'undefined') module.exports = { parseNaturalDate, formatDueDate };
