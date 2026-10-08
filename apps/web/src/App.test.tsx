import { render, screen } from '@testing-library/react';
import { BookList } from './App';

describe('BookList', () => {
  it('toont titel, auteur en beschikbaarheid', () => {
    render(
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
            authors: [{ id: 1, name: 'Herman Koch' }],
            copiesTotal: 2,
            copiesAvailable: 1,
          },
        ]}
      />,
    );
    expect(screen.getByText('Het diner')).toBeInTheDocument();
    expect(screen.getByText(/Herman Koch · Roman · 2009/)).toBeInTheDocument();
    expect(screen.getByText('1 van 2 beschikbaar')).toBeInTheDocument();
  });
});
