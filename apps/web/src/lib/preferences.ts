import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'shelfTitles';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

/** Voorkeur (per browser): titel en auteur als tekst onder de boeken op de planken. Standaard uit. */
export function useShelfTitles(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      /* opslag niet beschikbaar */
    }
    listeners.forEach((fn) => fn());
  }, []);
  return [on, set];
}
