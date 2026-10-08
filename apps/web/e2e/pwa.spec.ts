import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test('manifest is geldig en alle iconen bestaan', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#1d4ed8');

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({
      name: 'BiblioApp',
      display: 'standalone',
      scope: '/',
      lang: 'nl',
    });
    expect(manifest.start_url).toMatch(/^\//);
    const sizes = manifest.icons.map(
      (i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`,
    );
    expect(sizes).toEqual(
      expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
    );
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain(icon.type.split('/')[1]);
    }
  });

  test('service worker installeert en de app-shell werkt offline; API-data wordt niet gecachet', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    // eerste pagina is gecachet na installatie; laad opnieuw zodat de SW de pagina beheert
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Catalogus' })).toBeVisible();

    const cacheKeys = await page.evaluate(async () => {
      const names = await caches.keys();
      const out: string[] = [];
      for (const n of names)
        for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
      return out;
    });
    expect(cacheKeys).toEqual(
      expect.arrayContaining(['/', '/offline.html', '/manifest.webmanifest']),
    );
    expect(cacheKeys.filter((p) => p.startsWith('/api/'))).toEqual([]);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Catalogus' })).toBeVisible(); // shell uit de cache
    // een diepe pagina valt terug op de shell (SPA) – en de offline-pagina bestaat als vangnet
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
    await context.setOffline(false);
  });

  test('service worker cachet nooit /api/ (ook niet na bezoek aan persoonlijke pagina’s)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto('/login');
    await page.reload();
    const apiCached = await page.evaluate(async () => {
      for (const n of await caches.keys())
        for (const r of await (await caches.open(n)).keys())
          if (new URL(r.url).pathname.startsWith('/api/')) return true;
      return false;
    });
    expect(apiCached).toBe(false);
  });
});
