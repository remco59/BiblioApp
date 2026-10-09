import { expect, test, type Page } from '@playwright/test';

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByLabel('Wachtwoord').fill('Welkom-123456');
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
}

test.describe('zoeken in de catalogus', () => {
  test('toont de seed-boeken met beschikbaarheid', async ({ page }) => {
    await page.goto('/catalogus');
    await expect(page.getByRole('heading', { name: 'Catalogus' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Het diner' })).toBeVisible();
    await expect(page.getByText(/boeken gevonden/)).toBeVisible();
  });

  test('vindt een boek op titel, auteur en ondanks een typefout', async ({ page }) => {
    await page.goto('/catalogus');
    const search = page.getByRole('searchbox');
    for (const term of ['diner', 'Koch', 'dinner']) {
      await search.fill(term);
      await search.press('Enter');
      // Eerst op de nieuwe zoekopdracht wachten; anders staat het vorige resultaat nog in beeld.
      await expect(page).toHaveURL(new RegExp(`q=${term}`));
      await expect(page.getByRole('link', { name: 'Het diner' })).toBeVisible();
    }
  });

  test('geeft een melding zonder resultaat', async ({ page }) => {
    await page.goto('/catalogus?q=xqzvwk');
    await expect(page.getByText('Geen boeken gevonden')).toBeVisible();
  });

  test('filtert op genre en blijft in de URL staan', async ({ page }) => {
    await page.goto('/catalogus');
    await page.getByLabel('Genre').selectOption('Fantasy');
    await expect(page).toHaveURL(/genre=Fantasy/);
    await expect(page.getByRole('link', { name: 'Kruistocht in spijkerbroek' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Het diner' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Genre')).toHaveValue('Fantasy');
  });

  test('opent een detailpagina met exemplaren', async ({ page }) => {
    await page.goto('/catalogus?q=Kruistocht');
    await page.getByRole('link', { name: 'Kruistocht in spijkerbroek' }).click();
    await expect(page.getByRole('heading', { name: 'Kruistocht in spijkerbroek' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Exemplaren' })).toBeVisible();
    await expect(page.getByText('Thea Beckman')).toBeVisible();
  });
});

test.describe('collectiebeheer', () => {
  test('lid heeft geen toegang, bibliothecaris maakt en verwijdert een boek', async ({ page }) => {
    await loginAs(page, 'lid@biblio.nl');
    await expect(page.getByRole('link', { name: 'Werkplek' })).toHaveCount(0);
    await page.goto('/staff/books');
    await expect(page.getByText('Geen toegang')).toBeVisible();
    await page.getByRole('button', { name: 'Uitloggen' }).click();

    await loginAs(page, 'bibliothecaris@biblio.nl');
    await page.getByRole('link', { name: 'Werkplek' }).click();
    await page.getByRole('link', { name: 'Boeken', exact: true }).click();
    await page.getByRole('link', { name: 'Nieuw boek' }).click();
    const title = `E2E-testboek ${Date.now()}`;
    await page.getByLabel('Titel *').fill(title);
    await page.getByLabel('Auteurs (kommagescheiden)').fill('E2E Auteur');
    await page.getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.getByRole('heading', { name: 'Boek bewerken' })).toBeVisible();
    await page.getByRole('button', { name: 'Exemplaar toevoegen' }).click();
    await expect(page.getByRole('cell', { name: /^BB/ })).toBeVisible();

    await page.goto('/catalogus?q=' + encodeURIComponent(title));
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    await page.goto('/staff/books');
    await page.getByRole('searchbox').fill(title);
    page.once('dialog', (d) => d.accept());
    await page
      .getByRole('row', { name: new RegExp(title) })
      .getByRole('button', { name: 'Verwijderen' })
      .click();
    await expect(page.getByText(`“${title}” verwijderd`)).toBeVisible();
  });
});
