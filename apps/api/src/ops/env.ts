/** Controleert de omgevingsvariabelen. In productie moeten onveilige of ontbrekende waarden de start tegenhouden. */
export function validateEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const need = (key: string, hint: string) => {
    if (!env[key]?.trim()) problems.push(`${key} ontbreekt (${hint})`);
  };

  need('DATABASE_URL', 'postgresql://gebruiker:wachtwoord@host:5432/db');
  need('WEB_ORIGIN', 'bijv. https://bibliotheek.example.nl');
  if (env.WEB_ORIGIN && !env.WEB_ORIGIN.startsWith('https://'))
    problems.push('WEB_ORIGIN moet met https:// beginnen');

  need('SMTP_HOST', 'mailserver voor meldingen en verificatie');
  if (env.SMTP_HOST && ['localhost', '127.0.0.1', 'mailpit'].includes(env.SMTP_HOST)) {
    problems.push('SMTP_HOST wijst naar een ontwikkelmailserver');
  }
  need('MAIL_FROM', 'bijv. "Bibliotheek <noreply@example.nl>"');

  if (env.S3_ENDPOINT) {
    const defaults = ['biblio', 'biblio-secret', 'minioadmin'];
    for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      if (!env[key]?.trim()) problems.push(`${key} ontbreekt`);
      else if (defaults.includes(env[key]!)) problems.push(`${key} gebruikt een standaardwaarde`);
    }
  }

  if (env.PAYMENT_PROVIDER === 'mock')
    problems.push('PAYMENT_PROVIDER=mock is alleen voor ontwikkeling');

  if (!env.METRICS_TOKEN || env.METRICS_TOKEN.length < 16)
    problems.push('METRICS_TOKEN ontbreekt of is korter dan 16 tekens');

  for (const key of ['AUTH_RATE_LIMIT_MAX', 'RATE_LIMIT_MAX']) {
    if (env[key] !== undefined && !/^\d+$/.test(env[key]!))
      problems.push(`${key} moet een getal zijn`);
  }
  if (env.JOBS_DISABLED === '1')
    problems.push(
      'JOBS_DISABLED=1 zet de nachtelijke jobs en e-mail uit; niet gebruiken in productie',
    );
  return problems;
}
