import { formatPhone, maskPhoneInput, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+7 (700) 123-45-67', '77001234567'],
    ['87001234567', '77001234567'],
    ['7001234567', '77001234567'],
    ['+7 999 123 45 67', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
  ])('%s → %s', (input, digits) => {
    expect(normalizePhone(input)).toEqual({ ok: true, digits });
  });

  it('rejects empty, short and unsupported numbers', () => {
    expect(normalizePhone('')).toMatchObject({ ok: false });
    expect(normalizePhone('+7 700')).toMatchObject({ ok: false, error: 'Номер слишком короткий' });
    expect(normalizePhone('+44 20 7946 0958')).toMatchObject({ ok: false });
  });
});

describe('formatPhone', () => {
  it('pretty-prints RU/KZ and BY numbers', () => {
    expect(formatPhone('77001234567')).toBe('+7 700 123-45-67');
    expect(formatPhone('375291234567')).toBe('+375 29 123-45-67');
  });
});

describe('maskPhoneInput', () => {
  it('formats while typing', () => {
    expect(maskPhoneInput('7')).toBe('+7');
    expect(maskPhoneInput('7700')).toBe('+7 (700)');
    expect(maskPhoneInput('77001234567')).toBe('+7 (700) 123-45-67');
    expect(maskPhoneInput('87001234567')).toBe('8 (700) 123-45-67');
  });
});
