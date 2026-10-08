import 'dotenv/config';
import { execSync } from 'node:child_process';

/** Tests draaien tegen een aparte database (`<db>_test`), zodat dev-data intact blijft. */
export default function globalSetup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) url.pathname += '_test';
  process.env.DATABASE_URL = url.toString();
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: __dirname + '/..' });
}
