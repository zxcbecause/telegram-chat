import { motion } from 'framer-motion';
import { memo } from 'react';
import { timeLabel } from '../lib/date';
import type { Message } from '../state/chatReducer';
import { ReplyIcon, RetryIcon, CloseIcon } from './icons';
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
}: Props) {
  const out = message.direction === 'out';
  const failed = message.status === 'failed';
  const canReply = !message.local && message.text !== null;

  return (
    <motion.div
      id={`msg-${message.id}`}
      className={`msg ${out ? 'msg--out' : 'msg--in'} ${tail ? 'msg--tail' : ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
      onDoubleClick={() => canReply && onReply(message)}
    >
      <div className={`bubble ${failed ? 'bubble--failed' : ''}`}>
        {message.quotedId && (
          <button className="bubble__quote" onClick={() => onJumpTo(message.quotedId!)} type="button">
            <span className="bubble__quote-author">
              {quoted ? (quoted.direction === 'out' ? 'Вы' : chatTitle) : 'Ответ'}
            </span>
            <span className="bubble__quote-text">
              {quoted ? (quoted.text ?? 'Вложение') : (message.quotedText ?? 'Сообщение не загружено')}
            </span>
          </button>
        )}

        {message.text !== null ? (
          <span className="bubble__text">{message.text}</span>
        ) : (
          <span className="bubble__text bubble__text--muted">Вложение — в этом клиенте доступен только текст</span>
        )}

        <span className="bubble__meta">
          <time dateTime={new Date(message.timestamp).toISOString()}>{timeLabel(message.timestamp)}</time>
          {out && message.status && <StatusMark status={message.status} />}
        </span>
      </div>

      {canReply && (
        <button className="msg__reply icon-btn" onClick={() => onReply(message)} aria-label="Ответить" title="Ответить">
          <ReplyIcon width={18} height={18} />
        </button>
      )}

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
