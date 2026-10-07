import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GreenApiClient } from '../api/greenApi';
import {
  describeStatusError,
  isRenderableMessage,
  messageFromHistory,
  messageFromWebhook,
  titleFromWebhook,
  toMessageStatus,
} from '../api/mappers';
import type { InstanceState, MessageWebhook, StateWebhook, StatusWebhook, Webhook } from '../api/types';
import { formatPhone, normalizePhone } from '../lib/phone';
import { keys, load, remove, save } from '../lib/storage';
import { chatReducer, initialState, selectChatList, type Chat, type ChatState } from '../state/chatReducer';
import { useNotifications } from './useNotifications';

const MESSAGES_KEPT_PER_CHAT = 100;

let localSeq = 0;
const newLocalId = () => `local-${Date.now()}-${++localSeq}`;

function restore(idInstance: string, persist: boolean): ChatState {
  if (!persist) return initialState;
  const chats = load<Record<string, Chat>>(keys.chats(idInstance), {});
  // Anything that was still "pending" when the tab closed did not get a confirmation.
  for (const chat of Object.values(chats)) {
    chat.history = 'idle';
    chat.messages = chat.messages.map((m) =>
      m.status === 'pending' ? { ...m, status: 'failed', error: 'Отправка прервана' } : m,
    );
  }
  return { ...initialState, chats };
}

export function useChat(client: GreenApiClient, idInstance: string, persist: boolean) {
  const [state, dispatch] = useReducer(chatReducer, undefined, () => restore(idInstance, persist));
  const [instanceState, setInstanceState] = useState<InstanceState>('authorized');
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist chats (drafts included) — only when the user ticked "remember me".
  useEffect(() => {
    if (!persist) return;
    const t = setTimeout(() => {
      const trimmed: Record<string, Chat> = {};
      for (const [id, chat] of Object.entries(state.chats)) {
        trimmed[id] = { ...chat, messages: chat.messages.slice(-MESSAGES_KEPT_PER_CHAT) };
      }
      save(keys.chats(idInstance), trimmed);
    }, 300);
    return () => clearTimeout(t);
  }, [state.chats, idInstance, persist]);

  useEffect(() => {
    if (!persist) remove(keys.chats(idInstance));
  }, [persist, idInstance]);

  const handleWebhook = useCallback((w: Webhook) => {
    switch (w.typeWebhook) {
      case 'incomingMessageReceived':
      case 'outgoingMessageReceived':
      case 'outgoingAPIMessageReceived': {
        const mw = w as MessageWebhook;
        if (!isRenderableMessage(mw)) return;
        dispatch({ type: 'message/received', message: messageFromWebhook(mw), title: titleFromWebhook(mw) });
        return;
      }
      case 'outgoingMessageStatus': {
        const sw = w as StatusWebhook;
        dispatch({
          type: 'message/status',
          chatId: sw.chatId,
          idMessage: sw.idMessage,
          status: toMessageStatus(sw.status),
          error: describeStatusError(sw.status, sw.description),
        });
        return;
      }
      case 'stateInstanceChanged':
        setInstanceState((w as StateWebhook).stateInstance);
        return;
      default:
        // Other notification types are acknowledged and ignored.
        return;
    }
  }, []);

  const connection = useNotifications(client, handleWebhook);

  // One history request per chat at a time. Requests aren't aborted when the
  // user switches chats — the result is still useful when they come back.
  const historyInFlight = useRef(new Set<string>());

  const loadHistory = useCallback(
    async (chatId: string) => {
      if (historyInFlight.current.has(chatId)) return;
      historyInFlight.current.add(chatId);
      dispatch({ type: 'history/loading', chatId });
      try {
        const items = await client.getChatHistory(chatId, 50);
        dispatch({ type: 'history/loaded', chatId, messages: (items ?? []).map(messageFromHistory) });
      } catch {
        dispatch({ type: 'history/failed', chatId });
      } finally {
        historyInFlight.current.delete(chatId);
      }
    },
    [client],
  );

  /** Validates the number, resolves its MAX chatId via CheckAccount and opens the chat. */
  const openChatByPhone = useCallback(
    async (rawPhone: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const phone = normalizePhone(rawPhone);
      if (!phone.ok) return phone;

      const existing = Object.values(stateRef.current.chats).find((c) => c.phone === phone.digits);
      if (existing) {
        dispatch({ type: 'chat/select', chatId: existing.chatId });
        return { ok: true };
      }

      try {
        const res = await client.checkAccount(phone.digits);
        if (!res?.exist || !res.chatId) {
          return { ok: false, error: 'На этом номере нет аккаунта MAX' };
        }
        dispatch({
          type: 'chat/open',
          chatId: res.chatId,
          title: stateRef.current.chats[res.chatId]?.title ?? formatPhone(phone.digits),
          phone: phone.digits,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Не удалось проверить номер' };
      }
    },
    [client],
  );

  const deliver = useCallback(
    async (chatId: string, localId: string, text: string, quotedId?: string) => {
      try {
        const { idMessage } = await client.sendMessage({
          chatId,
          message: text,
          ...(quotedId ? { quotedMessageId: quotedId } : {}),
        });
        dispatch({ type: 'send/success', chatId, localId, idMessage });
      } catch (err) {
        dispatch({
          type: 'send/failed',
          chatId,
          localId,
          error: err instanceof Error ? err.message : 'Сообщение не отправлено',
        });
      }
    },
    [client],
  );

  const sendMessage = useCallback(
    (chatId: string, text: string, quotedId?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const localId = newLocalId();
      dispatch({ type: 'send/start', chatId, localId, text: trimmed, quotedId });
      void deliver(chatId, localId, trimmed, quotedId);
    },
    [deliver],
  );

  const retryMessage = useCallback(
    (chatId: string, localId: string) => {
      const msg = stateRef.current.chats[chatId]?.messages.find((m) => m.id === localId);
      if (!msg?.text || !msg.local) return;
      dispatch({ type: 'send/retry', chatId, localId });
      void deliver(chatId, localId, msg.text, msg.quotedId);
    },
    [deliver],
  );

  const actions = useMemo(
    () => ({
      selectChat: (chatId: string | null) => dispatch({ type: 'chat/select', chatId }),
      removeChat: (chatId: string) => dispatch({ type: 'chat/remove', chatId }),
      setDraft: (chatId: string, draft: string) => dispatch({ type: 'chat/draft', chatId, draft }),
      discardMessage: (chatId: string, localId: string) => dispatch({ type: 'send/discard', chatId, localId }),
      openChatByPhone,
      sendMessage,
      retryMessage,
      loadHistory,
    }),
    [openChatByPhone, sendMessage, retryMessage, loadHistory],
  );

  return {
    chats: selectChatList(state),
    activeChat: state.activeChatId ? (state.chats[state.activeChatId] ?? null) : null,
    connection,
    instanceState,
    ...actions,
  };
}

export type ChatApi = ReturnType<typeof useChat>;
