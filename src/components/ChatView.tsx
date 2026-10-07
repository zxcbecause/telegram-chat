import { useCallback, useEffect, useState } from 'react';
import type { InstanceState } from '../api/types';
import type { ChatApi } from '../hooks/useChat';
import { formatPhone } from '../lib/phone';
import type { Chat, Message } from '../state/chatReducer';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { BackIcon } from './icons';
import { MessageList } from './MessageList';

interface Props {
  chat: Chat;
  api: ChatApi;
  instanceState: InstanceState;
  onBack: () => void;
}

export function ChatView({ chat, api, instanceState, onBack }: Props) {
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const { loadHistory, sendMessage, setDraft, retryMessage, discardMessage } = api;
  const authorized = instanceState === 'authorized';

  // Load history the first time a chat is opened (retry is manual after an error).
  useEffect(() => {
    if (chat.history === 'idle') void loadHistory(chat.chatId);
  }, [chat.chatId, chat.history, loadHistory]);

  useEffect(() => setReplyTo(null), [chat.chatId]);

  const send = useCallback(() => {
    sendMessage(chat.chatId, chat.draft, replyTo?.id);
    setReplyTo(null);
  }, [sendMessage, chat.chatId, chat.draft, replyTo]);

  // Stable callbacks keep memoised bubbles from re-rendering on every keystroke.
  const onRetry = useCallback((id: string) => retryMessage(chat.chatId, id), [retryMessage, chat.chatId]);
  const onDiscard = useCallback((id: string) => discardMessage(chat.chatId, id), [discardMessage, chat.chatId]);
  const onReload = useCallback(() => void loadHistory(chat.chatId), [loadHistory, chat.chatId]);

  const subtitle =
    [chat.username, chat.phone ? formatPhone(chat.phone) : undefined]
      .filter((v): v is string => !!v && v !== chat.title)
      .join(' · ') || 'Telegram';

  return (
    <section className="chat" aria-label={`Чат с ${chat.title}`}>
      <header className="chat__header">
        <button className="icon-btn chat__back" onClick={onBack} aria-label="Назад к списку чатов">
          <BackIcon />
        </button>
        <Avatar id={chat.chatId} title={chat.title} size={40} />
        <div className="chat__heading">
          <h2 className="chat__title">{chat.title}</h2>
          <span className="chat__subtitle">{subtitle}</span>
        </div>
      </header>

      {!authorized && (
        <div className="banner banner--warn" role="alert">
          Инстанс не авторизован в Telegram ({instanceState}). Отправка недоступна — авторизуйте его в личном кабинете
          GREEN-API.
        </div>
      )}

      <MessageList
        chat={chat}
        onReply={setReplyTo}
        onRetry={onRetry}
        onDiscard={onDiscard}
        onReloadHistory={onReload}
      />

      <Composer
        chatId={chat.chatId}
        value={chat.draft}
        onChange={(v) => setDraft(chat.chatId, v)}
        onSend={send}
        replyTo={replyTo}
        replyAuthor={replyTo?.direction === 'out' ? 'Вы' : chat.title}
        onCancelReply={() => setReplyTo(null)}
        disabled={!authorized}
      />
    </section>
  );
}
