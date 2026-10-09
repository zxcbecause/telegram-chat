import { AnimatePresence, motion } from 'framer-motion';
import type { MessageStatus } from '../state/chatReducer';
import { AlertIcon, ClockIcon, Ticks } from './icons';

const LABELS: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
};

/** Pending clock → one tick → two ticks → two blue ticks, cross-fading between states. */
export function StatusMark({ status }: { status: MessageStatus }) {
  return (
    <span className={`status status--${status}`} title={LABELS[status]} role="img" aria-label={LABELS[status]}>
      <AnimatePresence initial={false}>
        <motion.span
          key={status === 'read' ? 'delivered-read' : status}
          className="status__icon"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.18 }}
        >
          {status === 'pending' && <ClockIcon />}
          {status === 'sent' && <Ticks double={false} />}
          {(status === 'delivered' || status === 'read') && <Ticks double />}
          {status === 'failed' && <AlertIcon width={14} height={14} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
