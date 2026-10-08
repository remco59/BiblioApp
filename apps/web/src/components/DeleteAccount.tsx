import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';

/** AVG: recht op vergetelheid. Vraagt wachtwoord (en 2FA-code) en een expliciete bevestiging. */
export function DeleteAccount() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user || user.role === 'ADMIN') return null; // beheerders: eerst de rol verlagen

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!window.confirm('Weet je het zeker? Dit kan niet ongedaan worden gemaakt.')) return;
    const { error: err } = await api.POST('/api/me/account/delete', {
      body: { password, code: code || undefined },
    });
    if (err) return setError(errorMessage(err));
    setUser(null);
    navigate('/', { replace: true });
  }

  return (
    <section aria-labelledby="delete-h">
      <h2 id="delete-h">Account verwijderen</h2>
      <p>
        Je gegevens worden gewist of onherkenbaar gemaakt, zie <Link to="/privacy">privacy</Link>.
        Dit kan alleen als je geen boeken meer geleend hebt en geen boetes open hebt staan.
      </p>
      {!open ? (
        <button className="secondary danger-btn" onClick={() => setOpen(true)}>
          Account verwijderen…
        </button>
      ) : (
        <form onSubmit={submit}>
          <label className="field">
            <span>Wachtwoord ter bevestiging</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {user.totpEnabled && (
            <label className="field">
              <span>2FA-code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" className="danger-btn">
            Definitief verwijderen
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            Annuleren
          </button>
        </form>
      )}
    </section>
  );
}
