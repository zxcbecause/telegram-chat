import { AnimatePresence, motion } from 'framer-motion';
import type { SettingsCheck } from '../hooks/useInstanceSettings';
import { CloseIcon } from './icons';

interface Props {
  check: SettingsCheck;
  onFix: () => void;
  onDismiss: () => void;
}

/** Warns when the instance isn't set up to deliver notifications, with a one-click fix. */
export function SettingsBanner({ check, onFix, onDismiss }: Props) {
  return (
    <AnimatePresence initial={false}>
      {check.state !== 'ok' && (
        <motion.div
          className={`settings-banner ${check.state === 'saved' ? 'is-saved' : ''}`}
          role={check.state === 'problems' ? 'alert' : 'status'}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className="settings-banner__body">
            {check.state === 'problems' ? (
              <>
                <strong>Новые сообщения не будут приходить сразу</strong>
                <span>В настройках инстанса: {check.problems.join('; ')}.</span>
                {check.error && <span className="settings-banner__error">{check.error}</span>}
                <button type="button" className="settings-banner__btn" onClick={onFix} disabled={check.saving}>
                  {check.saving ? 'Сохраняем…' : 'Включить уведомления'}
                </button>
              </>
            ) : (
              <>
                <strong>Настройки сохранены</strong>
                <span>GREEN-API перезапускает инстанс — сообщения начнут приходить сразу в течение ~5 минут.</span>
              </>
            )}
          </div>
          <button type="button" className="icon-btn settings-banner__close" onClick={onDismiss} aria-label="Скрыть">
            <CloseIcon width={16} height={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
