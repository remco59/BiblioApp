import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import type { components } from '@biblio/api-client';
import { api } from '../../api';

type Label = components['schemas']['LabelDto'];

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        height: 40,
        width: 1.6,
        fontSize: 12,
        margin: 0,
      });
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />;
}

export function LabelsPage() {
  const [params] = useSearchParams();
  const bookId = params.get('bookId');
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    api
      .GET('/api/staff/labels', { params: { query: { bookId: bookId ?? undefined } } })
      .then(({ data }) => setLabels(data ?? []));
  }, [bookId]);

  return (
    <>
      <div className="no-print">
        <p>
          <Link to="/staff/books">← Collectiebeheer</Link>
        </p>
        <h1>Barcode-etiketten</h1>
        <p>
          {labels.length} etiket(ten){bookId ? ' voor dit boek' : ' (alle exemplaren, max. 500)'}.
        </p>
        <button onClick={() => window.print()} disabled={labels.length === 0}>
          Afdrukken
        </button>
      </div>
      <ul className="labels">
        {labels.map((l) => (
          <li key={l.barcode}>
            <span className="label-title">{l.title}</span>
            <BarcodeSvg value={l.barcode} />
          </li>
        ))}
      </ul>
    </>
  );
}
