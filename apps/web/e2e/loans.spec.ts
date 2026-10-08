import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('Welkom-123456');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
}

const BARCODE = 'BB00201'; // eerste exemplaar van het tweede seed-boek
const MEMBER = 'L100003'; // lid@biblio.nl

/** Zorgt dat het testexemplaar beschikbaar is, ook als een eerdere run is afgebroken. */
async function ensureReturned(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { email: 'bibliothecaris@biblio.nl', password: 'Welkom-123456' },
  });
  const { csrfToken } = await res.json();
  await request.post('/api/staff/loans/checkin', {
    data: { barcode: BARCODE },
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

test.beforeEach(async ({ request }) => {
  await ensureReturned(request);
});

test('balie: uitlenen, dubbel uitlenen weigeren en innemen', async ({ page }) => {
  await loginAs(page, 'bibliothecaris@biblio.nl');
  await page.goto('/staff/desk');

  await page.getByLabel('Lidnummer, naam of e-mail').fill(MEMBER);
  await page.getByLabel('Lidnummer, naam of e-mail').press('Enter');
  await expect(page.getByRole('heading', { name: new RegExp(MEMBER) })).toBeVisible();

  const copy = page.getByLabel('Scan exemplaar (barcode)');
  await copy.fill(BARCODE);
  await copy.press('Enter');
  await expect(page.getByText(/Uitgeleend: “.+” tot /)).toBeVisible();

  await copy.fill(BARCODE);
  await copy.press('Enter');
  await expect(page.getByText('Dit exemplaar is al uitgeleend')).toBeVisible();

  await page.getByRole('tab', { name: 'Innemen' }).click();
  const back = page.getByLabel('Scan ingeleverd exemplaar');
  await back.fill(BARCODE);
  await back.press('Enter');
  await expect(page.getByText(/Ingenomen: “.+”/)).toBeVisible();
});

test('lid ziet en verlengt een uitleen', async ({ page, browser }) => {
  // medewerker leent uit
  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await loginAs(staff, 'bibliothecaris@biblio.nl');
  await staff.goto('/staff/desk');
  await staff.getByLabel('Lidnummer, naam of e-mail').fill(MEMBER);
  await staff.getByLabel('Lidnummer, naam of e-mail').press('Enter');
  await expect(staff.getByRole('heading', { name: new RegExp(MEMBER) })).toBeVisible();
  await staff.getByLabel('Scan exemplaar (barcode)').fill(BARCODE);
  await staff.getByLabel('Scan exemplaar (barcode)').press('Enter');
  await expect(staff.getByText(/Uitgeleend: “.+”/)).toBeVisible();

  try {
    await loginAs(page, 'lid@biblio.nl');
    await page.getByRole('link', { name: 'Mijn bibliotheek' }).click();
    await expect(page.getByRole('heading', { name: 'Nu geleend' })).toBeVisible();
    await page.getByRole('button', { name: 'Lijst' }).click();
    const active = page.locator('table').first(); // "Nu geleend"
    await expect(active.getByRole('cell', { name: /verlengd/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Verlengen' }).click();
    await expect(page.getByText('Verlengd', { exact: true })).toBeVisible();
    await expect(active.getByRole('cell', { name: /1× verlengd/ })).toBeVisible();
  } finally {
    await staff.getByRole('tab', { name: 'Innemen' }).click();
    await staff.getByLabel('Scan ingeleverd exemplaar').fill(BARCODE);
    await staff.getByLabel('Scan ingeleverd exemplaar').press('Enter');
    await expect(staff.getByText(/Ingenomen: “.+”/)).toBeVisible();
    await staffCtx.close();
  }
});
