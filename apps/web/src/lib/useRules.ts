import { useEffect, useState } from 'react';
import type { LoanRules } from '@biblio/api-client';
import { api } from '../api';

// Eén keer per sessie ophalen; de regels veranderen zelden.
let cached: Promise<LoanRules | null> | null = null;

/** Leenregels (termijn, verlengen, boetes) voor uitleg aan leden; null tot ze geladen zijn. */
export function useRules() {
  const [rules, setRules] = useState<LoanRules | null>(null);
  useEffect(() => {
    cached ??= api.GET('/api/rules').then(({ data }) => data ?? null);
    let live = true;
    void cached.then((r) => {
      if (!r) cached = null; // mislukt: volgende keer opnieuw proberen
      if (live) setRules(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return rules;
}

/** "21 dagen" → "3 weken" als het precies uitkomt. */
export function period(days: number) {
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weken`;
  return days === 1 ? '1 dag' : `${days} dagen`;
}
