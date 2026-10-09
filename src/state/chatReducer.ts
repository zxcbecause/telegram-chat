import { formatPhone } from '../lib/phone';

/**
 * Chat state as a pure reducer. Keeping it framework-free makes the tricky
 * parts (dedupe, out-of-order webhooks, status ordering) easy to unit test.
 */

export type AttachmentKind =
  | 'photo'
  | 'video'
  | 'document'
  | 'audio'
  | 'sticker'
  | 'poll'
  | 'location'
  | 'contact'
  | 'other';

/** A non-text part of a message. The client can't open files, but says what was sent. */
export interface Attachment {
  kind: AttachmentKind;
  /** File name, poll question, or the raw typeMessage for unknown kinds. */
  name?: string;
}

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  /** idMessage from GREEN-API, or a local id while the send is in flight. */
  id: string;
  chatId: string;
  /** Message text, or the caption of a file; null when there is no text at all. */
  text: string | null;
  attachment?: Attachment;
  timestamp: number; // ms
  direction: 'in' | 'out';
  status?: MessageStatus;
  error?: string;
  quotedId?: string;
  /** Text of the quoted message when the API sent it (used if the original isn't loaded). */
  quotedText?: string;
  /** true while `id` is still the local placeholder. */
  local?: boolean;
  /** A delete request is in flight. */
  deleting?: boolean;
  deleteError?: string;
}

export interface Chat {
  chatId: string;
  title: string;
  phone?: string;
  username?: string;
  messages: Message[];
  draft: string;
  unread: number;
  updatedAt: number;
  history: 'idle' | 'loading' | 'loaded' | 'error';
  /** Messages the user deleted — kept out even if history or a late webhook brings them back. */
  deletedIds?: string[];
}

export interface ChatState {
  chats: Record<string, Chat>;
  activeChatId: string | null;
  /** Statuses that arrived before we learned the message's real id. */
  orphanStatuses: Record<string, MessageStatus>;
}

export const initialState: ChatState = { chats: {}, activeChatId: null, orphanStatuses: {} };

export type ChatAction =
  | { type: 'chat/open'; chatId: string; title: string; phone?: string; username?: string; now?: number }
  | { type: 'chat/select'; chatId: string | null }
  | { type: 'chat/remove'; chatId: string }
  | { type: 'chat/draft'; chatId: string; draft: string }
  | { type: 'history/loading'; chatId: string }
  | { type: 'history/loaded'; chatId: string; messages: Message[]; senderName?: string }
  | { type: 'history/failed'; chatId: string }
  | { type: 'send/start'; chatId: string; localId: string; text: string; quotedId?: string; now?: number }
  | { type: 'send/success'; chatId: string; localId: string; idMessage: string }
  | { type: 'send/failed'; chatId: string; localId: string; error: string }
  | { type: 'send/retry'; chatId: string; localId: string }
  | { type: 'send/discard'; chatId: string; localId: string }
  | { type: 'message/received'; message: Message; title?: string }
  | { type: 'message/deleting'; chatId: string; id: string }
  | { type: 'message/deleted'; chatId: string; id: string }
  | { type: 'message/deleteFailed'; chatId: string; id: string; error: string }
  | { type: 'message/status'; chatId: string; idMessage: string; status: MessageStatus; error?: string };

const RANK: Record<MessageStatus, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Statuses only move forward (sent → delivered → read); "failed" always wins. */
export function mergeStatus(current: MessageStatus | undefined, next: MessageStatus | undefined) {
  if (!next) return current;
  if (!current) return next;
  if (next === 'failed') return 'failed';
  // A late "delivered"/"read" proves the message got through after all.
  if (current === 'failed') return next === 'delivered' || next === 'read' ? next : current;
  return RANK[next] >= RANK[current] ? next : current;
}

function newChat(chatId: string, title: string, now: number, phone?: string, username?: string): Chat {
  return { chatId, title, phone, username, messages: [], draft: '', unread: 0, updatedAt: now, history: 'idle' };
}

