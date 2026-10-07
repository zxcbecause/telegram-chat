/**
 * Recipient helpers.
 *
 * GREEN-API's CheckAccount for Telegram accepts either a phone number in
 * international format (digits only) or a @username. People type numbers in
 * many ways, so we normalise:
 *   +7 (700) 123-45-67 → 77001234567
 *   87001234567        → 77001234567  (local "8" prefix, KZ/RU)
 *   7001234567         → 77001234567  (10 digits, code omitted)
 *   +49 151 2345 6789  → 4915123456789
 */

export type PhoneValidation = { ok: true; digits: string } | { ok: false; error: string };

export type Recipient =
  | { ok: true; kind: 'phone'; value: string }
  | { ok: true; kind: 'username'; value: string }
  | { ok: false; error: string };

const USERNAME = /^@?([a-zA-Z][a-zA-Z0-9_]{3,31})$/;

export function normalizePhone(input: string): PhoneValidation {
  let digits = input.replace(/\D/g, '');

  if (!digits) return { ok: false, error: 'Введите номер телефона' };
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;

  if (digits.length < 10) return { ok: false, error: 'Номер слишком короткий' };
  if (digits.length > 15) return { ok: false, error: 'Номер слишком длинный' };
  return { ok: true, digits };
}

/** "@durov" / "durov" → username, anything with digits → phone number. */
export function parseRecipient(input: string): Recipient {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Введите номер телефона или @username' };

  const looksLikeUsername = trimmed.startsWith('@') || /[a-zA-Z]/.test(trimmed);
  if (looksLikeUsername) {
    const m = USERNAME.exec(trimmed);
    return m ? { ok: true, kind: 'username', value: `@${m[1]}` } : { ok: false, error: 'Некорректный @username' };
  }

  const phone = normalizePhone(trimmed);
  return phone.ok ? { ok: true, kind: 'phone', value: phone.digits } : phone;
}

/** Pretty-prints a normalised number: 77001234567 → +7 700 123-45-67 */
export function formatPhone(digits: string): string {
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return digits ? `+${digits}` : '';
}

/** Live input mask: formats +7/8 numbers, leaves other countries and @usernames as typed. */
export function maskPhoneInput(raw: string): string {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('@') || /[a-zA-Z]/.test(trimmed)) return trimmed.replace(/\s/g, '');

  const hadPlus = trimmed.startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (!d) return hadPlus ? '+' : '';

  // Not a +7 / 8 number: keep the digits with a leading plus.
  if (!(d[0] === '7' || (d[0] === '8' && !hadPlus))) return `+${d.slice(0, 15)}`;

  const lead = d[0] === '8' ? '8' : '+7';
  d = d.slice(1, 11);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  let out = lead;
  if (p[0]) out += ` (${p[0]}`;
  if (p[0] && p[0].length === 3) out += ')';
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return out;
}
