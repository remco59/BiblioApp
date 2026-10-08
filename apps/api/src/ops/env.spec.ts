import { validateEnv } from './env';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/biblio',
  WEB_ORIGIN: 'https://bibliotheek.example.nl',
  SMTP_HOST: 'smtp.example.nl',
  MAIL_FROM: 'Bibliotheek <noreply@example.nl>',
  METRICS_TOKEN: 'een-lang-genoeg-token-123',
};

describe('validateEnv', () => {
  it('doet niets buiten productie', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(validateEnv({})).toEqual([]);
  });

  it('accepteert een complete productieconfiguratie', () => {
    expect(validateEnv(good)).toEqual([]);
  });

  it('meldt ontbrekende en onveilige waarden', () => {
    const problems = validateEnv({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'http://example.nl',
      SMTP_HOST: 'localhost',
      PAYMENT_PROVIDER: 'mock',
      S3_ENDPOINT: 'http://minio:9000',
      S3_ACCESS_KEY: 'biblio',
      JOBS_DISABLED: '1',
      AUTH_RATE_LIMIT_MAX: 'tien',
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DATABASE_URL ontbreekt'),
        expect.stringContaining('https://'),
        expect.stringContaining('ontwikkelmailserver'),
        expect.stringContaining('MAIL_FROM ontbreekt'),
        expect.stringContaining('S3_ACCESS_KEY gebruikt een standaardwaarde'),
        expect.stringContaining('S3_SECRET_KEY ontbreekt'),
        expect.stringContaining('PAYMENT_PROVIDER=mock'),
        expect.stringContaining('METRICS_TOKEN'),
        expect.stringContaining('JOBS_DISABLED'),
        expect.stringContaining('AUTH_RATE_LIMIT_MAX moet een getal zijn'),
      ]),
    );
  });

  it('weigert een te kort metrics-token', () => {
    expect(validateEnv({ ...good, METRICS_TOKEN: 'kort' })).toEqual([
      expect.stringContaining('METRICS_TOKEN'),
    ]);
  });
});
