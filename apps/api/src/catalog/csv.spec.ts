import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('parset quotes, komma’s en nieuwe regels in velden', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n"regel1\nregel2",3\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'z "q"'],
      ['regel1\nregel2', '3'],
    ]);
  });

  it('negeert lege regels en BOM', () => {
    expect(parseCsv('﻿a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('roundtript waarden met speciale tekens', () => {
    const rows = [
      ['t', 'd'],
      ['Een, titel', 'Zeg "hoi"\nnieuwe regel'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('neutraliseert formule-injectie maar laat negatieve getallen staan', () => {
    expect(toCsv([['=SUM(A1)', '-5', '@cmd']])).toBe("'=SUM(A1),-5,'@cmd\n");
  });
});
