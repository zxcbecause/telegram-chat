import { AnimatePresence, motion } from 'framer-motion';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayLabel, isSameDay } from '../lib/date';
import type { Chat, Message } from '../state/chatReducer';
import { ArrowDownIcon } from './icons';
import { MessageBubble } from './MessageBubble';

interface Props {
  chat: Chat;
  onReply: (m: Message) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onReloadHistory: () => void;
}

const NEAR_BOTTOM_PX = 120;

export function MessageList({ chat, onReply, onRetry, onDiscard, onReloadHistory }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const prevCount = useRef(chat.messages.length);

  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // New chat opened → jump to the bottom instantly.
  useLayoutEffect(() => {
    stickToBottom.current = true;
    setUnseen(0);
    setShowJump(false);
    prevCount.current = chat.messages.length;
    scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.chatId]);

  // New messages: follow them if the user is at the bottom (or sent it), otherwise count them.
  useLayoutEffect(() => {
    const added = chat.messages.length - prevCount.current;
    prevCount.current = chat.messages.length;
    if (added <= 0) return;
    const last = chat.messages[chat.messages.length - 1];
    if (stickToBottom.current || last?.direction === 'out') {
      scrollToBottom(added < 5);
    } else {
      setUnseen((n) => n + added);
    }
  }, [chat.messages, scrollToBottom]);

  useEffect(() => {
    if (chat.history === 'loaded') scrollToBottom(false);
  }, [chat.history, scrollToBottom]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = near;
    setShowJump(!near);
    if (near) setUnseen(0);
  }

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('msg--flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('msg--flash');
  }, []);

  const loading = chat.history === 'loading' && chat.messages.length === 0;

  return (
    <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Сообщения">
      <div className="messages__inner">
        {loading && <HistorySkeleton />}

        {chat.history === 'error' && (
          <div className="messages__notice">
            Не удалось загрузить историю.{' '}
            <button type="button" onClick={onReloadHistory}>
              Повторить
            </button>
          </div>
        )}

        {!loading && chat.messages.length === 0 && chat.history !== 'error' && (
          <motion.div className="messages__empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="messages__empty-emoji" aria-hidden>
              👋
            </div>
            <p>Здесь пока пусто</p>
            <span>Напишите первое сообщение</span>
          </motion.div>
        )}

        {chat.messages.map((m, i) => {
          const prev = chat.messages[i - 1];
          const newDay = !prev || !isSameDay(prev.timestamp, m.timestamp);
          const tail = newDay || !prev || prev.direction !== m.direction;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="day-sep">
                  <span>{dayLabel(m.timestamp)}</span>
                </div>
              )}
              <MessageBubble
                message={m}
                quoted={m.quotedId ? byId.get(m.quotedId) : undefined}
                chatTitle={chat.title}
                tail={tail}
                onReply={onReply}
                onRetry={onRetry}
                onDiscard={onDiscard}
                onJumpTo={jumpTo}
              />
            </Fragment>
          );
        })}
      </div>

      <AnimatePresence>
        {showJump && (
          <motion.button
            className="jump-down"
            type="button"
            onClick={() => scrollToBottom(true)}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 10 }}
            aria-label="Вниз к новым сообщениям"
          >
            <ArrowDownIcon width={20} height={20} />
            {unseen > 0 && <span className="badge jump-down__badge">{unseen}</span>}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistorySkeleton() {
  const rows: Array<['in' | 'out', number]> = [
    ['in', 58],
    ['in', 34],
    ['out', 46],
    ['in', 66],
    ['out', 28],
    ['out', 52],
  ];
  return (
    <div className="skeleton-list" aria-label="Загрузка истории">
      {rows.map(([side, w], i) => (
        <div key={i} className={`skeleton-row skeleton-row--${side}`}>
          <div className="skeleton" style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />
        </div>
      ))}
    </div>
  );
}
