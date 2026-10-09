import { Icon } from './Icon';

/** Laadstaat: rustige plank-skeleton i.p.v. kale tekst. */
export function Loading({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="sr-only">{label}</span>
      <div className="loading-books" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="plank" aria-hidden="true" />
    </div>
  );
}

/** Foutstaat met herstelactie: zegt wat er misging en wat je kunt doen. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <p>
        <strong>{what} kon niet worden geladen.</strong> Controleer je verbinding en probeer het
        opnieuw.
      </p>
      <button type="button" className="secondary" onClick={onRetry}>
        <Icon name="retry" /> Opnieuw proberen
      </button>
    </div>
  );
}
