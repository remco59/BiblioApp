import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="nf-h">
      <div className="nf-gap" aria-hidden="true">
        <span />
        <span />
        <span className="missing" />
        <span />
      </div>
      <div className="plank" aria-hidden="true" />
      <h1 id="nf-h">Deze plank is leeg</h1>
      <p className="lede">
        De pagina die je zoekt bestaat niet (meer). Misschien is hij verplaatst.
      </p>
      <p className="actions">
        <Link className="button" to="/catalogus">
          Zoek in de catalogus
        </Link>
        <Link className="button secondary" to="/">
          Naar Ontdek
        </Link>
      </p>
    </section>
  );
}
