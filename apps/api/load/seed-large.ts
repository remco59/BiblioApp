/* Vult een aparte database met een realistisch grote collectie voor de load-test.
   Gebruik: DATABASE_URL=postgresql://…/biblio_load pnpm --filter @biblio/api load:seed */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();
const BOOKS = Number(process.env.LOAD_BOOKS ?? 5000);
const MEMBERS = Number(process.env.LOAD_MEMBERS ?? 600);

let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;

const WORDS =
  'huis zomer winter kust diner nacht schaduw koning dochter zoon vader moeder reis stad dorp rivier brug toren vuur water aarde lucht storm stilte geheim dagboek brief vriend vijand liefde oorlog vrede tijd droom spiegel muur poort tuin bos berg zee eiland schip kapitein soldaat dokter leraar schrijver kunstenaar muziek lied dans kleur zwart wit rood blauw groen goud zilver steen glas papier boek verhaal legende draak ridder prinses heks tovenaar wolf vos haas uil kraai paard hond kat vogel vis regen sneeuw mist zon maan ster'.split(
    ' ',
  );
const FIRST =
  'Anna Bram Carla Dirk Eva Finn Gijs Hanna Ivo Jet Kees Lotte Max Noor Otto Pien Quinten Roos Sem Tess Uko Vera Wout Yara Zeger'.split(
    ' ',
  );
const LAST =
  'Jansen De Vries Bakker Visser Smit Meijer Mulder Bos Vos Peters Hendriks Dekker Brouwer Dijkstra Kuipers Willems Veenstra Maas Postma Koster'.split(
    ' ',
  );
const GENRES = [
  'Thriller',
  'Roman',
  'Fantasy',
  'Educatief',
  'Historisch',
  'Kinderboek',
  'Poëzie',
  'Biografie',
  'Reizen',
  'Kookboek',
  'Wetenschap',
  'Sciencefiction',
];
const words = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isbn = (i: number) => {
  const p = `978${String(900000000 + i).padStart(9, '0')}`;
  return p + ((10 - ([...p].reduce((s, d, k) => s + Number(d) * (k % 2 ? 3 : 1), 0) % 10)) % 10);
};

async function main() {
  console.log(`Seed: ${BOOKS} boeken, ${MEMBERS} leden…`);
  const genres = await Promise.all(
    GENRES.map((name) => prisma.genre.upsert({ where: { name }, update: {}, create: { name } })),
  );
  const authorCount = Math.floor(BOOKS / 2);
  await prisma.author.createMany({
    data: Array.from({ length: authorCount }, () => ({
      name: `${pick(FIRST)} ${rnd() < 0.3 ? pick(['van', 'de']) + ' ' : ''}${pick(LAST)}`,
    })),
  });
  const authors = await prisma.author.findMany({ select: { id: true } });

  const batch = 1000;
  for (let from = 0; from < BOOKS; from += batch) {
    const n = Math.min(batch, BOOKS - from);
    await prisma.book.createMany({
      data: Array.from({ length: n }, (_, k) => ({
        title: cap(words(2 + Math.floor(rnd() * 3))),
        isbn: isbn(from + k),
        description: cap(words(25)) + '.',
        language: rnd() < 0.8 ? 'nl' : 'en',
        publishedYear: 1950 + Math.floor(rnd() * 75),
        genreId: pick(genres).id,
      })),
      skipDuplicates: true,
    });
  }
  const books = await prisma.book.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  await prisma.bookAuthor.createMany({
    data: books.flatMap((b) => [{ bookId: b.id, authorId: pick(authors).id }]),
    skipDuplicates: true,
  });
  let barcode = 0;
  for (let i = 0; i < books.length; i += batch) {
    await prisma.copy.createMany({
      data: books.slice(i, i + batch).flatMap((b) =>
        Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({
          bookId: b.id,
          barcode: `LT${String(++barcode).padStart(7, '0')}`,
        })),
      ),
    });
  }

  const passwordHash = await hash('Welkom-123456');
  const staff = await prisma.user.upsert({
    where: { email: 'load-staff@biblio.nl' },
    update: {},
    create: {
      email: 'load-staff@biblio.nl',
      name: 'Load Staff',
      passwordHash,
      role: 'LIBRARIAN',
      emailVerifiedAt: new Date(),
    },
  });
  void staff;
  await prisma.user.createMany({
    data: Array.from({ length: MEMBERS }, (_, i) => ({
      email: `load-member-${i}@example.nl`,
      name: `Lid ${i}`,
      passwordHash,
      emailVerifiedAt: new Date(),
    })),
    skipDuplicates: true,
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'load-member-' } },
    select: { id: true },
  });
  await prisma.member.createMany({
    data: users.map((u, i) => ({
      userId: u.id,
      memberNumber: `LM${String(i).padStart(5, '0')}`,
      membershipUntil: new Date(Date.now() + 365 * 86400000),
    })),
    skipDuplicates: true,
  });
  // Max leenlimiet ruim zetten: de belasting-test leent veel tegelijk
  await prisma.setting.upsert({
    where: { key: 'maxLoansPerMember' },
    update: { value: 50 },
    create: { key: 'maxLoansPerMember', value: 50 },
  });
  const [b, c, m] = await Promise.all([
    prisma.book.count(),
    prisma.copy.count(),
    prisma.member.count(),
  ]);
  console.log(`Klaar: ${b} boeken, ${c} exemplaren, ${m} leden.`);
}

main().finally(() => prisma.$disconnect());
