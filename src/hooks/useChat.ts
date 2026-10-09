import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ApiClient } from '../api/greenApi';
import {
  describeStatusError,
  isRenderableHistoryItem,
  isPersonalChat,
  isRenderableMessage,
  messageFromHistory,
  messageFromWebhook,
  titleFromWebhook,
  toMessageStatus,
} from '../api/mappers';
import type { InstanceState, MessageWebhook, StateWebhook, StatusWebhook, Webhook } from '../api/types';
import { formatPhone, parseRecipient } from '../lib/phone';
import { keys, load, remove, save } from '../lib/storage';
import { chatReducer, initialState, selectChatList, type Chat, type ChatState } from '../state/chatReducer';
import { useNotifications } from './useNotifications';

const MESSAGES_KEPT_PER_CHAT = 100;
const CLOCK_SKEW_LIMIT_MS = 15 * 60 * 1000;

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

export function useChat(client: ApiClient, idInstance: string, persist: boolean) {
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

  /**
   * Our estimate of (server clock − this computer's clock), in ms.
   * Messages from the server carry server time; a message we just sent only has
   * our clock. If the two differ by a couple of minutes, a fresh message sorts
   * above older ones and seems to vanish until a reload. So local sends use
   * the server clock estimate, and the echo from the server fixes the rest.
   */
  const clockSkew = useRef<number | null>(null);
  const observeServerTime = useCallback((tsSec: number) => {
    const estimate = tsSec * 1000 - Date.now();
    // Old notifications from the queue (up to 24 h) say nothing about the clock.
    if (Math.abs(estimate) > CLOCK_SKEW_LIMIT_MS) return;
    // Delivery delay only makes the estimate smaller, so the largest one is the best.
    clockSkew.current = clockSkew.current === null ? estimate : Math.max(clockSkew.current, estimate);
  }, []);
  const serverNow = useCallback(() => Date.now() + (clockSkew.current ?? 0), []);

  const handleWebhook = useCallback((w: Webhook) => {
    if (typeof w.timestamp === 'number') observeServerTime(w.timestamp);
    switch (w.typeWebhook) {
      case 'incomingMessageReceived':
      case 'outgoingMessageReceived':
      case 'outgoingAPIMessageReceived': {
        const mw = w as MessageWebhook;
        if (!isRenderableMessage(mw)) return;
        // Groups/channels are skipped unless the user opened that chat on purpose.
        if (!isPersonalChat(mw) && !stateRef.current.chats[mw.senderData.chatId]) return;
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
  }, [observeServerTime]);

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
        dispatch({ type: 'history/loaded', chatId, messages: (items ?? []).filter(isRenderableHistoryItem).map(messageFromHistory) });
      } catch {
        dispatch({ type: 'history/failed', chatId });
      } finally {
        historyInFlight.current.delete(chatId);
      }
    },
    [client],
  );

  /**
   * Silent re-sync of an already loaded chat: merges fresh history without the
   * skeleton or a scroll jump. A safety net for notifications that arrive late
   * (or not at all when the instance settings are off); duplicates are merged by id.
   */
  const refreshHistory = useCallback(
    async (chatId: string) => {
      if (historyInFlight.current.has(chatId)) return;
      historyInFlight.current.add(chatId);
      try {
        const items = await client.getChatHistory(chatId, 50);
        dispatch({
          type: 'history/loaded',
          chatId,
          messages: (items ?? []).filter(isRenderableHistoryItem).map(messageFromHistory),
        });
      } catch {
        /* keep what we have; the next refresh or notification will catch up */
      } finally {
        historyInFlight.current.delete(chatId);
      }
    },
    [client],
  );

  /**
   * Resolves the recipient's Telegram chatId via CheckAccount (by phone or @username)
   * and opens the chat. Known recipients are opened without another API call —
   * GREEN-API recommends not re-checking the same numbers.
   */
  const openChat = useCallback(
    async (rawRecipient: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      const recipient = parseRecipient(rawRecipient);
      if (!recipient.ok) return recipient;
      const isPhone = recipient.kind === 'phone';

      const existing = Object.values(stateRef.current.chats).find((c) =>
        isPhone ? c.phone === recipient.value : c.username?.toLowerCase() === recipient.value.toLowerCase(),
      );
      if (existing) {
        dispatch({ type: 'chat/select', chatId: existing.chatId });
        return { ok: true };
      }

      try {
        const res = await client.checkAccount(
          isPhone ? { phoneNumber: recipient.value } : { username: recipient.value },
        );
        if (!res?.exist || !res.chatId) {
          return {
            ok: false,
            error: isPhone
              ? 'Не нашли Telegram на этом номере (или номер скрыт настройками приватности)'
              : 'Пользователь с таким @username не найден',
          };
        }
        const phone = isPhone ? recipient.value : res.phoneNumber ? String(res.phoneNumber) : undefined;
        const username = res.username || (isPhone ? undefined : recipient.value);
        dispatch({
          type: 'chat/open',
          chatId: res.chatId,
          title:
            stateRef.current.chats[res.chatId]?.title ?? (isPhone ? formatPhone(recipient.value) : username!),
          phone,
          username,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Не удалось найти получателя' };
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
      dispatch({ type: 'send/start', chatId, localId, text: trimmed, quotedId, now: serverNow() });
      void deliver(chatId, localId, trimmed, quotedId);
    },
    [deliver, serverNow],
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

  /** Own messages: for everyone or only for me. Local (unsent) ones are just dropped. */
  const deleteMessage = useCallback(
    async (chatId: string, id: string, forEveryone: boolean) => {
      const msg = stateRef.current.chats[chatId]?.messages.find((m) => m.id === id);
      if (!msg || msg.deleting) return;
      if (msg.local) {
        dispatch({ type: 'send/discard', chatId, localId: id });
        return;
      }
      dispatch({ type: 'message/deleting', chatId, id });
      try {
        await client.deleteMessage({ chatId, idMessage: id, onlySenderDelete: !forEveryone });
        dispatch({ type: 'message/deleted', chatId, id });
      } catch (err) {
        dispatch({
          type: 'message/deleteFailed',
          chatId,
          id,
          error: err instanceof Error ? err.message : 'Не удалось удалить',
        });
      }
    },
    [client],
  );

  const actions = useMemo(
    () => ({
      selectChat: (chatId: string | null) => dispatch({ type: 'chat/select', chatId }),
      removeChat: (chatId: string) => dispatch({ type: 'chat/remove', chatId }),
      setDraft: (chatId: string, draft: string) => dispatch({ type: 'chat/draft', chatId, draft }),
      discardMessage: (chatId: string, localId: string) => dispatch({ type: 'send/discard', chatId, localId }),
      openChat,
      sendMessage,
      retryMessage,
      loadHistory,
      refreshHistory,
      deleteMessage,
    }),
    [openChat, sendMessage, retryMessage, loadHistory, refreshHistory, deleteMessage],
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
