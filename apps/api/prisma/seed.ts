import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { GENRES } from '@biblio/shared';

const prisma = new PrismaClient();

/** Maakt van 12 cijfers een geldig ISBN-13 (zodat CSV-export/-import werkt). */
const withCheckDigit = (p12: string) =>
  p12 + ((10 - ([...p12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

const authors = [
  'Saskia Noort',
  'Herman Koch',
  'Tommy Wieringa',
  'Anna Enquist',
  'Thea Beckman',
  'Joost Zwagerman',
  'Esther Verhoef',
  'Dolf Verroen',
];

type Seed = {
  title: string;
  isbn: string;
  genre: (typeof GENRES)[number];
  year: number;
  authors: string[];
  copies: number;
};

const books: Seed[] = [
  {
    title: 'Terug naar de kust',
    isbn: '9789041400011',
    genre: 'Thriller',
    year: 2012,
    authors: ['Saskia Noort'],
    copies: 3,
  },
  {
    title: 'Het diner',
    isbn: '9789041400028',
    genre: 'Roman',
    year: 2009,
    authors: ['Herman Koch'],
    copies: 2,
  },
  {
    title: 'Joe Speedboot',
    isbn: '9789041400035',
    genre: 'Roman',
    year: 2005,
    authors: ['Tommy Wieringa'],
    copies: 2,
  },
  {
    title: 'Het geheim van de keel',
    isbn: '9789041400042',
    genre: 'Roman',
    year: 1999,
    authors: ['Anna Enquist'],
    copies: 1,
  },
  {
    title: 'Kruistocht in spijkerbroek',
    isbn: '9789041400059',
    genre: 'Fantasy',
    year: 1973,
    authors: ['Thea Beckman'],
    copies: 4,
  },
  {
    title: 'Gimmick!',
    isbn: '9789041400066',
    genre: 'Roman',
    year: 1989,
    authors: ['Joost Zwagerman'],
    copies: 1,
  },
  {
    title: 'Close-up',
    isbn: '9789041400073',
    genre: 'Thriller',
    year: 2008,
    authors: ['Esther Verhoef'],
    copies: 2,
  },
  {
    title: 'Wie niet weg is, is gezien',
    isbn: '9789041400080',
    genre: 'Fantasy',
    year: 1992,
    authors: ['Dolf Verroen'],
    copies: 2,
  },
  {
    title: 'Statistiek voor beginners',
    isbn: '9789041400097',
    genre: 'Educatief',
    year: 2019,
    authors: ['Anna Enquist', 'Herman Koch'],
    copies: 3,
  },
  {
    title: 'Programmeren in de praktijk',
    isbn: '9789041400103',
    genre: 'Educatief',
    year: 2021,
    authors: ['Tommy Wieringa'],
    copies: 2,
  },
];

/** Demo-accounts voor lokale ontwikkeling (wachtwoord: Welkom-123456). */
async function seedDemoUsers() {
  const passwordHash = await hash('Welkom-123456');
  const demo = [
    { email: 'admin@biblio.nl', name: 'Anna Admin', role: 'ADMIN' as const },
    { email: 'bibliothecaris@biblio.nl', name: 'Bas Bibliothecaris', role: 'LIBRARIAN' as const },
    { email: 'lid@biblio.nl', name: 'Lieke Lid', role: 'MEMBER' as const },
  ];
  for (const [i, d] of demo.entries()) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: { ...d, passwordHash, emailVerifiedAt: new Date() },
    });
    await prisma.member.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        memberNumber: `L${100001 + i}`,
        membershipUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
    });
  }
}

async function main() {
  const genreIds = new Map<string, number>();
  for (const name of GENRES) {
    const g = await prisma.genre.upsert({ where: { name }, update: {}, create: { name } });
    genreIds.set(name, g.id);
  }
  const authorIds = new Map<string, number>();
  for (const name of authors) {
    const existing = await prisma.author.findFirst({ where: { name } });
    const a = existing ?? (await prisma.author.create({ data: { name } }));
    authorIds.set(name, a.id);
  }
  for (const [i, b] of books.entries()) {
    const isbn = withCheckDigit(b.isbn.slice(0, 12));
    const found = await prisma.book.findFirst({ where: { title: b.title } });
    const book =
      found ??
      (await prisma.book.create({
        data: {
          title: b.title,
          isbn,
          publishedYear: b.year,
          genreId: genreIds.get(b.genre),
          authors: { create: b.authors.map((n) => ({ authorId: authorIds.get(n)! })) },
        },
      }));
    if (found && found.isbn !== isbn)
      await prisma.book.update({ where: { id: found.id }, data: { isbn } });
    for (let c = 1; c <= b.copies; c++) {
      const barcode = `BB${String(i + 1).padStart(3, '0')}${String(c).padStart(2, '0')}`;
      await prisma.copy.upsert({
        where: { barcode },
        update: {},
        create: { barcode, bookId: book.id },
      });
    }
  }
  if (process.env.NODE_ENV !== 'production') await seedDemoUsers();
  console.log(`Seed klaar: ${books.length} boeken.`);
}

main().finally(() => prisma.$disconnect());
