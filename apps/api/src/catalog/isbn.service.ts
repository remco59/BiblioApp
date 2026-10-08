import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export interface IsbnMetadata {
  isbn: string;
  title: string;
  authors: string[];
  description: string | null;
  publishedYear: number | null;
  language: string | null;
  coverUrl: string | null;
}

export const normalizeIsbn = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();

export function isValidIsbn(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((s, d, i) => s + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

const yearOf = (s: unknown) => {
  const m = /\d{4}/.exec(String(s ?? ''));
  return m ? Number(m[0]) : null;
};

const LANG: Record<string, string> = {
  dut: 'nl',
  nld: 'nl',
  eng: 'en',
  fre: 'fr',
  ger: 'de',
  spa: 'es',
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

@Injectable()
export class IsbnService {
  async lookup(raw: string): Promise<IsbnMetadata> {
    const isbn = normalizeIsbn(raw);
    if (!isValidIsbn(isbn)) throw new BadRequestException('Ongeldig ISBN');
    const found =
      (await this.openLibrary(isbn).catch(() => null)) ??
      (await this.googleBooks(isbn).catch(() => null));
    if (!found) throw new NotFoundException('Geen gegevens gevonden voor dit ISBN');
    return found;
  }

  private async openLibrary(isbn: string): Promise<IsbnMetadata | null> {
    const data = (await getJson(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    )) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const b = data[`ISBN:${isbn}`];
    if (!b?.title) return null;
    return {
      isbn,
      title: b.title,
      authors: (b.authors ?? []).map((a: { name: string }) => a.name),
      description: typeof b.notes === 'string' ? b.notes : null,
      publishedYear: yearOf(b.publish_date),
      language: null,
      coverUrl: b.cover?.large ?? b.cover?.medium ?? null,
    };
  }

  private async googleBooks(isbn: string): Promise<IsbnMetadata | null> {
    const data = (await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)) as {
      items?: { volumeInfo: Record<string, any> }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const v = data.items?.[0]?.volumeInfo;
    if (!v?.title) return null;
    return {
      isbn,
      title: v.title,
      authors: v.authors ?? [],
      description: v.description ?? null,
      publishedYear: yearOf(v.publishedDate),
      language: v.language ? (LANG[v.language] ?? v.language) : null,
      coverUrl: v.imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
    };
  }
}
