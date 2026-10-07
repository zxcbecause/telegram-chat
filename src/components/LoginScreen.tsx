import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { guessApiUrl } from '../api/greenApi';
import type { Credentials } from '../api/types';
import type { LoginResult } from '../hooks/useSession';
import { ChevronIcon, EyeIcon, MaxLogo } from './icons';

interface Props {
  onLogin: (credentials: Credentials, remember: boolean) => Promise<LoginResult>;
}

export function LoginScreen({ onLogin }: Props) {
  const [idInstance, setIdInstance] = useState('');
  const [token, setToken] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiUrlEdited, setApiUrlEdited] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const effectiveApiUrl = apiUrlEdited ? apiUrl : guessApiUrl(idInstance);
  const canSubmit = /^\d{6,}$/.test(idInstance.trim()) && token.trim().length > 0 && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await onLogin(
      { idInstance: idInstance.trim(), apiTokenInstance: token.trim(), apiUrl: effectiveApiUrl },
      remember,
    );
    if (!result.ok) {
      setError(result.error);
      setShake((n) => n + 1);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login__glow" aria-hidden />
      <motion.form
        key={shake}
        className="login__card"
        onSubmit={submit}
        initial={shake ? { x: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: shake ? 0.35 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        noValidate
      >
        <div className="login__brand">
          <MaxLogo size={56} />
          <h1>Вход в MAX</h1>
          <p>Введите данные инстанса из личного кабинета GREEN-API</p>
        </div>

        <label className="field">
          <span className="field__label">idInstance</span>
          <input
            className="field__input"
            inputMode="numeric"
            autoComplete="username"
            placeholder="3100123456"
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field__label">apiTokenInstance</span>
          <div className="field__wrap">
            <input
              className="field__input"
              type={showToken ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••••••"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn field__suffix"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
            >
              <EyeIcon off={showToken} width={20} height={20} />
            </button>
          </div>
        </label>

        <button
          type="button"
          className={`login__advanced-toggle ${showAdvanced ? 'is-open' : ''}`}
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          Дополнительно <ChevronIcon width={16} height={16} />
        </button>

        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              className="login__advanced"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <label className="field">
                <span className="field__label">API URL</span>
                <input
                  className="field__input"
                  inputMode="url"
                  value={effectiveApiUrl}
                  onChange={(e) => {
                    setApiUrlEdited(true);
                    setApiUrl(e.target.value);
                  }}
                />
                <span className="field__hint">
                  Подставляется по idInstance. Если не подходит — скопируйте apiUrl из личного кабинета.
                </span>
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="checkbox__box" aria-hidden />
          <span>Запомнить меня на этом устройстве</span>
        </label>

        <AnimatePresence>
          {error && (
            <motion.p
              className="login__error"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button className="btn btn--primary btn--block" type="submit" disabled={!canSubmit}>
          {busy ? <span className="spinner" aria-label="Проверяем" /> : 'Войти'}
        </button>

        <p className="login__foot">
          Нет инстанса?{' '}
          <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">
            Создайте в GREEN-API
          </a>
        </p>
      </motion.form>
    </main>
  );
}
