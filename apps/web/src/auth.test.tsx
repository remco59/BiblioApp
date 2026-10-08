import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth';

function mockMe(user: object | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      user
        ? new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
    ),
  );
}

function renderGuarded(roles?: ('MEMBER' | 'LIBRARIAN' | 'ADMIN')[]) {
  render(
    <MemoryRouter initialEntries={['/geheim']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>loginscherm</p>} />
          <Route
            path="/geheim"
            element={
              <RequireAuth roles={roles}>
                <p>geheime inhoud</p>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const member = {
  id: 1,
  email: 'a@b.nl',
  name: 'A',
  role: 'MEMBER',
  memberNumber: 'L1',
  csrfToken: 'x',
};

afterEach(() => vi.unstubAllGlobals());

describe('RequireAuth', () => {
  it('stuurt anonieme gebruikers naar het loginscherm', async () => {
    mockMe(null);
    renderGuarded();
    expect(await screen.findByText('loginscherm')).toBeInTheDocument();
  });

  it('toont inhoud voor ingelogde gebruikers', async () => {
    mockMe(member);
    renderGuarded();
    expect(await screen.findByText('geheime inhoud')).toBeInTheDocument();
  });

  it('weigert een gebruiker met de verkeerde rol', async () => {
    mockMe(member);
    renderGuarded(['ADMIN']);
    expect(await screen.findByRole('alert')).toHaveTextContent('Geen toegang');
  });
});
