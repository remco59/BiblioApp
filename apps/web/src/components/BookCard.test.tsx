import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookList } from './BookCard';

describe('BookList', () => {
  it('toont titel, auteur en beschikbaarheid', () => {
    render(
      <MemoryRouter>
        <BookList
          books={[
            {
              id: 1,
              title: 'Het diner',
              isbn: null,
              description: null,
              language: 'nl',
              publishedYear: 2009,
              genre: 'Roman',
              coverUrl: null,
              series: null,
              seriesNumber: null,
              tags: [],
              ratingAverage: 4.5,
              ratingCount: 2,
              authors: [{ id: 1, name: 'Herman Koch' }],
              copiesTotal: 2,
              copiesAvailable: 1,
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Het diner' })).toBeInTheDocument();
    expect(screen.getByText(/Herman Koch · Roman · 2009/)).toBeInTheDocument();
    expect(screen.getByText(/1 van 2 beschikbaar/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /4.5 van 5 sterren, 2 beoordelingen/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Het diner' })).toHaveAttribute('href', '/books/1');
  });
});
