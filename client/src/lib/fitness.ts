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
