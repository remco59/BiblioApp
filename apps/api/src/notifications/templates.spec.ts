import { renderNotification } from './templates';

describe('notificatietemplates', () => {
  const d = new Date('2026-03-05T12:00:00Z');

  it('rendert Nederlands met datum en bedrag', () => {
    const n = renderNotification('LOAN_OVERDUE', 'nl', {
      title: 'Het diner',
      date: d,
      days: 3,
      amountCents: 75,
    });
    expect(n.title).toBe('Je boek is te laat');
    expect(n.body).toContain('Het diner');
    expect(n.body).toContain('5 maart 2026');
    expect(n.body).toContain('3 dag(en)');
    expect(n.body).toMatch(/€\s?0,75/);
  });

  it('rendert Engels en valt terug op Nederlands bij onbekende taal', () => {
    expect(renderNotification('RESERVATION_READY', 'en', { title: 'X', date: d }).title).toBe(
      'Your reservation is ready',
    );
    expect(renderNotification('RESERVATION_READY', 'fr', { title: 'X', date: d }).title).toBe(
      'Je reservering ligt klaar',
    );
  });
});

describe('aanpasbare templates', () => {
  it('vult plaatshouders en laat onbekende leeg', () => {
    const n = renderNotification(
      'RESERVATION_READY',
      'nl',
      { title: 'X', date: new Date('2026-03-05T12:00:00Z') },
      { title: 'Hoi {{title}}', body: 'Tot {{date}} {{bestaatniet}}!' },
    );
    expect(n).toEqual({ title: 'Hoi X', body: 'Tot 5 maart 2026 !' });
  });

  it('plakt een notitie met een spatie ervoor', () => {
    expect(
      renderNotification('SUGGESTION_UPDATED', 'nl', {
        title: 'T',
        status: 'goedgekeurd',
        note: 'Komt in november.',
      }).body,
    ).toBe('Je suggestie “T” heeft nu de status: goedgekeurd. Komt in november.');
    expect(
      renderNotification('SUGGESTION_UPDATED', 'en', { title: 'T', status: 'approved' }).body,
    ).toBe('Your suggestion “T” now has the status: approved.');
  });
});