/**
 * GREEN-API timestamps have 1-second resolution while local sends use ms.
 * Compare by whole seconds and rely on the stable sort to keep arrival order
 * inside the same second — otherwise a quick reply can jump above the question.
 */
function sortByTime(messages: Message[]): Message[] {
  const sec = (m: Message) => Math.floor(m.timestamp / 1000);
  return [...messages].sort((a, b) => sec(a) - sec(b));
}

/** The title is still the raw id, phone or @username we opened the chat with. */
function isPlaceholderTitle(c: Chat): boolean {
  return c.title === c.chatId || c.title === c.username || (c.phone !== undefined && c.title === formatPhone(c.phone));
}

function updateChat(state: ChatState, chatId: string, fn: (chat: Chat) => Chat): ChatState {
  const chat = state.chats[chatId];
  if (!chat) return state;
  return { ...state, chats: { ...state.chats, [chatId]: fn(chat) } };
}

function patchMessage(chat: Chat, id: string, fn: (m: Message) => Message): Chat {
  return { ...chat, messages: chat.messages.map((m) => (m.id === id ? fn(m) : m)) };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chat/open': {
      const existing = state.chats[action.chatId];
      const chat = existing
        ? {
            ...existing,
            phone: existing.phone ?? action.phone,
            username: existing.username ?? action.username,
            unread: 0,
          }
        : newChat(action.chatId, action.title, action.now ?? Date.now(), action.phone, action.username);
      return { ...state, activeChatId: action.chatId, chats: { ...state.chats, [action.chatId]: chat } };
    }

    case 'chat/select': {
      const next = { ...state, activeChatId: action.chatId };
      return action.chatId ? updateChat(next, action.chatId, (c) => ({ ...c, unread: 0 })) : next;
    }

    case 'chat/remove': {
      const chats = { ...state.chats };
      delete chats[action.chatId];
      return { ...state, chats, activeChatId: state.activeChatId === action.chatId ? null : state.activeChatId };
    }

    case 'chat/draft':
      return updateChat(state, action.chatId, (c) => ({ ...c, draft: action.draft }));

    case 'history/loading':
      return updateChat(state, action.chatId, (c) => ({ ...c, history: 'loading' }));

    case 'history/failed':
      return updateChat(state, action.chatId, (c) => ({ ...c, history: 'error' }));

    case 'history/loaded':
      return updateChat(state, action.chatId, (c) => {
        // Merge: keep anything we already have (pending sends, fresher statuses),
        // but the server's timestamp wins — see `serverTime` in useChat.
        const deleted = new Set(c.deletedIds);
        const byId = new Map(c.messages.map((m) => [m.id, m]));
        for (const m of action.messages) {
          if (deleted.has(m.id)) continue;
          const prev = byId.get(m.id);
          byId.set(
            m.id,
            prev ? { ...m, ...prev, timestamp: m.timestamp, status: mergeStatus(m.status, prev.status) } : m,
          );
        }
        const messages = sortByTime([...byId.values()]);
        const last = messages[messages.length - 1];
        return {
          ...c,
          // A chat opened by number/@username gets the person's name from history.
          title: action.senderName && isPlaceholderTitle(c) ? action.senderName : c.title,
          messages,
          history: 'loaded',
          updatedAt: Math.max(c.updatedAt, last?.timestamp ?? 0),
        };
      });

    case 'send/start': {
      // A message we just sent is the newest one by definition — never let a clock
      // difference put it above what is already on screen.
      const msgs = state.chats[action.chatId]?.messages ?? [];
      const last = msgs[msgs.length - 1];
      const now = Math.max(action.now ?? Date.now(), last?.timestamp ?? 0);
      const message: Message = {
        id: action.localId,
        chatId: action.chatId,
        text: action.text,
        timestamp: now,
        direction: 'out',
        status: 'pending',
        quotedId: action.quotedId,
        local: true,
      };
      return updateChat(state, action.chatId, (c) => ({
        ...c,
        draft: '',
        updatedAt: now,
        messages: [...c.messages, message],
      }));
    }

    case 'send/success': {
      const orphan = state.orphanStatuses[action.idMessage];
      const orphanStatuses = { ...state.orphanStatuses };
      delete orphanStatuses[action.idMessage];

      const next = updateChat({ ...state, orphanStatuses }, action.chatId, (c) => {
        // The outgoingAPIMessageReceived webhook may have beaten the HTTP response.
        const echo = c.messages.find((m) => m.id === action.idMessage && m.id !== action.localId);
        const messages = c.messages
          .filter((m) => m !== echo)
          .map((m) =>
            m.id === action.localId
              ? {
                  ...m,
                  id: action.idMessage,
                  local: false,
                  error: undefined,
                  // The echo carries the server's time; prefer it over our local estimate.
                  timestamp: echo?.timestamp ?? m.timestamp,
                  status: mergeStatus(mergeStatus('sent', echo?.status), orphan),
                }
              : m,
          );
        return { ...c, messages: echo ? sortByTime(messages) : messages };
      });
      return next;
    }

    case 'send/failed':
      return updateChat(state, action.chatId, (c) =>
        patchMessage(c, action.localId, (m) => ({ ...m, status: 'failed', error: action.error })),
      );

    case 'send/retry':
      return updateChat(state, action.chatId, (c) =>
        patchMessage(c, action.localId, (m) => ({ ...m, status: 'pending', error: undefined })),
      );

    case 'send/discard':
      return updateChat(state, action.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== action.localId),
      }));

    case 'message/received': {
      const { message } = action;
      const exists = state.chats[message.chatId];
      const base: ChatState = exists
        ? state
        : {
            ...state,
            chats: {
              ...state.chats,
              [message.chatId]: newChat(message.chatId, action.title ?? message.chatId, message.timestamp),
            },
          };

      return updateChat(base, message.chatId, (c) => {
        if (c.deletedIds?.includes(message.id)) return c;
        const dup = c.messages.find((m) => m.id === message.id);
        const isActive = base.activeChatId === message.chatId;
        // Replace a placeholder title (raw id, phone, @username) with the real name from Telegram.
        const title = isPlaceholderTitle(c) && action.title ? action.title : c.title;
        if (dup) {
          // Our own send echoed back: take the server time and put it where it belongs.
          const patched = patchMessage(c, message.id, (m) => ({
            ...m,
            timestamp: message.timestamp,
            status: mergeStatus(m.status, message.status),
          }));
          return { ...patched, messages: sortByTime(patched.messages), title };
        }
        return {
          ...c,
          title,
          messages: sortByTime([...c.messages, message]),
          updatedAt: Math.max(c.updatedAt, message.timestamp),
          unread: message.direction === 'in' && !isActive ? c.unread + 1 : c.unread,
        };
      });
    }

    case 'message/deleting':
      return updateChat(state, action.chatId, (c) =>
        patchMessage(c, action.id, (m) => ({ ...m, deleting: true, deleteError: undefined })),
      );

    case 'message/deleteFailed':
      return updateChat(state, action.chatId, (c) =>
        patchMessage(c, action.id, (m) => ({ ...m, deleting: false, deleteError: action.error })),
      );

    case 'message/deleted':
      return updateChat(state, action.chatId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== action.id),
        deletedIds: [...(c.deletedIds ?? []), action.id].slice(-200),
      }));

    case 'message/status': {
      const chat = state.chats[action.chatId];
      const known = chat?.messages.some((m) => m.id === action.idMessage);
      if (!known) {
        return {
          ...state,
          orphanStatuses: {
            ...state.orphanStatuses,
            [action.idMessage]: mergeStatus(state.orphanStatuses[action.idMessage], action.status)!,
          },
        };
      }
      return updateChat(state, action.chatId, (c) =>
        patchMessage(c, action.idMessage, (m) => ({
          ...m,
          status: mergeStatus(m.status, action.status),
          error: action.status === 'failed' ? action.error : m.error,
        })),
      );
    }

    default:
      return state;
  }
}

/** Chats sorted by last activity, newest first. */
export function selectChatList(state: ChatState): Chat[] {
  return Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt);
}
