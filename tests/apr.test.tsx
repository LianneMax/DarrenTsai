import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { estimateApr } from '../src/utils/apr';
import AprEstimate from '../src/components/AprEstimate';

describe('regular fixed-rate APR estimate', () => {
  it('equals the note rate only with zero prepaid charges', () => {
    expect(estimateApr(330000, 4, 30, 0)).toBe(4);
    expect(estimateApr(330000, 4, 30, 2000)).toBeCloseTo(4.0504, 3);
    expect(estimateApr(330000, 4, 30, 4000)).toBeCloseTo(4.1013, 3);
  });
  it('changes with amount and term, rather than adding a fixed spread', () => {
    expect(estimateApr(100000, 4, 15, 4000)).toBeGreaterThan(estimateApr(330000, 4, 30, 4000)!);
    expect(estimateApr(100000, 0, 10, 1000)).toBeGreaterThan(0);
  });
  it.each([[0,4,30,0], [330000,4,30,330000], [330000,4,30,-1], [NaN,4,30,0]])('hides invalid calculations', (...args) => {
    expect(estimateApr(...args as [number,number,number,number])).toBeNull();
  });
  it('discloses zero assumed fees and provides accessible editable charges', () => {
    const html = renderToStaticMarkup(<AprEstimate principal={330000} rate={4} years={30} />);
    expect(html).toContain('4.00%');
    expect(html).toContain('$0 upfront fees assumed');
    expect(html).toContain('About this estimated APR');
    expect(html).toContain('Prepaid finance charges ($)');
    expect(html).toContain('mortgage insurance and payment timing');
  });
});
