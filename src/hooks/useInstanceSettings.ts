import { useCallback, useEffect, useState } from 'react';
import { REQUIRED_SETTINGS, settingsProblems, type ApiClient } from '../api/greenApi';

export type SettingsCheck =
  | { state: 'ok' }
  | { state: 'problems'; problems: string[]; saving: boolean; error?: string }
  | { state: 'saved' };

/**
 * Checks once that the instance is set up for the HTTP API (empty webhook URL,
 * incoming/outgoing notifications on). If not, messages only show up after a
 * history reload, which looks like "huge delays". `fix()` turns them on.
 */
export function useInstanceSettings(client: ApiClient) {
  const [check, setCheck] = useState<SettingsCheck>({ state: 'ok' });

  useEffect(() => {
    const controller = new AbortController();
    client
      .getSettings(controller.signal)
      .then((settings) => {
        const problems = settingsProblems(settings);
        setCheck(problems.length ? { state: 'problems', problems, saving: false } : { state: 'ok' });
      })
      .catch(() => {
        /* Not critical: without settings we just can't warn. */
      });
    return () => controller.abort();
  }, [client]);

  const fix = useCallback(async () => {
    setCheck((c) => (c.state === 'problems' ? { ...c, saving: true, error: undefined } : c));
    try {
      const res = await client.setSettings({ ...REQUIRED_SETTINGS });
      if (!res?.saveSettings) throw new Error('GREEN-API не сохранил настройки');
      setCheck({ state: 'saved' });
    } catch (err) {
      setCheck((c) =>
        c.state === 'problems'
          ? { ...c, saving: false, error: err instanceof Error ? err.message : 'Не удалось сохранить' }
          : c,
      );
    }
  }, [client]);

  const dismiss = useCallback(() => setCheck({ state: 'ok' }), []);

  return { check, fix, dismiss };
}
