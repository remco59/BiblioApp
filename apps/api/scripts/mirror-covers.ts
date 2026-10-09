import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { mirrorCover } from '../src/catalog/cover-mirror';
import { StorageService } from '../src/catalog/storage.service';

/** Eenmalig: haalt alle nog externe covers (bv. Open Library) binnen in onze eigen opslag. */
const prisma = new PrismaClient();
const storage = new StorageService();

async function main() {
  const books = await prisma.book.findMany({
    where: { coverKey: null, coverUrl: { startsWith: 'http' } },
    select: { id: true, title: true, coverUrl: true },
  });
  let ok = 0;
  for (const b of books) {
    const coverKey = await mirrorCover(storage, b.coverUrl!);
    if (coverKey) {
      await prisma.book.update({ where: { id: b.id }, data: { coverKey } });
      ok++;
    } else console.warn(`Overgeslagen: #${b.id} ${b.title} (${b.coverUrl})`);
  }
  console.log(`${ok}/${books.length} covers binnengehaald.`);
}

main().finally(() => prisma.$disconnect());
