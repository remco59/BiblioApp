import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MemberDetail } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { FineTable } from '../../components/FineTable';
import { LoanTable } from '../../components/LoanTable';
import { dateNl, money } from '../../lib/format';

export function MemberDetailPage() {
  const id = Number(useParams().id);
  const [m, setM] = useState<MemberDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.GET('/api/staff/members/{id}', { params: { path: { id } } });
    setM(data ?? null);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(p: Promise<{ error?: unknown }>, ok: string) {
    const { error } = await p;
    setMessage(error ? { text: errorMessage(error), error: true } : { text: ok });
    void load();
  }

  if (!m) return <p>Laden…</p>;
  return (
    <>
      <p>
        <Link to="/staff/members">← Leden</Link>
      </p>
      <h1>
        {m.name} <small>{m.memberNumber}</small>
      </h1>
      <dl>
        <dt>E-mail</dt>
        <dd>{m.email}</dd>
        <dt>Lidmaatschap tot</dt>
        <dd>
          {dateNl(m.membershipUntil)}{' '}
          {!m.membershipValid && <span className="bad">(verlopen)</span>}
        </dd>
        <dt>Openstaande boetes</dt>
        <dd>{money(m.outstandingFinesCents)}</dd>
        <dt>Status</dt>
        <dd>
          {m.blocked ? (
            <span className="bad">Geblokkeerd{m.blockedReason ? `: ${m.blockedReason}` : ''}</span>
          ) : (
            'Actief'
          )}
        </dd>
      </dl>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
      <p className="actions">
        {m.blocked ? (
          <button
            onClick={() =>
              void run(
                api.PATCH('/api/staff/members/{id}/block', {
                  params: { path: { id } },
                  body: { blocked: false },
                }),
                'Lid is gedeblokkeerd',
              )
            }
          >
            Deblokkeren
          </button>
        ) : (
          <button
            className="secondary"
            onClick={() => {
              const reason = window.prompt('Reden voor blokkade?') ?? undefined;
              void run(
                api.PATCH('/api/staff/members/{id}/block', {
                  params: { path: { id } },
                  body: { blocked: true, reason },
                }),
                'Lid is geblokkeerd',
              );
            }}
          >
            Blokkeren
          </button>
        )}
        <button
          onClick={() =>
            void run(
              api.POST('/api/staff/members/{id}/extend', { params: { path: { id } }, body: {} }),
              'Lidmaatschap verlengd',
            )
          }
        >
          Lidmaatschap verlengen
        </button>
      </p>

      <h2>Uitleningen</h2>
      <LoanTable
        loans={m.loans}
        actions={(l) => (
          <>
            <button
              className="link"
              onClick={() =>
                void run(
                  api.POST('/api/staff/loans/{id}/renew', { params: { path: { id: l.id } } }),
                  'Verlengd',
                )
              }
            >
              Verlengen
            </button>{' '}
            <button
              className="link danger"
              onClick={() =>
                window.confirm(`“${l.title}” als verloren markeren?`) &&
                void run(
                  api.POST('/api/staff/loans/{id}/lost', { params: { path: { id: l.id } } }),
                  'Als verloren geregistreerd',
                )
              }
            >
              Verloren
            </button>
          </>
        )}
      />

      <h2>Boetes</h2>
      <FineTable
        fines={m.fines}
        actions={(f) => (
          <>
            <button
              className="link"
              onClick={() =>
                void run(
                  api.POST('/api/staff/fines/{id}/pay', {
                    params: { path: { id: f.id } },
                    body: { amountCents: f.outstandingCents },
                  }),
                  'Boete betaald',
                )
              }
            >
              Betaald ({money(f.outstandingCents)})
            </button>{' '}
            <button
              className="link danger"
              onClick={() =>
                void run(
                  api.POST('/api/staff/fines/{id}/waive', { params: { path: { id: f.id } } }),
                  'Boete kwijtgescholden',
                )
              }
            >
              Kwijtschelden
            </button>
          </>
        )}
      />
    </>
  );
}
