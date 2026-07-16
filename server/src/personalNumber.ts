// Canonical personal number (מספר אישי): the significant digits with no leading
// zero. Older data and the כשירות report used an 8-digit form with a leading
// zero (e.g. 05161563), while the canonical form is 7 digits (5161563). Applied
// on storage, import and login lookup so the same person always resolves to one
// value.
export function normalizePersonalNumber(pn: string | null | undefined): string {
  return String(pn ?? '').trim().replace(/^0+/, '');
}
