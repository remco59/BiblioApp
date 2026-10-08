/* Belastingtest voor zoeken en de uitleenflow. Gebruik: pnpm --filter @biblio/api load:run
   Omgeving: BASE_URL (http://localhost:3300), DURATION_S (15), CONCURRENCY (20), DATABASE_URL (voor de integriteitscontrole) */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE_URL ?? 'http://localhost:3300';
const DURATION = Number(process.env.DURATION_S ?? 15) * 1000;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const prisma = new PrismaClient();

interface Stat {
  name: string;
  latencies: number[];
  ok: number;
  failed: number;
  status: Record<string, number>;
}
const stats = new Map<string, Stat>();
const stat = (name: string) =>
  stats.get(name) ??
  (stats.set(name, { name, latencies: [], ok: 0, failed: 0, status: {} }), stats.get(name)!);

async function timed(
  name: string,
  input: string,
  init: RequestInit = {},
  expect: number[] = [200, 201],
): Promise<{ status: number }> {
  const s = stat(name);
  const t0 = performance.now();
  let status = 0;
  try {
    const res = await fetch(`${BASE}${input}`, init);
    status = res.status;
    await res.arrayBuffer(); // body volledig lezen zodat de verbinding vrijkomt
  } catch {
    status = 0;
  }
  s.latencies.push(performance.now() - t0);
  s.status[status] = (s.status[status] ?? 0) + 1;
  if (expect.includes(status)) s.ok++;
  else s.failed++;
  return { status };
}

const pct = (xs: number[], p: number) =>
  xs.length
    ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!
    : 0;
const sample = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

async function pool(workers: number, until: number, job: (worker: number) => Promise<void>) {
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      while (performance.now() < until) await job(w);
    }),
  );
}

