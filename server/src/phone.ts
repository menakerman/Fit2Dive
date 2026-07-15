// Canonical phone normalization, shared across storage (diver create/update,
// import), OTP login lookup, and SMS sending, so the same number written or
// entered in any valid format always matches.
//
// Rules: strip separators (spaces, dashes, parentheses, dots), drop a leading
// "+" or "00" international prefix, and convert an Israeli "972" country code to
// the local "0" form. Examples that all normalize to "0547944155":
//   0547944155 · 054-794-4155 · +972-54-794-4155 · 00972 54 794 4155
export function normalizePhone(phone: string | null | undefined): string {
  let p = (phone || '').replace(/[\s\-().]/g, '');
  if (!p) return '';
  p = p.replace(/^\+/, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('972')) p = '0' + p.slice(3);
  return p;
}
