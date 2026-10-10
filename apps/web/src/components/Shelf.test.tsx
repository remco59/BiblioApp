import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Shelf, ShelfBook } from './Shelf';

const book = {
  id: 7,
  title: 'Het diner',
  coverUrl: null,
  authors: [{ id: 1, name: 'Herman Koch' }],
};

function renderShelf() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Shelf label="Test">
              <ShelfBook book={book} />
            </Shelf>
          }
        />
        <Route path="/books/:id" element={<p>Boekpagina</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shelf', () => {
  beforeEach(() => localStorage.clear());

  it('toont standaard alleen de cover; titel en auteur zitten in een tooltip en de linknaam', () => {
    const { container } = renderShelf();
    expect(screen.getByRole('link', { name: 'Het diner' })).toHaveAttribute('href', '/books/7');
    const tip = container.querySelector('.shelf-tip');
    expect(tip).toHaveTextContent('Het diner');
    expect(tip).toHaveTextContent('Herman Koch');
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.shelf-info .shelf-title')).toBeNull();
  });

  it('toont titel en auteur onder het boek als de voorkeur aan staat', () => {
    localStorage.setItem('shelfTitles', 'on');
    const { container } = renderShelf();
    expect(container.querySelector('.shelf-info .shelf-title')).toHaveTextContent('Het diner');
    expect(container.querySelector('.shelf-info .shelf-author')).toHaveTextContent('Herman Koch');
    expect(container.querySelector('.shelf-tip')).toBeNull();
  });

  it('heeft één plank per boek-kolom en geen plank onder de tekst', () => {
    localStorage.setItem('shelfTitles', 'on');
    const { container } = renderShelf();
    expect(container.querySelectorAll('.shelf-stand > .plank')).toHaveLength(3); // boek + 2 randen
    expect(container.querySelectorAll('.shelf-info .plank')).toHaveLength(0);
  });

  it('opent op touch pas bij de tweede tik', () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(hover: none)' })) as never;
    const { container } = renderShelf();
    const link = screen.getByRole('link', { name: 'Het diner' });
    fireEvent.click(link);
    expect(container.querySelector('.shelf-link.armed')).not.toBeNull();
    expect(screen.queryByText('Boekpagina')).toBeNull();
    fireEvent.click(link);
    expect(screen.getByText('Boekpagina')).toBeInTheDocument();
  });
});
