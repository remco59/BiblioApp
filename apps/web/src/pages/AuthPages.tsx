import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      {children}
    </section>
  );
}

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        required
        minLength={props.minLength}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error: err } = await api.POST('/api/auth/login', {
      body: { email, password, totp: totp || undefined },
    });
    if (data) {
      setUser(data);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } else {
      if ((err as { code?: string } | undefined)?.code === 'TOTP_REQUIRED') {
        setNeedsCode(true);
        setError(null);
      } else setError(errorMessage(err));
    }
  }

  return (
    <Card title="Inloggen">
      <form onSubmit={submit}>
        <Field
          label="E-mailadres"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="username"
        />
        <Field
          label="Wachtwoord"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {needsCode && (
          <label className="field">
            <span>2FA-code (of herstelcode)</span>
            <input
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              required
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit">Inloggen</button>
      </form>
      <p>
        <Link to="/forgot-password">Wachtwoord vergeten?</Link> ·{' '}
        <Link to="/register">Account aanmaken</Link>
      </p>
    </Card>
  );
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await api.POST('/api/auth/register', {
      body: { name, email, password },
    });
    if (err) setError(errorMessage(err));
    else setDone(true);
  }

  if (done)
    return (
      <Card title="Controleer je e-mail">
        <p role="status">We hebben een bevestigingslink gestuurd naar {email}.</p>
        <p>
          <Link to="/login">Naar inloggen</Link>
        </p>
      </Card>
    );
  return (
    <Card title="Account aanmaken">
      <form onSubmit={submit}>
        <Field label="Naam" value={name} onChange={setName} autoComplete="name" />
        <Field
          label="E-mailadres"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <Field
          label="Wachtwoord (minimaal 10 tekens)"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={10}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit">Registreren</button>
      </form>
      <p>
        Al een account? <Link to="/login">Inloggen</Link>
      </p>
    </Card>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');

  async function verify() {
    const { error } = await api.POST('/api/auth/verify-email', { body: { token } });
    setState(error ? 'error' : 'ok');
  }

  return (
    <Card title="E-mailadres bevestigen">
      {state === 'idle' && <button onClick={verify}>Bevestig mijn e-mailadres</button>}
      {state === 'ok' && (
        <p role="status">
          Bevestigd! <Link to="/login">Nu inloggen</Link>
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="error">
          Ongeldige of verlopen link.
        </p>
      )}
    </Card>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await api.POST('/api/auth/forgot-password', { body: { email } });
    setSent(true);
  }

  return (
    <Card title="Wachtwoord vergeten">
      {sent ? (
        <p role="status">
          Als dit adres bij ons bekend is, ontvang je een e-mail met een resetlink.
        </p>
      ) : (
        <form onSubmit={submit}>
          <Field
            label="E-mailadres"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <button type="submit">Verstuur resetlink</button>
        </form>
      )}
      <p>
        <Link to="/login">Terug naar inloggen</Link>
      </p>
    </Card>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await api.POST('/api/auth/reset-password', {
      body: { token, password },
    });
    if (err) setError(errorMessage(err));
    else setDone(true);
  }

  return (
    <Card title="Nieuw wachtwoord">
      {done ? (
        <p role="status">
          Wachtwoord gewijzigd. <Link to="/login">Inloggen</Link>
        </p>
      ) : (
        <form onSubmit={submit}>
          <Field
            label="Nieuw wachtwoord (minimaal 10 tekens)"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={10}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit">Wachtwoord opslaan</button>
        </form>
      )}
    </Card>
  );
}
