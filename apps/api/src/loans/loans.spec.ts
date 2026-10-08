import { daysLate } from './loans.service';

describe('daysLate', () => {
  const due = new Date('2026-01-10T12:00:00Z');
  it('is 0 op of vóór de uiterste datum', () => {
    expect(daysLate(due, new Date('2026-01-10T12:00:00Z'))).toBe(0);
    expect(daysLate(due, new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });
  it('telt begonnen dagen', () => {
    expect(daysLate(due, new Date('2026-01-10T12:00:01Z'))).toBe(1);
    expect(daysLate(due, new Date('2026-01-11T12:00:00Z'))).toBe(1);
    expect(daysLate(due, new Date('2026-01-11T12:00:01Z'))).toBe(2);
  });
});
