import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BookDetail } from '@biblio/api-client';
import { api, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { Cover } from '../../components/BookCard';

interface Form {
  title: string;
  isbn: string;
  authors: string;
  genre: string;
  language: string;
  publishedYear: string;
  tags: string;
  series: string;
  seriesNumber: string;
  description: string;
  coverUrl: string;
}

const EMPTY: Form = {
  title: '',
  isbn: '',
  authors: '',
  genre: '',
  language: 'nl',
  publishedYear: '',
  tags: '',
  series: '',
  seriesNumber: '',
  description: '',
  coverUrl: '',
};
const split = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function fromBook(b: BookDetail): Form {
  return {
    title: b.title,
    isbn: b.isbn ?? '',
    authors: b.authors.map((a) => a.name).join(', '),
    genre: b.genre ?? '',
    language: b.language,
    publishedYear: b.publishedYear?.toString() ?? '',
    tags: b.tags.join(', '),
    series: b.series ?? '',
    seriesNumber: b.seriesNumber?.toString() ?? '',
    description: b.description ?? '',
    coverUrl: b.coverUrl?.startsWith('/api/covers/') ? '' : (b.coverUrl ?? ''),
  };
}

export function BookFormPage() {
  const { id } = useParams();
  const editing = id !== undefined && id !== 'new';
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<Form>(EMPTY);
  const [book, setBook] = useState<BookDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const set = (k: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function load() {
    if (!editing) return;
    const { data } = await api.GET('/api/books/{id}', { params: { path: { id: Number(id) } } });
    if (data) {
      setBook(data);
      setForm(fromBook(data));
    }
  }
  useEffect(() => {
    void load();
    // load hangt niet van zichzelf af; alleen herladen bij ander boek of andere gebruiker
  }, [id, user?.id]);

  async function lookup() {
    const { data, error } = await api.GET('/api/staff/isbn/{isbn}', {
      params: { path: { isbn: form.isbn } },
    });
    if (!data) return setMessage({ text: errorMessage(error), error: true });
    setForm({
      ...form,
      title: data.title,
      authors: data.authors.join(', '),
      description: data.description ?? form.description,
      publishedYear: data.publishedYear?.toString() ?? form.publishedYear,
      language: data.language ?? form.language,
      coverUrl: data.coverUrl ?? form.coverUrl,
    });
    setMessage({ text: 'Gegevens overgenomen — controleer en sla op.' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: form.title,
      isbn: form.isbn || undefined,
      authors: split(form.authors),
      genre: form.genre || undefined,
      language: form.language || undefined,
      publishedYear: form.publishedYear ? Number(form.publishedYear) : undefined,
      tags: split(form.tags),
      series: form.series || undefined,
      seriesNumber: form.seriesNumber ? Number(form.seriesNumber) : undefined,
      description: form.description || undefined,
      coverUrl: form.coverUrl || undefined,
    };
    const res = editing
      ? await api.PATCH('/api/staff/books/{id}', { params: { path: { id: Number(id) } }, body })
      : await api.POST('/api/staff/books', { body });
    if (!res.data) return setMessage({ text: errorMessage(res.error), error: true });
    if (editing) {
      setBook(res.data);
      setMessage({ text: 'Opgeslagen' });
    } else navigate(`/staff/books/${res.data.id}`, { replace: true });
  }

  async function uploadCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !book) return;
    const fd = new FormData();
    fd.append('file', file);
    const csrf = (await api.GET('/api/auth/me')).data?.csrfToken ?? '';
    const res = await fetch(`/api/staff/books/${book.id}/cover`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
      body: fd,
    });
    setMessage(
      res.ok
        ? { text: 'Cover geüpload' }
        : { text: errorMessage(await res.json().catch(() => null)), error: true },
    );
    void load();
  }

  async function addCopy() {
    if (!book) return;
    await api.POST('/api/staff/books/{id}/copies', { params: { path: { id: book.id } }, body: {} });
    void load();
  }
  async function setStatus(
    copyId: number,
    status: 'AVAILABLE' | 'LOANED' | 'RESERVED_HOLD' | 'LOST' | 'DAMAGED',
  ) {
    await api.PATCH('/api/staff/copies/{id}', {
      params: { path: { id: copyId } },
      body: { status },
    });
    void load();
  }
  async function removeCopy(copyId: number) {
    if (!window.confirm('Exemplaar verwijderen?')) return;
    await api.DELETE('/api/staff/copies/{id}', { params: { path: { id: copyId } } });
    void load();
  }

  return (
    <>
      <p>
        <Link to="/staff/books">← Collectiebeheer</Link>
      </p>
      <h1>{editing ? 'Boek bewerken' : 'Nieuw boek'}</h1>
      <form onSubmit={submit} className="book-form">
        <div className="field-row">
          <label className="field grow">
            <span>ISBN</span>
            <input value={form.isbn} onChange={set('isbn')} inputMode="numeric" />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => void lookup()}
            disabled={!form.isbn}
          >
            Gegevens ophalen
          </button>
        </div>
        <label className="field">
          <span>Titel *</span>
          <input value={form.title} onChange={set('title')} required />
        </label>
        <label className="field">
          <span>Auteurs (kommagescheiden)</span>
          <input value={form.authors} onChange={set('authors')} />
        </label>
        <div className="field-row">
          <label className="field grow">
            <span>Genre</span>
            <input value={form.genre} onChange={set('genre')} />
          </label>
          <label className="field">
            <span>Taal</span>
            <input value={form.language} onChange={set('language')} size={4} />
          </label>
          <label className="field">
            <span>Jaar</span>
            <input type="number" value={form.publishedYear} onChange={set('publishedYear')} />
          </label>
        </div>
        <label className="field">
          <span>Trefwoorden (kommagescheiden)</span>
          <input value={form.tags} onChange={set('tags')} />
        </label>
        <div className="field-row">
          <label className="field grow">
            <span>Reeks</span>
            <input value={form.series} onChange={set('series')} />
          </label>
          <label className="field">
            <span>Deel</span>
            <input type="number" value={form.seriesNumber} onChange={set('seriesNumber')} />
          </label>
        </div>
        <label className="field">
          <span>Omschrijving</span>
          <textarea value={form.description} onChange={set('description')} rows={4} />
        </label>
        <label className="field">
          <span>Cover-URL (extern)</span>
          <input value={form.coverUrl} onChange={set('coverUrl')} />
        </label>
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? 'error' : ''}>
            {message.text}
          </p>
        )}
        <button type="submit">Opslaan</button>
      </form>

      {book && (
        <>
          <h2>Cover</h2>
          <Cover book={book} size="large" />
          <label className="field">
            <span>Nieuwe cover uploaden (JPEG, PNG of WebP, max 2 MB)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} />
          </label>

          <h2>Exemplaren</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Barcode</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Acties</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {book.copies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.barcode}</td>
                    <td>
                      <select
                        aria-label={`Status ${c.barcode}`}
                        value={c.status}
                        onChange={(e) => void setStatus(c.id, e.target.value as never)}
                      >
                        <option value="AVAILABLE">Beschikbaar</option>
                        <option value="LOANED">Uitgeleend</option>
                        <option value="RESERVED_HOLD">Klaargelegd</option>
                        <option value="LOST">Verloren</option>
                        <option value="DAMAGED">Beschadigd</option>
                      </select>
                    </td>
                    <td>
                      <button className="link danger" onClick={() => void removeCopy(c.id)}>
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => void addCopy()}>Exemplaar toevoegen</button>
        </>
      )}
    </>
  );
}
