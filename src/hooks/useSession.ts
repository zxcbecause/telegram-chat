import { useCallback, useMemo, useState } from 'react';
import { GreenApiClient, GreenApiError } from '../api/greenApi';
import type { Credentials } from '../api/types';
import { keys, load, remove, save } from '../lib/storage';

interface StoredSession {
  credentials: Credentials;
  remember: true;
}

export interface Session {
  credentials: Credentials;
  remember: boolean;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Credentials are kept in memory by default. They are written to localStorage
 * only when the user explicitly asks to be remembered.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = load<StoredSession | null>(keys.session, null);
    return stored ? { credentials: stored.credentials, remember: true } : null;
  });

  const client = useMemo(() => (session ? new GreenApiClient(session.credentials) : null), [session]);

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
    if (session) remove(keys.chats(session.credentials.idInstance));
    remove(keys.session);
    setSession(null);
  }, [session]);

  return { session, client, login, logout };
}
