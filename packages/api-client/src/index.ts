import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type { paths, components };
export type Book = components['schemas']['BookDto'];

export function createApiClient(baseUrl = '') {
  return createClient<paths>({ baseUrl, credentials: 'include' });
}
