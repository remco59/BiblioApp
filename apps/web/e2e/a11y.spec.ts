import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Automatische WCAG 2.1 A/AA-controle met axe (aangevuld met de handmatige checklist in docs/accessibility.md). */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('Welkom-123456');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
}

async function scan(page: Page, path: string, ready: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: ready }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')} — ${v.help}`,
  );
  expect(summary, `${path}\n${summary.join('\n')}`).toEqual([]);
}

const PUBLIC: [string, string | RegExp][] = [
  ['/', /Goede|Welkom/],
  ['/catalogus', 'Catalogus'],
  ['/catalogus?q=diner', 'Catalogus'],
  ['/catalogus?genre=Fantasy&available=true', 'Catalogus'],
  ['/login', 'Inloggen'],
  ['/register', 'Account aanmaken'],
  ['/forgot-password', 'Wachtwoord vergeten'],
  ['/privacy', 'Privacy'],
];

test.describe('toegankelijkheid (axe, WCAG 2.1 AA)', () => {
  test('controle: axe vindt bekende fouten (de audit slaagt dus niet vanzelf)', async ({
    page,
  }) => {
    await page.setContent(
      '<html lang="nl"><body><main><img src="x.png"><button></button><input><p style="color:#bbb;background:#fff">laag contrast</p></main></body></html>',
    );
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => v.id)).toEqual(
      expect.arrayContaining(['image-alt', 'button-name', 'label', 'color-contrast']),
    );
  });

  for (const [path, heading] of PUBLIC) {
    test(`publiek: ${path}`, async ({ page }) => scan(page, path, heading));
  }

  test('boekdetailpagina (met reviews, exemplaren en vergelijkbare boeken)', async ({ page }) => {
    await page.goto('/catalogus?q=Kruistocht');
    await page.getByRole('link', { name: 'Kruistocht in spijkerbroek' }).click();
    await expect(page.getByRole('heading', { name: 'Exemplaren' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([]);
  });

  test('donker thema: catalogus en login', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await scan(page, '/catalogus', 'Catalogus');
    await scan(page, '/login', 'Inloggen');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/catalogus');
    await page.getByLabel('Weergave').selectOption('dark');
    await scan(page, '/catalogus', 'Catalogus');
  });

  test('mobiele weergave: catalogus', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await scan(page, '/catalogus', 'Catalogus');
  });

  test('lid: persoonlijke pagina’s', async ({ page }) => {
    await loginAs(page, 'lid@biblio.nl');
    for (const [path, heading] of [
      ['/my/loans', 'Nu geleend'],
      ['/my/wishlist', 'Mijn bibliotheek'],
      ['/my/suggestions', 'Een boek voorstellen'],
      ['/notifications', 'Meldingen'],
      ['/profile', 'Mijn profiel'],
    ] as [string, string][]) {
      await scan(page, path, heading);
    }
  });

  test('medewerker: balie, leden, beheer, rapporten en moderatie', async ({ page }) => {
    await loginAs(page, 'bibliothecaris@biblio.nl');
    for (const [path, heading] of [
      ['/staff/desk', 'Balie'],
      ['/staff/members', 'Leden'],
      ['/staff/books', 'Collectiebeheer'],
      ['/staff/books/new', 'Nieuw boek'],
      ['/staff/lookups', /Auteurs, genres/],
      ['/staff/reservations', 'Reserveringen'],
      ['/staff/overdue', 'Te late boeken'],
      ['/staff/moderation', 'Reviews en suggesties'],
      ['/staff/reports', 'Rapportages'],
      ['/staff/labels', 'Barcode-etiketten'],
    ] as [string, string | RegExp][]) {
      await scan(page, path, heading);
    }
  });

  test('beheerder: instellingen, gebruikers, mailteksten en auditlog', async ({ page }) => {
    await loginAs(page, 'admin@biblio.nl');
    for (const [path, heading] of [
      ['/admin/settings', 'Instellingen'],
      ['/admin/users', 'Gebruikers en rollen'],
      ['/admin/templates', 'E-mailtemplates'],
      ['/admin/audit', 'Auditlog'],
    ] as [string, string][]) {
      await scan(page, path, heading);
    }
  });
});
