import { useCallback, useMemo, useState } from 'react';
import { GreenApiClient, GreenApiError, type ApiClient } from '../api/greenApi';
import { DemoClient } from '../demo/demoClient';
import type { Credentials } from '../api/types';
import { keys, load, remove, save } from '../lib/storage';

interface StoredSession {
  credentials: Credentials;
  remember: true;
}

export interface Session {
  credentials: Credentials;
  remember: boolean;
  /** Demo mode: an in-browser fake instance, nothing is sent anywhere. */
  demo?: boolean;
}

const DEMO_SESSION: Session = {
  credentials: { idInstance: 'demo', apiTokenInstance: '', apiUrl: '' },
  remember: false,
  demo: true,
};

function wantsDemoFromUrl(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Credentials are kept in memory by default. They are written to localStorage
 * only when the user explicitly asks to be remembered.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(() => {
    if (wantsDemoFromUrl()) return DEMO_SESSION; // shareable link: https://…/?demo
    const stored = load<StoredSession | null>(keys.session, null);
    return stored ? { credentials: stored.credentials, remember: true } : null;
  });

  // A fresh demo client per demo session, so "Выйти → Демо" starts over.
  const client = useMemo<ApiClient | null>(() => {
    if (!session) return null;
    return session.demo ? new DemoClient() : new GreenApiClient(session.credentials);
  }, [session]);

  const startDemo = useCallback(() => setSession({ ...DEMO_SESSION }), []);

  const login = useCallback(async (credentials: Credentials, remember: boolean): Promise<LoginResult> => {
    const probe = new GreenApiClient(credentials);
    try {
      const { stateInstance } = await probe.getStateInstance();
      if (stateInstance !== 'authorized') {
        return {
          ok: false,
          error:
            stateInstance === 'notAuthorized'
              ? 'Инстанс не авторизован в Telegram. Отсканируйте QR-код в личном кабинете GREEN-API'
              : stateInstance === 'starting'
                ? 'Инстанс ещё запускается, попробуйте через минуту'
                : `Инстанс недоступен (состояние: ${stateInstance})`,
        };
      }
    } catch (err) {
      if (err instanceof GreenApiError) return { ok: false, error: err.message };
      return { ok: false, error: 'Нет соединения с GREEN-API. Проверьте интернет и API URL' };
    }

    if (remember) save(keys.session, { credentials, remember: true } satisfies StoredSession);
    else remove(keys.session);
    setSession({ credentials, remember });
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    if (session && !session.demo) {
      remove(keys.chats(session.credentials.idInstance));
      remove(keys.session);
    }
    // Drop ?demo from the address bar so a reload shows the login screen.
    if (wantsDemoFromUrl()) window.history.replaceState(null, '', window.location.pathname);
    setSession(null);
  }, [session]);

  return { session, client, login, logout, startDemo };
}
