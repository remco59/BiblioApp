import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { dayShort, money } from '../../lib/format';

type Row = { period: string; loans: number; returns: number };
type Popular = { bookId: number; title: string; authors: string; loans: number };
type Fines = {
  issuedCents: number;
  collectedCents: number;
  waivedCents: number;
  outstandingCents: number;
};
type Overdue = {
  loanId: number;
  title: string;
  memberName: string;
  memberNumber: string;
  dueAt: string;
  daysLate: number;
  fineCents: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

/** "2026-10-03" → "3 okt", "2026-10" → "okt 2026". */
function periodLabel(p: string) {
  if (/^\d{4}-\d{2}$/.test(p))
    return new Date(`${p}-01`).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' });
  return dayShort(p);
}

function VolumeChart({ rows }: { rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.loans + r.returns, 0);
  if (total === 0)
    return <p className="empty">Geen uitleningen of inleveringen in deze periode.</p>;
  const max = Math.max(1, ...rows.flatMap((r) => [r.loans, r.returns]));
  const last = rows[rows.length - 1];
  const w = Math.max(rows.length * 18, 300);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} 140`}
        className="chart"
        role="img"
        aria-label={`Uitleenvolume per periode, ${rows.reduce((s, r) => s + r.loans, 0)} uitleningen en ${rows.reduce((s, r) => s + r.returns, 0)} inleveringen`}
      >
        {rows.map((r, i) => (
          <g key={r.period} transform={`translate(${i * 18 + 4},0)`}>
            <title>{`${periodLabel(r.period)}: ${r.loans} uitgeleend, ${r.returns} ingeleverd`}</title>
            <rect
              x={0}
              width={6}
              y={120 - (r.loans / max) * 110}
              height={(r.loans / max) * 110}
              className="bar-loans"
            />
            <rect
              x={7}
              width={6}
              y={120 - (r.returns / max) * 110}
              height={(r.returns / max) * 110}
              className="bar-returns"
            />
          </g>
        ))}
        <line x1={0} x2={w} y1={120} y2={120} className="axis" />
        <text x={2} y={136} className="axis-label">
          {rows[0] && periodLabel(rows[0].period)}
        </text>
        <text x={w - 2} y={136} textAnchor="end" className="axis-label">
          {last && periodLabel(last.period)}
        </text>
      </svg>
      <figcaption>
        <span className="swatch bar-loans" /> Uitgeleend <span className="swatch bar-returns" />{' '}
        Ingeleverd
      </figcaption>
    </figure>
  );
}

export function ReportsPage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 29 * DAY)));
  const [to, setTo] = useState(iso(today));
  const [interval, setIntervalValue] = useState<'day' | 'month'>('day');
  const [popular, setPopular] = useState<Popular[]>([]);
  const [volume, setVolume] = useState<Row[]>([]);
  const [fines, setFines] = useState<Fines | null>(null);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = { from, to };
    Promise.all([
      api.GET('/api/staff/reports/popular', { params: { query: { ...query, limit: '10' } } }),
      api.GET('/api/staff/reports/volume', { params: { query: { ...query, interval } } }),
      api.GET('/api/staff/reports/fines', { params: { query: { ...query, interval: 'month' } } }),
      api.GET('/api/staff/reports/overdue', { params: {} }),
    ]).then(([p, v, f, o]) => {
      setError(
        p.error || v.error
          ? 'Deze periode klopt niet: kies een begindatum vóór de einddatum.'
          : null,
      );
      setPopular(p.data ?? []);
      setVolume(v.data ?? []);
      setFines(f.data ?? null);
      setOverdue(o.data ?? []);
    });
  }, [from, to, interval]);

  const presets: [string, string, 'day' | 'month'][] = [
    ['Afgelopen 7 dagen', iso(new Date(today.getTime() - 6 * DAY)), 'day'],
    ['Afgelopen 30 dagen', iso(new Date(today.getTime() - 29 * DAY)), 'day'],
    ['Dit jaar', `${today.getFullYear()}-01-01`, 'month'],
  ];
  const activePreset = presets.find(
    ([, f, i]) => f === from && to === iso(today) && i === interval,
  );

  const csv = (name: string, extra = '') =>
    `/api/staff/reports/${name}?format=csv&from=${from}&to=${to}${extra}`;

  return (
    <>
      <h1>Rapportages</h1>
      <div className="segmented presets" role="group" aria-label="Snelle periode">
        {presets.map(([label, f, i]) => (
          <button
            key={label}
            type="button"
            aria-pressed={activePreset?.[0] === label}
            onClick={() => {
              setFrom(f);
              setTo(iso(today));
              setIntervalValue(i);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form className="field-row" onSubmit={(e) => e.preventDefault()} aria-label="Periode">
        <label className="field">
          <span>Van</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Tot en met</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          <span>Per</span>
          <select
            value={interval}
            onChange={(e) => setIntervalValue(e.target.value as 'day' | 'month')}
          >
            <option value="day">dag</option>
            <option value="month">maand</option>
          </select>
        </label>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <h2>Uitleenvolume</h2>
      <VolumeChart rows={volume} />
      <p>
        <a
          href={csv('volume', `&interval=${interval}`)}
          className="button secondary small"
          download
        >
          Uitleenvolume als CSV
        </a>
      </p>

      <h2>Populairste boeken</h2>
      {popular.length === 0 ? (
        <p className="empty">Geen uitleningen in deze periode.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Titel</th>
                <th scope="col">Auteur(s)</th>
                <th scope="col">Uitleningen</th>
              </tr>
            </thead>
            <tbody>
              {popular.map((p, i) => (
                <tr key={p.bookId}>
                  <td>{i + 1}</td>
                  <td>{p.title}</td>
                  <td>{p.authors}</td>
                  <td>{p.loans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        <a href={csv('popular')} className="button secondary small" download>
          Populairste boeken als CSV
        </a>
      </p>

      <h2>Boete-inkomsten</h2>
      {fines && (
        <dl>
          <dt>Uitgeschreven</dt>
          <dd>{money(fines.issuedCents)}</dd>
          <dt>Ontvangen</dt>
          <dd>{money(fines.collectedCents)}</dd>
          <dt>Kwijtgescholden</dt>
          <dd>{money(fines.waivedCents)}</dd>
          <dt>Nu openstaand (totaal)</dt>
          <dd>{money(fines.outstandingCents)}</dd>
        </dl>
      )}
      <p>
        <a href={csv('fines')} className="button secondary small" download>
          Boete-inkomsten als CSV
        </a>
      </p>

      <h2>Achterstanden (nu)</h2>
      {overdue.length === 0 ? (
        <p className="empty">Geen te late boeken.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Boek</th>
                <th scope="col">Lid</th>
                <th scope="col">Dagen te laat</th>
                <th scope="col">Boete</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((o) => (
                <tr key={o.loanId}>
                  <td>{o.title}</td>
                  <td>
                    {o.memberName} <small>{o.memberNumber}</small>
                  </td>
                  <td>{o.daysLate}</td>
                  <td>{money(o.fineCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        <a href="/api/staff/reports/overdue?format=csv" className="button secondary small" download>
          Achterstanden als CSV
        </a>
      </p>
    </>
  );
}
