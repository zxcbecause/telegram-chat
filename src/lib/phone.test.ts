import { formatPhone, maskPhoneInput, normalizePhone, parseRecipient } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+7 (700) 123-45-67', '77001234567'],
    ['87001234567', '77001234567'],
    ['7001234567', '77001234567'],
    ['+7 999 123 45 67', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
    ['+49 151 2345 6789', '4915123456789'],
  ])('%s → %s', (input, digits) => {
    expect(normalizePhone(input)).toEqual({ ok: true, digits });
  });

  it('rejects empty, too short and too long numbers', () => {
    expect(normalizePhone('')).toMatchObject({ ok: false });
    expect(normalizePhone('+7 700')).toMatchObject({ ok: false, error: 'Номер слишком короткий' });
    expect(normalizePhone('1234567890123456')).toMatchObject({ ok: false, error: 'Номер слишком длинный' });
  });
});

describe('parseRecipient', () => {
  it('recognises @usernames with or without the @', () => {
    expect(parseRecipient('@durov')).toEqual({ ok: true, kind: 'username', value: '@durov' });
    expect(parseRecipient(' Anya_Dev ')).toEqual({ ok: true, kind: 'username', value: '@Anya_Dev' });
    expect(parseRecipient('@ab')).toMatchObject({ ok: false });
  });

  it('treats digits as a phone number', () => {
    expect(parseRecipient('8 700 123 45 67')).toEqual({ ok: true, kind: 'phone', value: '77001234567' });
  });
});

describe('formatPhone', () => {
  it('pretty-prints +7 numbers and keeps others readable', () => {
    expect(formatPhone('77001234567')).toBe('+7 700 123-45-67');
    expect(formatPhone('4915123456789')).toBe('+4915123456789');
  });
});

describe('maskPhoneInput', () => {
  it('formats +7 / 8 numbers while typing', () => {
    expect(maskPhoneInput('7')).toBe('+7');
    expect(maskPhoneInput('7700')).toBe('+7 (700)');
    expect(maskPhoneInput('77001234567')).toBe('+7 (700) 123-45-67');
    expect(maskPhoneInput('87001234567')).toBe('8 (700) 123-45-67');
  });

  it('leaves other countries and usernames alone', () => {
    expect(maskPhoneInput('+49151')).toBe('+49151');
    expect(maskPhoneInput('@anya dev')).toBe('@anyadev');
  });
});
