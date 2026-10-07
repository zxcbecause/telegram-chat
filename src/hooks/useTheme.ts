import { useCallback, useEffect, useState } from 'react';
import { keys, load, save } from '../lib/storage';

export type ThemePref = 'system' | 'light' | 'dark';

/** Light / dark / follow-the-OS. Applied as data-theme on <html>. */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => load<ThemePref>(keys.theme, 'system'));

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
    save(keys.theme, pref);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((p) => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'));
  }, []);

  return { pref, cycle };
}
