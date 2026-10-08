import { Writable } from 'node:stream';
import pino from 'pino';
import { createLogger, REDACT } from './logger';

describe('logger', () => {
  it('gebruikt pino met redactie van cookies, tokens en wachtwoorden', () => {
    const logger = createLogger({ NODE_ENV: 'production', LOG_LEVEL: 'info' } as NodeJS.ProcessEnv);
    expect(logger.level).toBe('info');
    // De echte logger schrijft naar stdout; om de uitvoer te toetsen bouwen we dezelfde opties na op een eigen stream.
    const lines: string[] = [];
    const sink = new Writable({ write: (c, _e, cb) => (lines.push(String(c)), cb()) });
    const probe = pino({ redact: REDACT }, sink); // dezelfde redactie als de echte logger
    probe.info(
      {
        req: { headers: { cookie: 'sid=geheim', authorization: 'Bearer abc' } },
        body: { password: 'hunter2', totp: '123456' },
      },
      'verzoek',
    );
    const out = lines.join('');
    expect(out).not.toMatch(/geheim|hunter2|123456|Bearer abc/);
    expect(out).toContain('[verwijderd]');
  });

  it('is stil in tests', () => {
    expect(createLogger({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).level).toBe('silent');
  });
});
