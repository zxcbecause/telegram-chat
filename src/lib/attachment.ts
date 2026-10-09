import type { Attachment, AttachmentKind, Message } from '../state/chatReducer';

const META: Record<AttachmentKind, { icon: string; label: string }> = {
  photo: { icon: '🖼', label: 'Фото' },
  video: { icon: '🎬', label: 'Видео' },
  document: { icon: '📄', label: 'Файл' },
  audio: { icon: '🎵', label: 'Аудио' },
  sticker: { icon: '✨', label: 'Стикер' },
  poll: { icon: '📊', label: 'Опрос' },
  location: { icon: '📍', label: 'Геопозиция' },
  contact: { icon: '👤', label: 'Контакт' },
  other: { icon: '💬', label: 'Сообщение' },
};

export function attachmentIcon(a: Attachment): string {
  return META[a.kind].icon;
}

/** "lepro_цены.xlsx", "Опрос: Во сколько встречаемся?", "Фото", "Сообщение (callMessage)". */
export function attachmentLabel(a: Attachment): string {
  const { label } = META[a.kind];
  if (!a.name) return label;
  if (a.kind === 'document' || a.kind === 'audio') return a.name;
  if (a.kind === 'other') return `${label} (${a.name})`;
  return `${label}: ${a.name}`;
}

/** One-line summary for the chat list, quotes and the reply bar. */
export function messagePreview(m: Pick<Message, 'text' | 'attachment'>): string {
  if (!m.attachment) return m.text ?? '';
  const head = `${attachmentIcon(m.attachment)} ${attachmentLabel(m.attachment)}`;
  return m.text ? `${head} · ${m.text}` : head;
}
