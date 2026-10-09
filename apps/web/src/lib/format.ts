const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
export const money = (cents: number) => eur.format(cents / 100);
export const dateNl = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });

const languages = new Intl.DisplayNames(['nl'], { type: 'language' });
/** "nl" → "Nederlands"; onbekende codes blijven zoals ze zijn. */
export const languageName = (code: string) => {
  try {
    const name = languages.of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
};
/** "2026-10-01" → "1 okt" (voor grafiekassen). */
export const dayShort = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
