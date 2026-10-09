import { createHash } from 'node:crypto';
import { StorageService } from './storage.service';

export const COVER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Haalt een externe cover (bv. covers.openlibrary.org) eenmalig op en slaat hem op in onze eigen
 * opslag, zodat we hem daarna zelf serveren. Geeft de opslagsleutel terug, of null als de URL
 * niet extern is of geen bruikbare afbeelding oplevert (dan blijft de externe URL in gebruik).
 */
export async function mirrorCover(storage: StorageService, url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    const ext = COVER_TYPES[type];
    if (!res.ok || !ext) return null;
    const body = Buffer.from(await res.arrayBuffer());
    // Open Library levert een 1x1-plaatje als er geen cover is; dat willen we niet bewaren.
    if (body.length < 1024 || body.length > MAX_BYTES) return null;
    const key = `remote-${createHash('sha1').update(url).digest('hex').slice(0, 16)}.${ext}`;
    await storage.put(key, body, type);
    return key;
  } catch {
    return null;
  }
}
