export function Stars({ value, count }: { value: number | null; count?: number }) {
  if (value === null)
    return count === 0 ? <span className="meta">Nog geen beoordelingen</span> : null;
  const full = Math.round(value);
  const shown = value.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
  return (
    <span
      className="stars"
      role="img"
      aria-label={`${shown} van 5 sterren${count !== undefined ? `, ${count} ${count === 1 ? 'beoordeling' : 'beoordelingen'}` : ''}`}
    >
      <span aria-hidden="true">
        {'★'.repeat(full)}
        {'☆'.repeat(5 - full)}
      </span>
      <span className="meta" aria-hidden="true">
        {' '}
        {value.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        {count !== undefined && ` (${count})`}
      </span>
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="star-input">
      <legend>Je beoordeling</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n}>
          <input
            type="radio"
            name="rating"
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
          />
          <span aria-hidden="true">{n <= value ? '★' : '☆'}</span>
          <span className="sr-only">
            {n} {n === 1 ? 'ster' : 'sterren'}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
