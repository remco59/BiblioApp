import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type { paths, components };
export type Book = components['schemas']['BookDto'];
export type BookDetail = components['schemas']['BookDetailDto'];
export type BookPage = components['schemas']['BookPageDto'];
export type Filters = components['schemas']['FiltersDto'];
export type BookInput = components['schemas']['BookInputDto'];

export function createApiClient(baseUrl = '') {
  // fetch wordt per call opgezocht, zodat het in tests vervangbaar blijft.
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: (request) => globalThis.fetch(request),
  });
}

export type Loan = components['schemas']['LoanDto'];
export type Fine = components['schemas']['FineDto'];
export type Member = components['schemas']['MemberDto'];
export type MemberDetail = components['schemas']['MemberDetailDto'];
export type Settings = components['schemas']['SettingsDto'];
