export type NotificationType =
  | 'RESERVATION_READY'
  | 'RESERVATION_EXPIRED'
  | 'LOAN_DUE_SOON'
  | 'LOAN_OVERDUE'
  | 'MEMBERSHIP_EXPIRING';

export type Locale = 'nl' | 'en';
export const LOCALES: Locale[] = ['nl', 'en'];

export interface TemplateData {
  title?: string;
  date?: Date;
  days?: number;
  amountCents?: number;
}

const money = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
const date = (d: Date, locale: Locale) =>
  d.toLocaleDateString(locale === 'nl' ? 'nl-NL' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

type Template = (d: TemplateData, l: Locale) => { title: string; body: string };

const TEMPLATES: Record<NotificationType, Record<Locale, Template>> = {
  RESERVATION_READY: {
    nl: (d, l) => ({
      title: 'Je reservering ligt klaar',
      body: `“${d.title}” ligt voor je klaar tot en met ${date(d.date!, l)}. Haal het boek op aan de balie.`,
    }),
    en: (d, l) => ({
      title: 'Your reservation is ready',
      body: `“${d.title}” is waiting for you until ${date(d.date!, l)}. Please pick it up at the desk.`,
    }),
  },
  RESERVATION_EXPIRED: {
    nl: (d) => ({
      title: 'Je reservering is verlopen',
      body: `Je hebt “${d.title}” niet op tijd opgehaald; de reservering is vervallen. Je kunt opnieuw reserveren.`,
    }),
    en: (d) => ({
      title: 'Your reservation has expired',
      body: `You did not pick up “${d.title}” in time, so the reservation has expired. You can reserve it again.`,
    }),
  },
  LOAN_DUE_SOON: {
    nl: (d, l) => ({
      title: 'Je boek moet bijna terug',
      body: `“${d.title}” moet uiterlijk ${date(d.date!, l)} terug. Verlengen kan via Mijn uitleningen.`,
    }),
    en: (d, l) => ({
      title: 'Your book is due soon',
      body: `“${d.title}” is due on ${date(d.date!, l)}. You can renew it under My loans.`,
    }),
  },
  LOAN_OVERDUE: {
    nl: (d, l) => ({
      title: 'Je boek is te laat',
      body: `“${d.title}” had op ${date(d.date!, l)} terug gemoeten (${d.days} dag(en) te laat). Boete tot nu toe: ${money(d.amountCents ?? 0, l)}. Lever het boek zo snel mogelijk in.`,
    }),
    en: (d, l) => ({
      title: 'Your book is overdue',
      body: `“${d.title}” was due on ${date(d.date!, l)} (${d.days} day(s) late). Fine so far: ${money(d.amountCents ?? 0, l)}. Please return it as soon as possible.`,
    }),
  },
  MEMBERSHIP_EXPIRING: {
    nl: (d, l) => ({
      title: 'Je lidmaatschap loopt af',
      body: `Je lidmaatschap loopt af op ${date(d.date!, l)}. Vraag aan de balie om verlenging.`,
    }),
    en: (d, l) => ({
      title: 'Your membership is expiring',
      body: `Your membership expires on ${date(d.date!, l)}. Ask at the desk to renew it.`,
    }),
  },
};

export function renderNotification(type: NotificationType, locale: string, data: TemplateData) {
  const l: Locale = locale === 'en' ? 'en' : 'nl';
  return TEMPLATES[type][l](data, l);
}
