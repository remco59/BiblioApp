import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { money } from '../lib/format';

/** Simuleert de betaalpagina van een provider (alleen met PAYMENT_PROVIDER=mock). */
export function PayMockPage() {
  const { ref = '' } = useParams();
  const [params] = useSearchParams();
  const [info, setInfo] = useState<{
    amountCents: number;
    status: string;
    description: string;
  } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .GET('/api/payments/{ref}', { params: { path: { ref } } })
      .then(({ data }) => (data ? setInfo(data) : setError(true)));
  }, [ref]);

  async function finish(outcome: 'PAID' | 'FAILED') {
    await api.POST('/api/payments/mock/{ref}/complete', {
      params: { path: { ref } },
      body: { outcome },
    });
    const ret = params.get('return');
    window.location.href = ret && ret.startsWith(window.location.origin) ? ret : '/my/loans';
  }

  if (error) return <p role="alert">Betaling niet gevonden.</p>;
  if (!info) return <p>Laden…</p>;
  return (
    <section className="card">
      <h1>Testbetaling</h1>
      <p>
        <strong>Let op:</strong> dit is een nep-betaalpagina voor ontwikkeling. Er wordt geen echt
        geld afgeschreven.
      </p>
      <p>
        {info.description}: <strong>{money(info.amountCents)}</strong>
      </p>
      {info.status !== 'PENDING' ? (
        <p role="status">Deze betaling is al afgerond ({info.status}).</p>
      ) : (
        <p className="actions">
          <button onClick={() => void finish('PAID')}>Betaling slaagt</button>
          <button className="secondary" onClick={() => void finish('FAILED')}>
            Betaling mislukt
          </button>
        </p>
      )}
    </section>
  );
}
