/**
 * Phone number helpers.
 *
 * GREEN-API's CheckAccount expects 11–12 digits in international format
 * (country codes 7 and 375). People type numbers in many ways, so we normalise:
 *   +7 (700) 123-45-67 → 77001234567
 *   87001234567        → 77001234567  (local "8" prefix)
 *   7001234567         → 77001234567  (10 digits, code omitted)
 *   +375 29 123-45-67  → 375291234567
 */

export type PhoneValidation =
  | { ok: true; digits: string }
  | { ok: false; error: string };

export function normalizePhone(input: string): PhoneValidation {
  let digits = input.replace(/\D/g, '');

  if (!digits) return { ok: false, error: 'Введите номер телефона' };

  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;

  const isRuKz = digits.length === 11 && digits.startsWith('7');
  const isBy = digits.length === 12 && digits.startsWith('375');

  if (isRuKz || isBy) return { ok: true, digits };

  if (digits.length < 10) return { ok: false, error: 'Номер слишком короткий' };
  return { ok: false, error: 'Поддерживаются номера с кодом +7 или +375' };
}

/** Pretty-prints a normalised number: 77001234567 → +7 700 123-45-67 */
export function formatPhone(digits: string): string {
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('375')) {
    return `+375 ${digits.slice(3, 5)} ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10)}`;
  }
  return digits ? `+${digits}` : '';
}

/** Live input mask: keeps what the user typed readable while they type. */
export function maskPhoneInput(raw: string): string {
  const hadPlus = raw.trim().startsWith('+');
  let d = raw.replace(/\D/g, '').slice(0, 12);
  if (!d) return hadPlus ? '+' : '';

  if (d.startsWith('375')) {
    const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)];
    return `+${p[0]}${p[1] ? ` ${p[1]}` : ''}${p[2] ? ` ${p[2]}` : ''}${p[3] ? `-${p[3]}` : ''}${p[4] ? `-${p[4]}` : ''}`;
  }

  const lead = d[0] === '8' && !hadPlus ? '8' : '+7';
  if (d[0] === '7' || d[0] === '8') d = d.slice(1);
  d = d.slice(0, 10);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  let out = lead;
  if (p[0]) out += ` (${p[0]}`;
  if (p[0] && p[0].length === 3) out += ')';
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return out;
}
