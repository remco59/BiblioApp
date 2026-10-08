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
