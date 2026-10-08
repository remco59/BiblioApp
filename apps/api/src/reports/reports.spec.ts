import { BadRequestException } from '@nestjs/common';
import { buckets, parseRange } from './reports.service';

describe('rapportage-periodes', () => {
  const now = new Date('2026-03-15T10:00:00Z');

  it('standaard de laatste 30 dagen (inclusief vandaag)', () => {
    const r = parseRange(undefined, undefined, now);
    expect(r.from.toISOString()).toBe('2026-02-14T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-03-16T00:00:00.000Z');
    expect(buckets(r, 'day')).toHaveLength(30);
  });

  it('"to" is inclusief; maanden worden aaneengesloten opgevuld', () => {
    const r = parseRange('2026-01-20', '2026-04-02');
    expect(buckets(r, 'month')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(buckets(parseRange('2026-02-27', '2026-03-01'), 'day')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('weigert ongeldige, omgekeerde of te lange perioden', () => {
    expect(() => parseRange('niet-een-datum', '2026-01-01')).toThrow(BadRequestException);
    expect(() => parseRange('2026-02-01', '2026-01-01')).toThrow(BadRequestException);
    expect(() => parseRange('2020-01-01', '2026-01-01')).toThrow(BadRequestException);
  });
});