async function main() {
  const WORDS =
    'huis zomer winter kust nacht schaduw koning dochter reis stad dorp rivier brug toren vuur water storm geheim dagboek brief vriend liefde oorlog droom spiegel tuin bos berg zee eiland schip draak ridder'.split(
      ' ',
    );
  const typo = (w: string) => w.slice(0, -1) + (w.at(-1) === 'e' ? 'a' : 'e') + w.slice(-1);
  const queries = () => {
    const kind = Math.random();
    const w = sample(WORDS);
    if (kind < 0.35) return `q=${w}`;
    if (kind < 0.55) return `q=${w}+${sample(WORDS)}`;
    if (kind < 0.7) return `q=${encodeURIComponent(typo(w))}`;
    if (kind < 0.8) return `q=${sample(['Jansen', 'Bakker', 'Vries', 'Visser'])}`;
    if (kind < 0.9)
      return `q=${w}&genre=${sample(['Thriller', 'Roman', 'Fantasy'])}&available=true&sort=year_desc`;
    return `q=${w}&language=nl&yearFrom=1980&yearTo=2010&page=${1 + Math.floor(Math.random() * 3)}`;
  };

  // --- inloggen als medewerker
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'load-staff@biblio.nl', password: 'Welkom-123456' }),
  });
  if (!login.ok) throw new Error(`Inloggen mislukt (${login.status}); is de load-database geseed?`);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const { csrfToken } = (await login.json()) as { csrfToken: string };
  const staff = { 'content-type': 'application/json', cookie, 'x-csrf-token': csrfToken };

  const books = await prisma.book.findMany({ select: { id: true }, take: 2000 });
  const copies = await prisma.copy.findMany({
    where: { status: 'AVAILABLE' },
    select: { barcode: true },
    take: CONCURRENCY * 3 + 100,
  });
  const members = await prisma.member.findMany({
    where: { memberNumber: { startsWith: 'LM' } },
    select: { memberNumber: true },
    take: 200,
  });

  // --- A: zoeken
  console.log(`A. zoeken: ${CONCURRENCY} gelijktijdig, ${DURATION / 1000}s`);
  await pool(CONCURRENCY, performance.now() + DURATION, async () => {
    await timed('zoeken', `/api/books?${queries()}`);
  });
  // --- B: bladeren (lijst, detail, filters)
  console.log('B. bladeren (lijst, detail, filters)');
  await pool(CONCURRENCY, performance.now() + DURATION / 2, async () => {
    const r = Math.random();
    if (r < 0.5) await timed('detail', `/api/books/${sample(books).id}`);
    else if (r < 0.8)
      await timed('lijst', `/api/books?page=${1 + Math.floor(Math.random() * 50)}&pageSize=12`);
    else await timed('filters', '/api/catalog/filters');
  });

  // --- C: uitlenen en innemen (elke worker met eigen exemplaar en lid: geen onderlinge conflicten)
  const lendWorkers = Math.min(CONCURRENCY, copies.length, members.length);
  console.log(`C. uitleenflow: ${lendWorkers} gelijktijdige balies (uitlenen + innemen)`);
  await pool(lendWorkers, performance.now() + DURATION, async (w) => {
    const barcode = copies[w]!.barcode;
    const memberNumber = members[w]!.memberNumber;
    await timed('uitlenen', '/api/staff/loans/checkout', {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ memberNumber, barcode }),
    });
    await timed('innemen', '/api/staff/loans/checkin', {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ barcode }),
    });
  });

  // --- D: wedstrijd om één exemplaar: per ronde mag precies één uitlening slagen
  const rounds = 20;
  const racers = Math.min(50, members.length);
  console.log(
    `D. concurrency: ${rounds} rondes met ${racers} gelijktijdige uitleenpogingen op één exemplaar`,
  );
  let badRounds = 0;
  const contested = copies[copies.length - 1]!.barcode;
  for (let r = 0; r < rounds; r++) {
    const results = await Promise.all(
      members.slice(0, racers).map((m) =>
        timed(
          'uitlenen-wedstrijd',
          '/api/staff/loans/checkout',
          {
            method: 'POST',
            headers: staff,
            body: JSON.stringify({ memberNumber: m.memberNumber, barcode: contested }),
          },
          [201, 409],
        ),
      ),
    );
    const wins = results.filter((x) => x.status === 201).length;
    if (wins !== 1) badRounds++;
    await timed('innemen', '/api/staff/loans/checkin', {
      method: 'POST',
      headers: staff,
      body: JSON.stringify({ barcode: contested }),
    });
  }

  // --- integriteit na afloop
  const [doubleLoans, stuck, statusMismatch] = await Promise.all([
    prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM (SELECT "copyId" FROM "Loan" WHERE "returnedAt" IS NULL GROUP BY 1 HAVING count(*) > 1) x`,
    prisma.loan.count({ where: { returnedAt: null } }),
    prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM "Copy" c WHERE (c."status" = 'LOANED') <> EXISTS (SELECT 1 FROM "Loan" l WHERE l."copyId" = c."id" AND l."returnedAt" IS NULL)`,
  ]);

  // --- rapport
  const rows = [...stats.values()].map((s) => ({
    scenario: s.name,
    verzoeken: s.latencies.length,
    'fout%': ((s.failed / Math.max(1, s.latencies.length)) * 100).toFixed(2),
    p50: `${pct(s.latencies, 50).toFixed(0)} ms`,
    p95: `${pct(s.latencies, 95).toFixed(0)} ms`,
    p99: `${pct(s.latencies, 99).toFixed(0)} ms`,
    max: `${Math.max(...s.latencies).toFixed(0)} ms`,
  }));
  console.table(rows);
  console.log(
    `Integriteit: dubbele actieve uitleningen=${doubleLoans[0]!.n}, openstaande uitleningen=${stuck}, status-inconsistenties=${statusMismatch[0]!.n}, wedstrijdrondes met ≠1 winnaar=${badRounds}`,
  );

  // --- drempelwaarden
  const limits: Record<string, number> = {
    zoeken: 400,
    detail: 250,
    lijst: 250,
    filters: 200,
    uitlenen: 500,
    innemen: 500,
  };
  const problems: string[] = [];
  for (const [name, limit] of Object.entries(limits)) {
    const s = stats.get(name);
    if (s && pct(s.latencies, 95) > limit)
      problems.push(`${name}: p95 ${pct(s.latencies, 95).toFixed(0)} ms > ${limit} ms`);
  }
  for (const s of stats.values())
    if (s.failed > 0)
      problems.push(`${s.name}: ${s.failed} onverwachte antwoorden ${JSON.stringify(s.status)}`);
  if (Number(doubleLoans[0]!.n) > 0 || Number(statusMismatch[0]!.n) > 0 || badRounds > 0)
    problems.push('integriteitsfout in de uitleenflow');
  if (problems.length) {
    console.error(`\nDrempels overschreden:\n- ${problems.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAlle drempels gehaald.');
  }
}

main().finally(() => prisma.$disconnect());
