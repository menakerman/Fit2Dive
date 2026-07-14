// The canonical fitness (כשירות) status values, in the order shown in the
// status dropdown.
export const FITNESS_STATUSES = [
  'כשיר',
  'כשיר זמני',
  'טרם נבדק',
  'בלתי כשיר זמנית',
  'בלתי כשיר מנהלתית',
  'בלתי כשיר תמידית',
] as const;

// Fitness (כשירות) status is stored as the Hebrew label itself, so the label is
// the status. This maps a status to its badge colors.
export function fitnessBadgeClass(status: string): string {
  switch ((status || '').trim()) {
    case 'כשיר':
      return 'bg-green-100 text-green-800';
    case 'כשיר זמני':
      return 'bg-amber-100 text-amber-800';
    case 'טרם נבדק':
      return 'bg-gray-100 text-gray-700';
    case 'בלתי כשיר זמנית':
    case 'בלתי כשיר מנהלתית':
    case 'בלתי כשיר תמידית':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function fitnessLabel(status: string): string {
  return (status || '').trim() || 'טרם נבדק';
}

// Hebrew count with singular/dual/plural forms (e.g. יום / יומיים / 3 ימים).
function heCount(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

// A friendly Hebrew approximation of a day count, e.g. 298 -> "כ־10 חודשים",
// 2223 -> "כ־6 שנים וחודש". Returns '' for short spans where the raw day
// count is already clear enough.
function humanizeDays(days: number): string {
  if (days < 45) return '';

  // Vav conjunction that attaches naturally to words but takes a hyphen before
  // a numeral, e.g. "וחודש", "וחודשיים", "ו-3 חודשים".
  const withVav = (n: number, one: string, two: string, many: string) =>
    n === 1 ? ` ו${one}` : n === 2 ? ` ו${two}` : ` ו-${n} ${many}`;

  if (days < 365) {
    const months = Math.round(days / 30);
    if (months >= 12) return 'כ־שנה';
    return `כ־${heCount(months, 'חודש', 'חודשיים', 'חודשים')}`;
  }

  const years = Math.floor(days / 365);
  let y = years;
  let months = Math.round((days % 365) / 30);
  if (months >= 12) { y += 1; months = 0; }
  const yearsStr = heCount(y, 'שנה', 'שנתיים', 'שנים');
  const monthsStr = months > 0 ? withVav(months, 'חודש', 'חודשיים', 'חודשים') : '';
  return `כ־${yearsStr}${monthsStr}`;
}

// Formats unfit days as the raw count plus a friendly approximation, e.g.
// "298 ימים (כ־10 חודשים)". Returns '—' when unknown.
export function formatUnfitDays(days: number | null | undefined): string {
  if (days == null) return '—';
  const base = heCount(days, 'יום', 'יומיים', 'ימים');
  const human = humanizeDays(days);
  return human ? `${base} (${human})` : base;
}
