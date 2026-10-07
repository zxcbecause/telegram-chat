import type { Message, MessageStatus } from '../state/chatReducer';
import type { HistoryItem, MessageData, MessageWebhook, OutgoingStatus } from './types';

const TEXT_TYPES = new Set(['textMessage', 'extendedTextMessage', 'quotedMessage']);

/** Text of a webhook message, or null for media/stickers/polls (not supported here). */
export function extractText(data: MessageData): string | null {
  if (!TEXT_TYPES.has(data.typeMessage)) return null;
  return data.textMessageData?.textMessage ?? data.extendedTextMessageData?.text ?? null;
}

export function messageFromWebhook(w: MessageWebhook): Message {
  const outgoing = w.typeWebhook !== 'incomingMessageReceived';
  return {
    id: w.idMessage,
    chatId: w.senderData.chatId,
    text: extractText(w.messageData),
    timestamp: w.timestamp * 1000,
    direction: outgoing ? 'out' : 'in',
    status: outgoing ? 'sent' : undefined,
    quotedId: w.messageData.quotedMessage?.stanzaId,
  };
}

/** Display name for a chat, from the most specific field available. */
export function titleFromWebhook(w: MessageWebhook): string | undefined {
  const s = w.senderData;
  return s.senderContactName || s.chatName || s.senderName || undefined;
}

export function messageFromHistory(item: HistoryItem): Message {
  const text = TEXT_TYPES.has(item.typeMessage)
    ? (item.textMessage ?? item.extendedTextMessage?.text ?? null)
    : null;
  return {
    id: item.idMessage,
    chatId: item.chatId,
    text,
    timestamp: item.timestamp * 1000,
    direction: item.type === 'outgoing' ? 'out' : 'in',
    status: item.type === 'outgoing' ? toMessageStatus(item.statusMessage) : undefined,
    quotedId: item.quotedMessage?.stanzaId,
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
  if (s === 'noAccount') return 'У получателя нет аккаунта MAX';
  if (s === 'notInGroup') return 'Вы не участник этого чата';
  if (s === 'failed') return description || 'MAX не принял сообщение';
  return undefined;
}

/** Reaction/edit/delete events share the webhook type but shouldn't render as bubbles. */
export function isRenderableMessage(w: MessageWebhook): boolean {
  return !['reactionMessage', 'editedMessage', 'deletedMessage'].includes(w.messageData.typeMessage);
}
