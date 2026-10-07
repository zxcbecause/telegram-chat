const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Сегодня", "Вчера", "5 октября", "5 октября 2025". */
export function dayLabel(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Short label for the chat list: time today, weekday this week, date otherwise. */
export function listLabel(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (diff === 0) return timeLabel(ts);
  if (diff === 1) return 'вчера';
  if (diff < 7) return new Date(ts).toLocaleDateString('ru-RU', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}
