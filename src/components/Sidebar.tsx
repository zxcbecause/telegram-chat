import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import type { ConnectionState } from '../hooks/useNotifications';
import type { ThemePref } from '../hooks/useTheme';
import { listLabel } from '../lib/date';
import { maskPhoneInput } from '../lib/phone';
import type { Chat } from '../state/chatReducer';
import { Avatar } from './Avatar';
import { AutoThemeIcon, LogoutIcon, AppLogo, MoonIcon, PlusIcon, SunIcon } from './icons';
import { StatusMark } from './StatusMark';

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  connection: ConnectionState;
  demo?: boolean;
  theme: ThemePref;
  onToggleTheme: () => void;
  onLogout: () => void;
  onSelect: (chatId: string) => void;
  onCreate: (recipient: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: 'Подключение…',
  online: 'В сети',
  offline: 'Нет соединения, переподключаемся…',
  unauthorized: 'Неверные данные доступа',
};

export function Sidebar(props: Props) {
  const { chats, activeChatId, connection, theme } = props;

  return (
    <aside className="sidebar" aria-label="Чаты">
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <AppLogo size={30} />
          <div>
            <div className="sidebar__title">
              Чаты {props.demo && <span className="demo-tag">Демо</span>}
            </div>
            <div className={`conn conn--${connection}`} role="status" aria-live="polite">
              <span className="conn__dot" />
              {CONNECTION_TEXT[connection]}
            </div>
          </div>
        </div>
        <div className="sidebar__actions">
          <button
            className="icon-btn"
            onClick={props.onToggleTheme}
            aria-label={`Тема: ${theme === 'system' ? 'как в системе' : theme === 'light' ? 'светлая' : 'тёмная'}`}
            title="Сменить тему"
          >
            {theme === 'system' ? <AutoThemeIcon /> : theme === 'light' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="icon-btn" onClick={props.onLogout} aria-label="Выйти" title="Выйти">
            <LogoutIcon />
          </button>
        </div>
      </header>

      {props.demo && (
        <p className="demo-note">
          Демо-режим: собеседники и ответы имитируются в браузере, в Telegram ничего не отправляется.
        </p>
      )}

      <NewChatForm onCreate={props.onCreate} />

      <ul className="chat-list">
        <AnimatePresence initial={false}>
          {chats.map((chat) => (
            <motion.li
              key={chat.chatId}
              layout="position"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              <ChatListItem chat={chat} active={chat.chatId === activeChatId} onSelect={props.onSelect} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {chats.length === 0 && (
        <div className="sidebar__empty">
          <p>Пока нет чатов</p>
          <span>Введите номер телефона или @username выше, чтобы начать переписку</span>
        </div>
      )}
    </aside>
  );
}

function ChatListItem({ chat, active, onSelect }: { chat: Chat; active: boolean; onSelect: (id: string) => void }) {
  const last = chat.messages[chat.messages.length - 1];
  const preview = chat.draft
    ? { draft: true, text: chat.draft }
    : { draft: false, text: last ? (last.text ?? 'Вложение') : 'Нет сообщений' };

  return (
    <button className={`chat-item ${active ? 'is-active' : ''}`} onClick={() => onSelect(chat.chatId)}>
      <Avatar id={chat.chatId} title={chat.title} />
      <div className="chat-item__body">
        <div className="chat-item__row">
          <span className="chat-item__title">{chat.title}</span>
          <span className="chat-item__time">
            {last?.direction === 'out' && last.status && <StatusMark status={last.status} />}
            {last ? listLabel(last.timestamp) : ''}
          </span>
        </div>
        <div className="chat-item__row">
          <span className="chat-item__preview">
            {preview.draft && <span className="chat-item__draft">Черновик: </span>}
            {!preview.draft && last?.direction === 'out' && <span className="chat-item__you">Вы: </span>}
            {preview.text}
          </span>
          <AnimatePresence>
            {chat.unread > 0 && (
              <motion.span
                className="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                aria-label={`${chat.unread} непрочитанных`}
              >
                {chat.unread > 99 ? '99+' : chat.unread}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </button>
  );
}

function NewChatForm({ onCreate }: { onCreate: Props['onCreate'] }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await onCreate(phone);
    setBusy(false);
    if (res.ok) setPhone('');
    else setError(res.error);
  }

  return (
    <form className="new-chat" onSubmit={submit}>
      <div className={`new-chat__field ${error ? 'has-error' : ''}`}>
        <input
          className="new-chat__input"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Номер или @username"
          aria-label="Номер телефона или @username получателя"
          value={phone}
          onChange={(e) => {
            setPhone(maskPhoneInput(e.target.value));
            setError(null);
          }}
        />
        <button className="new-chat__btn" type="submit" disabled={busy || !phone} aria-label="Создать чат" title="Создать чат">
          {busy ? <span className="spinner spinner--sm" /> : <PlusIcon width={20} height={20} />}
        </button>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            className="new-chat__error"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
