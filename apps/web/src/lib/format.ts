const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
export const money = (cents: number) => eur.format(cents / 100);
export const dateNl = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
