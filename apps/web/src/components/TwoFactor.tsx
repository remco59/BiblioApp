import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';

export function TwoFactor() {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string>('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 192 }).then(setQr);
  }, [setup]);

  if (!user) return null;
  const enabled = user.totpEnabled;

  async function start() {
    const { data, error } = await api.POST('/api/auth/2fa/setup');
    if (data) setSetup(data);
    else setMessage({ text: errorMessage(error), error: true });
  }
  async function enable(e: FormEvent) {
    e.preventDefault();
    const { data, error } = await api.POST('/api/auth/2fa/enable', { body: { code } });
    if (!data) return setMessage({ text: errorMessage(error), error: true });
    setCodes(data.codes);
    setSetup(null);
    setCode('');
    setUser({ ...user!, totpEnabled: true });
  }
  async function disable(e: FormEvent) {
    e.preventDefault();
    const { error } = await api.POST('/api/auth/2fa/disable', { body: { password, code } });
    if (error) return setMessage({ text: errorMessage(error), error: true });
    setUser({ ...user!, totpEnabled: false });
    setPassword('');
    setCode('');
    setMessage({ text: 'Tweestapsverificatie uitgeschakeld' });
  }

  return (
    <section aria-labelledby="2fa-h">
      <h2 id="2fa-h">Tweestapsverificatie (2FA)</h2>
      {codes && (
        <div role="status" className="reserve ready">
          <p>
            <strong>2FA staat aan.</strong> Bewaar deze herstelcodes veilig; ze werken elk één keer
            en worden niet opnieuw getoond.
          </p>
          <ul className="codes">
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={() => setCodes(null)}>
            Ik heb ze bewaard
          </button>
        </div>
      )}
      {!enabled && !setup && (
        <>
          <p>Beveilig je account met een code uit een authenticator-app.</p>
          <button onClick={() => void start()}>2FA instellen</button>
        </>
      )}
      {setup && (
        <form onSubmit={enable}>
          <p>
            Scan de QR-code met je authenticator-app (of voer het geheim handmatig in) en bevestig
            met de 6-cijferige code.
          </p>
          {qr && <img src={qr} alt="QR-code voor je authenticator-app" width={192} height={192} />}
          <p>
            Geheim: <code>{setup.secret}</code>
          </p>
          <label className="field">
            <span>Code uit de app</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit">Bevestigen en inschakelen</button>
        </form>
      )}
      {enabled && !codes && (
        <form onSubmit={disable}>
          <p>
            2FA is ingeschakeld. Uitschakelen vraagt je wachtwoord en een code (of herstelcode).
          </p>
          <label className="field">
            <span>Wachtwoord</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            <span>Code of herstelcode</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit" className="secondary">
            2FA uitschakelen
          </button>
        </form>
      )}
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
          {message.text}
        </p>
      )}
    </section>
  );
}
