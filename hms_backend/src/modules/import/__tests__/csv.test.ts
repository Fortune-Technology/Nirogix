import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../csv';

/**
 * The CSV reader (ADR-138). Every case here came from a real export: a hospital's file is not a
 * clean fixture, and the parser being wrong looks to a user like "the system rejected my data".
 */
describe('parseCsv', () => {
  it('reads a plain file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips the BOM Excel writes, so the first header still matches', () => {
    const [header] = parseCsv('﻿Name,Code\nA,B');
    expect(header).toEqual(['Name', 'Code']);
  });

  it('reads CRLF, LF and a lone CR', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a comma inside a quoted field as part of the value', () => {
    expect(parseCsv('name,price\n"Paracetamol 500mg, dispersible",4.50')).toEqual([
      ['name', 'price'],
      ['Paracetamol 500mg, dispersible', '4.50'],
    ]);
  });

  it('reads a doubled quote as one literal quote', () => {
    expect(parseCsv('a\n"He said ""stop"""')).toEqual([['a'], ['He said "stop"']]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('a,b\n"line one\nline two",x')).toEqual([
      ['a', 'b'],
      ['line one\nline two', 'x'],
    ]);
  });

  it('does not invent a row from the trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2);
  });

  it('drops a row of nothing but empty cells — spreadsheet spacing, not a record', () => {
    expect(parseCsv('a,b\n1,2\n,,\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps an empty cell inside a real row', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('toCsv', () => {
  it('writes a BOM and CRLF, because a hospital opens the template in Excel', () => {
    const out = toCsv([['a', 'b']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain('\r\n');
  });

  it('quotes only what has to be quoted', () => {
    expect(toCsv([['plain', 'has,comma', 'has"quote']])).toContain(
      'plain,"has,comma","has""quote"',
    );
  });

  it('round-trips a value that needed quoting', () => {
    const value = 'Paracetamol 500mg, "dispersible"\nsecond line';
    const [row] = parseCsv(toCsv([[value]]));
    expect(row).toEqual([value]);
  });
});
