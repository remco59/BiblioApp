export const NOTIFICATION_TYPES = [
  'RESERVATION_READY',
  'RESERVATION_EXPIRED',
  'LOAN_DUE_SOON',
  'LOAN_OVERDUE',
  'MEMBERSHIP_EXPIRING',
  'WISHLIST_AVAILABLE',
  'SUGGESTION_UPDATED',
  'REVIEW_MODERATED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type Locale = 'nl' | 'en';
export const LOCALES: Locale[] = ['nl', 'en'];

export interface TemplateData {
  title?: string;
  /** Alleen voor dedupe/koppeling; niet in de tekst. */
  bookId?: number;
  date?: Date;
  days?: number;
  amountCents?: number;
  status?: string;
  note?: string;
}

/** Beschikbare plaatshouders in (aanpasbare) templates: {{title}}, {{date}}, {{days}}, {{amount}}, {{status}}, {{note}}. */
export const PLACEHOLDERS = ['title', 'date', 'days', 'amount', 'status', 'note'] as const;

export interface TemplateText {
  title: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<NotificationType, Record<Locale, TemplateText>> = {
  RESERVATION_READY: {
    nl: {
      title: 'Je reservering ligt klaar',
      body: '“{{title}}” ligt voor je klaar tot en met {{date}}. Haal het boek op aan de balie.',
    },
    en: {
      title: 'Your reservation is ready',
      body: '“{{title}}” is waiting for you until {{date}}. Please pick it up at the desk.',
    },
  },
  RESERVATION_EXPIRED: {
    nl: {
      title: 'Je reservering is verlopen',
      body: 'Je hebt “{{title}}” niet op tijd opgehaald; de reservering is vervallen. Je kunt opnieuw reserveren.',
    },
    en: {
      title: 'Your reservation has expired',
      body: 'You did not pick up “{{title}}” in time, so the reservation has expired. You can reserve it again.',
    },
  },
  LOAN_DUE_SOON: {
    nl: {
      title: 'Je boek moet bijna terug',
      body: '“{{title}}” moet uiterlijk {{date}} terug. Verlengen kan via Mijn uitleningen.',
    },
    en: {
      title: 'Your book is due soon',
      body: '“{{title}}” is due on {{date}}. You can renew it under My loans.',
    },
  },
  LOAN_OVERDUE: {
    nl: {
      title: 'Je boek is te laat',
      body: '“{{title}}” had op {{date}} terug gemoeten ({{days}} dag(en) te laat). Boete tot nu toe: {{amount}}. Lever het boek zo snel mogelijk in.',
    },
    en: {
      title: 'Your book is overdue',
      body: '“{{title}}” was due on {{date}} ({{days}} day(s) late). Fine so far: {{amount}}. Please return it as soon as possible.',
    },
  },
  MEMBERSHIP_EXPIRING: {
    nl: {
      title: 'Je lidmaatschap loopt af',
      body: 'Je lidmaatschap loopt af op {{date}}. Vraag aan de balie om verlenging.',
    },
    en: {
      title: 'Your membership is expiring',
      body: 'Your membership expires on {{date}}. Ask at the desk to renew it.',
    },
  },
  WISHLIST_AVAILABLE: {
    nl: {
      title: 'Een boek van je verlanglijst is beschikbaar',
      body: '“{{title}}” staat voor je klaar in de bibliotheek. Kom het lenen!',
    },
    en: {
      title: 'A book on your wishlist is available',
      body: '“{{title}}” is available at the library. Come and borrow it!',
    },
  },
  SUGGESTION_UPDATED: {
    nl: {
      title: 'Update over je aankoopsuggestie',
      body: 'Je suggestie “{{title}}” heeft nu de status: {{status}}.{{note}}',
    },
    en: {
      title: 'Update on your purchase suggestion',
      body: 'Your suggestion “{{title}}” now has the status: {{status}}.{{note}}',
    },
  },
  REVIEW_MODERATED: {
    nl: {
      title: 'Je review is beoordeeld',
      body: 'Je review van “{{title}}” is {{status}}.{{note}}',
    },
    en: {
      title: 'Your review was moderated',
      body: 'Your review of “{{title}}” was {{status}}.{{note}}',
    },
  },
};

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

export function templateVars(data: TemplateData, locale: Locale): Record<string, string> {
  return {
    title: data.title ?? '',
    date: data.date ? date(data.date, locale) : '',
    days: data.days !== undefined ? String(data.days) : '',
    amount: data.amountCents !== undefined ? money(data.amountCents, locale) : '',
    status: data.status ?? '',
    note: data.note ? ` ${data.note}` : '',
  };
}

export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? '');
}

/** Rendert een melding; `override` (uit de database, door een admin aangepast) gaat voor op de standaardtekst. */
export function renderNotification(
  type: NotificationType,
  locale: string,
  data: TemplateData,
  override?: TemplateText | null,
): TemplateText {
  const l: Locale = locale === 'en' ? 'en' : 'nl';
  const tpl = override ?? DEFAULT_TEMPLATES[type][l];
  const vars = templateVars(data, l);
  return { title: fillTemplate(tpl.title, vars), body: fillTemplate(tpl.body, vars) };
}
