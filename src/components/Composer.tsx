import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { Message } from '../state/chatReducer';
import { CloseIcon, ReplyIcon, SendIcon } from './icons';

const MAX_LENGTH = 4000; // SendMessage limit

interface Props {
  chatId: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  replyTo: Message | null;
  replyAuthor: string;
  onCancelReply: () => void;
  disabled?: boolean;
}

export function Composer({ chatId, value, onChange, onSend, replyTo, replyAuthor, onCancelReply, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && value.length <= MAX_LENGTH && !disabled;

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Focus the input when switching chats or starting a reply (skip on touch screens).
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) ref.current?.focus();
  }, [chatId, replyTo]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
    if (e.key === 'Escape' && replyTo) onCancelReply();
  }

  return (
    <div className="composer">
      <AnimatePresence initial={false}>
        {replyTo && (
          <motion.div
            className="reply-bar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ReplyIcon className="reply-bar__icon" width={20} height={20} />
            <div className="reply-bar__body">
              <span className="reply-bar__author">{replyAuthor}</span>
              <span className="reply-bar__text">{replyTo.text}</span>
            </div>
            <button className="icon-btn" onClick={onCancelReply} aria-label="Отменить ответ">
              <CloseIcon width={18} height={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="composer__row">
        <textarea
          ref={ref}
          className="composer__input"
          rows={1}
          placeholder={disabled ? 'Инстанс не авторизован' : 'Сообщение'}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Текст сообщения"
        />
        <AnimatePresence initial={false}>
          {canSend && (
            <motion.button
              key="send"
              className="composer__send"
              onClick={onSend}
              aria-label="Отправить"
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, rotate: 45, opacity: 0 }}
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            >
              <SendIcon width={22} height={22} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {value.length > MAX_LENGTH * 0.9 && (
        <div className={`composer__counter ${value.length > MAX_LENGTH ? 'is-over' : ''}`}>
          {value.length} / {MAX_LENGTH}
        </div>
      )}
    </div>
  );
}
