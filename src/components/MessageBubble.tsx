import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useRef, useState, type MouseEvent } from 'react';
import { attachmentIcon, attachmentLabel, messagePreview } from '../lib/attachment';
import { timeLabel } from '../lib/date';
import type { Message } from '../state/chatReducer';
import { ActionMenu, type MenuItem } from './ActionMenu';
import { ReplyIcon, RetryIcon, CloseIcon, TrashIcon } from './icons';
import { StatusMark } from './StatusMark';

interface Props {
  message: Message;
  quoted?: Message;
  chatTitle: string;
  /** First bubble of a run from the same side gets the "tail". */
  tail: boolean;
  onReply: (message: Message) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onJumpTo: (id: string) => void;
  onDelete: (id: string, forEveryone: boolean) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  quoted,
  chatTitle,
  tail,
  onReply,
  onRetry,
  onDiscard,
  onJumpTo,
  onDelete,
}: Props) {
  // Actions live in a context menu: right click on desktop, long press on phones.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUp, setMenuUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const out = message.direction === 'out';
  const failed = message.status === 'failed';
  const canReply = !message.local && !message.deleting;
  // GREEN-API can only delete our own messages.
  const canDelete = out && !message.local && !message.deleting;

  const menuItems: MenuItem[] = [
    ...(canReply
      ? [{ label: 'Ответить', icon: <ReplyIcon width={16} height={16} />, onSelect: () => onReply(message) }]
      : []),
    ...(canDelete
      ? [
          {
            label: 'Удалить у всех',
            icon: <TrashIcon width={16} height={16} />,
            danger: true,
            onSelect: () => onDelete(message.id, true),
          },
          {
            label: 'Удалить только у меня',
            icon: <TrashIcon width={16} height={16} />,
            onSelect: () => onDelete(message.id, false),
          },
        ]
      : []),
  ];

  const onContextMenu = (e: MouseEvent) => {
    if (!menuItems.length) return;
    e.preventDefault();
    // Near the bottom of the screen the menu opens upwards so it isn't cut off.
    const rect = ref.current?.getBoundingClientRect();
    setMenuUp(!!rect && rect.bottom > window.innerHeight * 0.55);
    setMenuOpen(true);
  };
  const { attachment } = message;

  return (
    <motion.div
      ref={ref}
      id={`msg-${message.id}`}
      className={`msg ${out ? 'msg--out' : 'msg--in'} ${tail ? 'msg--tail' : ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
      onDoubleClick={() => canReply && onReply(message)}
      onContextMenu={onContextMenu}
    >
      <div className={`bubble ${failed ? 'bubble--failed' : ''} ${message.deleting ? 'bubble--deleting' : ''}`}>
        {message.quotedId && (
          <button className="bubble__quote" onClick={() => onJumpTo(message.quotedId!)} type="button">
            <span className="bubble__quote-author">
              {quoted ? (quoted.direction === 'out' ? 'Вы' : chatTitle) : 'Ответ'}
            </span>
            <span className="bubble__quote-text">
              {quoted ? messagePreview(quoted) : (message.quotedText ?? 'Сообщение не загружено')}
            </span>
          </button>
        )}

        {attachment && (
          <span
            className={`attachment attachment--${attachment.kind}`}
            title="Файлы и медиа открываются в приложении Telegram — этот клиент работает только с текстом"
          >
            <span className="attachment__icon" aria-hidden>
              {attachmentIcon(attachment)}
            </span>
            <span className="attachment__name">{attachmentLabel(attachment)}</span>
          </span>
        )}

        {message.text !== null && <span className="bubble__text">{message.text}</span>}

        <span className="bubble__meta">
          <time dateTime={new Date(message.timestamp).toISOString()}>{timeLabel(message.timestamp)}</time>
          {out && message.status && <StatusMark status={message.status} />}
        </span>
      </div>

      <AnimatePresence>
        {menuOpen && menuItems.length > 0 && (
          <ActionMenu className={`msg__menu ${menuUp ? 'msg__menu--up' : ''}`} items={menuItems} onClose={closeMenu} />
        )}
      </AnimatePresence>

      {message.deleteError && <div className="msg__note msg__note--error">{message.deleteError}</div>}

      {failed && (
        <motion.div className="msg__failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span>{message.error ?? 'Не отправлено'}</span>
          {message.local && (
            <span className="msg__failed-actions">
              <button type="button" onClick={() => onRetry(message.id)}>
                <RetryIcon width={14} height={14} /> Повторить
              </button>
              <button type="button" onClick={() => onDiscard(message.id)}>
                <CloseIcon width={14} height={14} /> Удалить
              </button>
            </span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
});
