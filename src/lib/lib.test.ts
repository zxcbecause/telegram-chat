import { attachmentLabel, messagePreview } from './attachment';
import { dayLabel, isSameDay, listLabel, timeLabel } from './date';
import { keys, load, remove, save } from './storage';

describe('date labels', () => {
  const now = new Date(2026, 9, 9, 15, 0).getTime(); // 9 Oct 2026, 15:00

  it('says "Сегодня", "Вчера" or the date', () => {
    expect(dayLabel(new Date(2026, 9, 9, 1, 0).getTime(), now)).toBe('Сегодня');
    expect(dayLabel(new Date(2026, 9, 8, 23, 59).getTime(), now)).toBe('Вчера');
    expect(dayLabel(new Date(2026, 9, 1).getTime(), now)).toBe('1 октября');
    expect(dayLabel(new Date(2025, 11, 31).getTime(), now)).toBe('31 декабря 2025 г.');
  });

  it('formats times and list labels', () => {
    expect(timeLabel(new Date(2026, 9, 9, 7, 5).getTime())).toBe('07:05');
    expect(listLabel(new Date(2026, 9, 9, 7, 5).getTime(), now)).toBe('07:05');
    expect(listLabel(new Date(2026, 9, 8, 7, 5).getTime(), now)).toBe('вчера');
    expect(listLabel(new Date(2026, 9, 6).getTime(), now)).toMatch(/^[а-я]{2}$/); // weekday, e.g. "пн"
    expect(listLabel(new Date(2026, 8, 1).getTime(), now)).toBe('01.09');
  });

  it('compares calendar days, not 24-hour windows', () => {
    expect(isSameDay(new Date(2026, 9, 9, 0, 1).getTime(), new Date(2026, 9, 9, 23, 59).getTime())).toBe(true);
    expect(isSameDay(new Date(2026, 9, 8, 23, 59).getTime(), new Date(2026, 9, 9, 0, 1).getTime())).toBe(false);
  });
});

describe('attachment labels', () => {
  it('names every kind of attachment', () => {
    expect(attachmentLabel({ kind: 'photo' })).toBe('Фото');
    expect(attachmentLabel({ kind: 'document', name: 'отчёт.xlsx' })).toBe('отчёт.xlsx');
    expect(attachmentLabel({ kind: 'audio', name: 'voice.ogg' })).toBe('voice.ogg');
    expect(attachmentLabel({ kind: 'poll', name: 'Когда встреча?' })).toBe('Опрос: Когда встреча?');
    expect(attachmentLabel({ kind: 'other', name: 'callMessage' })).toBe('Сообщение (callMessage)');
  });

  it('builds one-line previews for the list and quotes', () => {
    expect(messagePreview({ text: 'привет', attachment: undefined })).toBe('привет');
    expect(messagePreview({ text: null, attachment: { kind: 'photo' } })).toBe('🖼 Фото');
    expect(messagePreview({ text: 'смотри', attachment: { kind: 'photo' } })).toBe('🖼 Фото · смотри');
    expect(messagePreview({ text: null, attachment: undefined })).toBe('');
  });
});

describe('storage', () => {
  it('round-trips values under a namespaced key', () => {
    save(keys.theme, 'dark');
    expect(localStorage.getItem('max-chat:theme')).toBe('"dark"');
    expect(load(keys.theme, 'system')).toBe('dark');
    remove(keys.theme);
    expect(load(keys.theme, 'system')).toBe('system');
  });

  it('never throws: corrupted JSON and a full or blocked storage fall back silently', () => {
    localStorage.setItem('max-chat:session', '{not json');
    expect(load(keys.session, null)).toBeNull();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => save(keys.theme, 'dark')).not.toThrow();
    setItem.mockRestore();
  });
});
