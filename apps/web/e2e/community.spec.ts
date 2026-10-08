import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const BARCODE = 'BB00601'; // enige exemplaar van "Gimmick!"
const TITLE = 'Gimmick!';
const LID = 'L100003';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('Welkom-123456');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
}

async function apiLogin(request: APIRequestContext, email: string) {
  const res = await request.post('/api/auth/login', { data: { email, password: 'Welkom-123456' } });
  return { 'X-CSRF-Token': (await res.json()).csrfToken as string };
}

/** Zorgt dat het testexemplaar beschikbaar is en verwijdert reviews, suggesties en verlanglijst van het testlid. */
async function cleanup(playwright: import('@playwright/test').PlaywrightWorkerArgs['playwright']) {
  const staffApi = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
  const lidApi = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
  const staff = await apiLogin(staffApi, 'bibliothecaris@biblio.nl');
  const lid = await apiLogin(lidApi, 'lid@biblio.nl');
  await staffApi.post('/api/staff/loans/checkin', { data: { barcode: BARCODE }, headers: staff });
  const books = await (await lidApi.get(`/api/books?q=${TITLE}`)).json();
  const id = books.items[0].id;
  await lidApi.delete(`/api/me/reviews/${id}`, { headers: lid });
  await lidApi.delete(`/api/me/wishlist/${id}`, { headers: lid });
  await lidApi.dispose();
  await staffApi.dispose();
}

test.beforeEach(async ({ playwright }) => cleanup(playwright));
test.afterEach(async ({ playwright }) => cleanup(playwright));

test('lid leent, schrijft een review, medewerker keurt goed en de sterren verschijnen', async ({
  browser,
}) => {
  const staffCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  const lid = await memberCtx.newPage();

  // (Dat je zonder uitleen niet kunt reviewen is in de API-tests gedekt; dev-data kan al een uitleen bevatten.)
  await loginAs(lid, 'lid@biblio.nl');
  await lid.goto('/catalogus?q=' + TITLE);
  await lid.getByRole('link', { name: TITLE }).click();
  await expect(lid.getByRole('heading', { name: 'Reviews' })).toBeVisible();

  // Medewerker leent het boek uit aan het lid en neemt het weer in
  await loginAs(staff, 'bibliothecaris@biblio.nl');
  await staff.goto('/staff/desk');
  await staff.getByLabel('Lidnummer, naam of e-mail').fill(LID);
  await staff.getByLabel('Lidnummer, naam of e-mail').press('Enter');
  await expect(staff.getByRole('heading', { name: new RegExp(LID) })).toBeVisible();
  await staff.getByLabel('Scan exemplaar (barcode)').fill(BARCODE);
  await staff.getByLabel('Scan exemplaar (barcode)').press('Enter');
  await expect(staff.getByText(/Uitgeleend: “.+”/)).toBeVisible();
  await staff.getByRole('tab', { name: 'Innemen' }).click();
  await staff.getByLabel('Scan ingeleverd exemplaar').fill(BARCODE);
  await staff.getByLabel('Scan ingeleverd exemplaar').press('Enter');
  await expect(staff.getByText(/Ingenomen: “.+”/)).toBeVisible();

  // Nu mag het lid reviewen
  await lid.reload();
  await expect(lid.getByRole('heading', { name: /review/i, level: 3 })).toBeVisible();
  await lid.getByLabel('4 sterren').check();
  await lid.getByLabel('Toelichting (optioneel)').fill('Heerlijk tijdsbeeld.');
  await lid.getByRole('button', { name: 'Plaatsen' }).click();
  await expect(lid.getByText(/wordt eerst beoordeeld/)).toBeVisible();
  await expect(lid.locator('.reviews').getByText('Heerlijk tijdsbeeld.')).toHaveCount(0); // nog niet openbaar

  // Medewerker modereert
  await staff.goto('/staff/moderation');
  await expect(staff.getByText('Heerlijk tijdsbeeld.')).toBeVisible();
  await staff.getByRole('button', { name: 'Goedkeuren' }).first().click();
  await expect(staff.getByText('Heerlijk tijdsbeeld.')).toHaveCount(0);

  // Review en sterren zijn nu zichtbaar, ook in de catalogus
  await lid.reload();
  await expect(lid.locator('.reviews').getByText('Heerlijk tijdsbeeld.')).toBeVisible();
  await expect(lid.getByRole('img', { name: /4 van 5 sterren/ }).first()).toBeVisible();
  await lid.goto('/catalogus?q=' + TITLE);
  await expect(lid.getByRole('img', { name: /4 van 5 sterren/ })).toBeVisible();

  await staffCtx.close();
  await memberCtx.close();
});

test('verlanglijst en aankoopsuggestie', async ({ page }) => {
  await loginAs(page, 'lid@biblio.nl');
  await page.goto('/catalogus?q=' + TITLE);
  await page.getByRole('link', { name: TITLE }).click();
  await page.getByRole('button', { name: /Op verlanglijst/ }).click();
  await expect(page.getByRole('button', { name: /Op je verlanglijst/ })).toBeVisible();
  await page.getByRole('link', { name: 'Verlanglijst' }).click();
  await expect(page.getByRole('link', { name: TITLE })).toBeVisible();

  await page.getByRole('link', { name: 'Suggesties' }).click();
  const title = `E2E-suggestie ${Date.now()}`;
  await page.getByLabel('Titel *').fill(title);
  await page.getByLabel('Auteur *').fill('Test Auteur');
  await page.getByRole('button', { name: 'Suggestie indienen' }).click();
  await expect(page.getByText('Bedankt voor je suggestie!')).toBeVisible();
  await expect(page.getByRole('cell', { name: title })).toBeVisible();
});

test('rapportages tonen grafiek, tabellen en CSV-links', async ({ page }) => {
  await loginAs(page, 'bibliothecaris@biblio.nl');
  await page.getByRole('link', { name: 'Rapporten' }).click();
  await expect(page.getByRole('heading', { name: 'Rapportages' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Uitleenvolume per periode/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Populairste boeken' })).toBeVisible();
  const link = page.getByRole('link', { name: 'Exporteer CSV' }).first();
  await expect(link).toHaveAttribute('href', /format=csv/);
});

test('beheerder ziet gebruikers, mailteksten en het auditlog; bibliothecaris niet', async ({
  page,
}) => {
  await loginAs(page, 'bibliothecaris@biblio.nl');
  await page.goto('/admin/users');
  await expect(page.getByText('Geen toegang')).toBeVisible();
  await page.getByRole('button', { name: 'Uitloggen' }).click();

  await loginAs(page, 'admin@biblio.nl');
  await page.getByRole('link', { name: 'Gebruikers' }).click();
  await expect(page.getByRole('heading', { name: 'Gebruikers en rollen' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'lid@biblio.nl' })).toBeVisible();
  await page.getByRole('link', { name: 'Mailteksten' }).click();
  await expect(page.getByRole('heading', { name: 'Reservering ligt klaar' })).toBeVisible();
  await page.getByRole('link', { name: 'Auditlog' }).click();
  await expect(page.getByRole('heading', { name: 'Auditlog' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'auth.login' }).first()).toBeVisible();
});
