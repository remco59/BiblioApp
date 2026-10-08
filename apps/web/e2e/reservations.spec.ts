import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BARCODE = 'BB00401'; // enige exemplaar van een seed-boek
const TITLE = 'Het geheim van de keel';
const BORROWER = 'L100001'; // admin@biblio.nl leent het boek uit

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('Welkom-123456');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
}

async function apiLogin(request: APIRequestContext, email: string) {
  const res = await request.post('/api/auth/login', { data: { email, password: 'Welkom-123456' } });
  const { csrfToken } = await res.json();
  return { 'X-CSRF-Token': csrfToken as string };
}

/** Zet de testdata terug, ook na een afgebroken run. */
async function cleanup(request: APIRequestContext) {
  const lid = await apiLogin(request, 'lid@biblio.nl');
  for (const r of await (await request.get('/api/me/reservations')).json()) {
    await request.post(`/api/me/reservations/${r.id}/cancel`, { headers: lid });
  }
  const staff = await apiLogin(request, 'bibliothecaris@biblio.nl');
  await request.post('/api/staff/loans/checkin', { data: { barcode: BARCODE }, headers: staff });
  // een klaargelegd exemplaar staat na inname op RESERVED_HOLD voor het volgende lid: opnieuw annuleren
  const lid2 = await apiLogin(request, 'lid@biblio.nl');
  for (const r of await (await request.get('/api/me/reservations')).json()) {
    await request.post(`/api/me/reservations/${r.id}/cancel`, { headers: lid2 });
  }
}

test.beforeEach(async ({ request }) => cleanup(request));
test.afterEach(async ({ request }) => cleanup(request));

test('reserveren, klaarleggen bij inname en live melding aan het lid', async ({ browser }) => {
  const staffCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  const lid = await memberCtx.newPage();

  // 1. Medewerker leent het enige exemplaar uit aan een ander lid
  await loginAs(staff, 'bibliothecaris@biblio.nl');
  await staff.goto('/staff/desk');
  await staff.getByLabel('Lidnummer, naam of e-mail').fill(BORROWER);
  await staff.getByLabel('Lidnummer, naam of e-mail').press('Enter');
  await expect(staff.getByRole('heading', { name: new RegExp(BORROWER) })).toBeVisible();
  await staff.getByLabel('Scan exemplaar (barcode)').fill(BARCODE);
  await staff.getByLabel('Scan exemplaar (barcode)').press('Enter');
  await expect(staff.getByText(/Uitgeleend: “.+”/)).toBeVisible();

  // 2. Lid ziet het boek niet beschikbaar en reserveert
  await loginAs(lid, 'lid@biblio.nl');
  await lid.goto('/catalogus?q=' + encodeURIComponent(TITLE));
  await lid.getByRole('link', { name: TITLE }).click();
  await expect(lid.getByText(/0 van 1 beschikbaar/)).toBeVisible();
  await lid.getByRole('button', { name: 'Reserveren' }).click();
  await expect(lid.getByText(/Je staat op plek/)).toBeVisible();
  await expect(lid.getByText('plek 1', { exact: false })).toBeVisible();

  // 3. Medewerker neemt het boek in: moet apart gelegd worden voor het lid
  await staff.getByRole('tab', { name: 'Innemen' }).click();
  await staff.getByLabel('Scan ingeleverd exemplaar').fill(BARCODE);
  await staff.getByLabel('Scan ingeleverd exemplaar').press('Enter');
  await expect(staff.getByText(/LEG APART: gereserveerd voor/)).toBeVisible();

  // 4. Zonder herladen krijgt het lid de realtime update en een melding
  await expect(lid.getByText('Je reservering ligt klaar!')).toBeVisible({ timeout: 10_000 });
  await expect(lid.getByRole('link', { name: /Meldingen, \d+ ongelezen/ })).toBeVisible();
  await lid.getByRole('link', { name: /Meldingen/ }).click();
  await expect(
    lid.getByRole('heading', { name: 'Je reservering ligt klaar' }).first(),
  ).toBeVisible();
  await lid.getByRole('button', { name: 'Alles als gelezen markeren' }).click();
  await expect(lid.getByText('Alles gelezen')).toBeVisible();

  await staffCtx.close();
  await memberCtx.close();
});

test('staff ziet reserveringen en te late boeken', async ({ page, playwright }) => {
  // aparte API-contexten, zodat de sessies (cookies) van lid en medewerker gescheiden blijven
  const lidApi = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
  const staffApi = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
  const lid = await apiLogin(lidApi, 'lid@biblio.nl');
  const staff = await apiLogin(staffApi, 'bibliothecaris@biblio.nl');
  await staffApi.post('/api/staff/loans/checkout', {
    data: { memberNumber: BORROWER, barcode: BARCODE },
    headers: staff,
  });
  const books = await (await lidApi.get('/api/books?q=geheim')).json();
  await lidApi.post('/api/me/reservations', { data: { bookId: books.items[0].id }, headers: lid });
  await lidApi.dispose();
  await staffApi.dispose();

  await loginAs(page, 'bibliothecaris@biblio.nl');
  await page.getByRole('link', { name: 'Reserveringen' }).click();
  await expect(page.getByRole('heading', { name: 'Reserveringen' })).toBeVisible();
  await expect(
    page.getByRole('row', { name: /Het geheim van de keel.*Wachtrij plek 1/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Te laat' }).click();
  await expect(page.getByRole('heading', { name: 'Te late boeken' })).toBeVisible();
});
