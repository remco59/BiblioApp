// Rendert public/icon.svg naar de PNG-iconen voor de PWA. Gebruik: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = readFileSync(join(root, 'icon.svg'), 'utf8');
const maskableSvg = svg
  .replace(/<rect[^>]*\/>/, '')
  .replace('<svg ', '<svg ')
  .replace('<g ', '<g transform="translate(256 256) scale(0.7) translate(-256 -256)" ');

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
async function render(file, size, content, background) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${background}"><div style="width:${size}px;height:${size}px">${content.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`,
  );
  await page.screenshot({ path: join(root, file), omitBackground: background === 'transparent' });
  console.log('geschreven', file);
}
await render('icon-192.png', 192, svg, 'transparent');
await render('icon-512.png', 512, svg, 'transparent');
// maskable: volledig gevuld vlak met het symbool in de veilige zone (80%)
await render(
  'icon-maskable-512.png',
  512,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1d4ed8"/>${maskableSvg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`,
  '#1d4ed8',
);
await browser.close();
