import type { Message, MessageStatus } from '../state/chatReducer';
import type { HistoryItem, MessageData, MessageWebhook, OutgoingStatus } from './types';

/** Service events that share the message format but must not render as bubbles. */
const SERVICE_TYPES = new Set(['reactionMessage', 'editedMessage', 'deletedMessage']);

type Loose = Record<string, unknown> | undefined;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function obj(v: unknown): Loose {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

/**
 * Finds the text of a message wherever GREEN-API put it.
 *
 * The docs don't pin this down for every case: replies, forwards and messages
 * with links arrive as textMessage / extendedTextMessage / quotedMessage with the
 * text in different fields, and the history and webhook formats differ. So we
 * look in every known place instead of trusting typeMessage. Media keep
 * returning null (only text is supported by this client).
 */
export function findText(source: Loose): string | null {
  if (!source) return null;
  return (
    str(source.textMessage) ??
    str(obj(source.textMessageData)?.textMessage) ??
    str(obj(source.extendedTextMessage)?.text) ??
    str(obj(source.extendedTextMessageData)?.text) ??
    str(source.text) ??
    null
  );
}

/** Text of a webhook message, or null for media/stickers/polls. */
export function extractText(data: MessageData): string | null {
  return findText(data as unknown as Loose);
}

/** Text of the quoted message, if the API sent it along with the reply. */
function quotedText(q: Loose): string | undefined {
  return findText(q) ?? undefined;
}

export function messageFromWebhook(w: MessageWebhook): Message {
  const outgoing = w.typeWebhook !== 'incomingMessageReceived';
  const q = w.messageData.quotedMessage;
  return {
    id: w.idMessage,
    chatId: w.senderData.chatId,
    text: extractText(w.messageData),
    timestamp: w.timestamp * 1000,
    direction: outgoing ? 'out' : 'in',
    status: outgoing ? 'sent' : undefined,
    quotedId: q?.stanzaId,
    quotedText: quotedText(q as unknown as Loose),
  };
}

/** Display name for a chat, from the most specific field available. */
export function titleFromWebhook(w: MessageWebhook): string | undefined {
  const s = w.senderData;
  return s.senderContactName || s.chatName || s.senderName || undefined;
}

export function messageFromHistory(item: HistoryItem): Message {
  const q = item.quotedMessage;
  return {
    id: item.idMessage,
    chatId: item.chatId,
    text: findText(item as unknown as Loose),
    timestamp: item.timestamp * 1000,
    direction: item.type === 'outgoing' ? 'out' : 'in',
    status: item.type === 'outgoing' ? toMessageStatus(item.statusMessage) : undefined,
    quotedId: q?.stanzaId,
    quotedText: quotedText(q as unknown as Loose),
  };
}

export function toMessageStatus(s: OutgoingStatus | string | undefined): MessageStatus {
  switch (s) {
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
    case 'noAccount':
    case 'notInGroup':
      return 'failed';
    default:
      return 'sent';
  }
}

export function describeStatusError(s: OutgoingStatus, description?: string): string | undefined {
  if (s === 'noAccount') return 'У получателя нет Telegram или номер скрыт настройками приватности';
  if (s === 'notInGroup') return 'Вы не участник этого чата';
  if (s === 'failed') return description || 'Telegram не принял сообщение';
  return undefined;
}

/** Reaction/edit/delete events share the webhook type but shouldn't render as bubbles. */
export function isRenderableMessage(w: MessageWebhook): boolean {
  return !SERVICE_TYPES.has(w.messageData.typeMessage);
}

/** Same filter for chat history items. */
export function isRenderableHistoryItem(item: HistoryItem): boolean {
  return !SERVICE_TYPES.has(item.typeMessage);
}
