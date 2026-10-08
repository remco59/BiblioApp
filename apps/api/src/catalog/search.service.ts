import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export interface SearchResult {
  ids: number[];
  total: number;
  suggestion: string | null;
}

/**
 * Zoeken met Postgres full-text (Nederlands) + pg_trgm (typefouten) over titel, beschrijving,
 * auteur, tag en ISBN. Beschikbaarheid is altijd afgeleid uit de exemplaren.
 *
 * Opbouw: eerst een kandidatenlijst via UNION van losse, elk door een index gedekte voorwaarden
 * (GIN full-text, GIN trigram op titel en auteur, ISBN-unique); alleen die kandidaten worden daarna
 * gefilterd, gescoord en gesorteerd. Zo blijft zoeken snel bij een grote collectie.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(dto: SearchQueryDto): Promise<SearchResult & { page: number; pageSize: number }> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 12;
    const q = dto.q?.trim() || undefined;

    const where: Prisma.Sql[] = [];
    let score = Prisma.sql`0`;
    let from = Prisma.sql`"Book" b`;

    if (q) {
      const like = `%${escapeLike(q)}%`;
      const isbn = q.replace(/[\s-]/g, '');
      const tsv = Prisma.sql`to_tsvector('dutch', b."title" || ' ' || coalesce(b."description", ''))`;
      const tsq = Prisma.sql`websearch_to_tsquery('dutch', ${q})`;
      from = Prisma.sql`"Book" b JOIN (
        SELECT "id" FROM "Book" WHERE to_tsvector('dutch', "title" || ' ' || coalesce("description", '')) @@ websearch_to_tsquery('dutch', ${q})
        UNION SELECT "id" FROM "Book" WHERE "title" ILIKE ${like}
        UNION SELECT "id" FROM "Book" WHERE ${q} <% "title"
        UNION SELECT "id" FROM "Book" WHERE "isbn" = ${isbn}
        UNION SELECT ba."bookId" FROM "BookAuthor" ba JOIN "Author" a ON a."id" = ba."authorId" WHERE a."name" ILIKE ${like} OR ${q} <% a."name"
        UNION SELECT bt."bookId" FROM "BookTag" bt JOIN "Tag" t ON t."id" = bt."tagId" WHERE t."name" ILIKE ${like}
      ) cand ON cand."id" = b."id"`;
      const authorSim = Prisma.sql`coalesce((SELECT max(word_similarity(${q}, a."name")) FROM "BookAuthor" ba JOIN "Author" a ON a."id" = ba."authorId" WHERE ba."bookId" = b."id"), 0)`;
      score = Prisma.sql`(
        ts_rank(${tsv}, ${tsq}) * 2
        + word_similarity(${q}, b."title")
        + ${authorSim} * 0.8
        + (CASE WHEN b."isbn" = ${isbn} THEN 5 ELSE 0 END)
        + (CASE WHEN b."title" ILIKE ${like} THEN 0.5 ELSE 0 END)
      )`;
    }
    if (dto.genre)
      where.push(Prisma.sql`b."genreId" IN (SELECT "id" FROM "Genre" WHERE "name" = ${dto.genre})`);
    if (dto.language) where.push(Prisma.sql`b."language" = ${dto.language}`);
    if (dto.tag)
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "BookTag" bt JOIN "Tag" t ON t."id" = bt."tagId" WHERE bt."bookId" = b."id" AND t."name" = ${dto.tag})`,
      );
    if (dto.yearFrom !== undefined) where.push(Prisma.sql`b."publishedYear" >= ${dto.yearFrom}`);
    if (dto.yearTo !== undefined) where.push(Prisma.sql`b."publishedYear" <= ${dto.yearTo}`);
    if (dto.available)
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Copy" c WHERE c."bookId" = b."id" AND c."status" = 'AVAILABLE')`,
      );

    const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;
    const sort = dto.sort ?? (q ? 'relevance' : 'title');
    const orderBy = {
      relevance: Prisma.sql`score DESC, b."title" ASC`,
      title: Prisma.sql`lower(b."title") ASC, b."id" ASC`,
      year_desc: Prisma.sql`b."publishedYear" DESC NULLS LAST, lower(b."title") ASC`,
      year_asc: Prisma.sql`b."publishedYear" ASC NULLS LAST, lower(b."title") ASC`,
      newest: Prisma.sql`b."createdAt" DESC, b."id" DESC`,
    }[sort];

    // Drempel voor typefouten (0,5) geldt alleen binnen deze transactie/verbinding.
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.5', true)`,
      this.prisma.$queryRaw<{ id: number; total: bigint }[]>`
        SELECT b."id", ${score} AS score, count(*) OVER () AS total
        FROM ${from} ${whereSql}
        ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ]);

    let total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && page > 1) {
      // Pagina voorbij het einde: het totaal ophalen zodat de UI kan terugschakelen
      const [, count] = await this.prisma.$transaction([
        this.prisma
          .$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.5', true)`,
        this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM ${from} ${whereSql}`,
      ]);
      total = Number(count[0]?.n ?? 0);
    }
    const suggestion = total === 0 && q ? await this.suggest(q) : null;
    return { ids: rows.map((r) => r.id), total, page, pageSize, suggestion };
  }

  /** “Bedoelde je…”: dichtstbijzijnde titel of auteur op trigram-gelijkenis (index-gedekt via de %-operator). */
  private async suggest(q: string): Promise<string | null> {
    const [, rows] = await this.prisma.$transaction([
      this.prisma.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', '0.2', true)`,
      this.prisma.$queryRaw<{ label: string }[]>`
        SELECT label FROM (
          SELECT "title" AS label, similarity("title", ${q}) AS s FROM "Book" WHERE "title" % ${q}
          UNION ALL
          SELECT "name" AS label, similarity("name", ${q}) AS s FROM "Author" WHERE "name" % ${q}
        ) x ORDER BY s DESC LIMIT 1`,
    ]);
    return rows[0]?.label ?? null;
  }
}
