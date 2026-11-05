/**
 * The hand-drawn amortization chart (6 Nov 2026, replacing recharts).
 * The maths that places the lines is tested here; the browser layout check
 * covers how it draws.
 */
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AmortizationChart from '../src/components/AmortizationChart';
import { chartPoints, niceTicks, formatYAxis, monotonePath } from '../src/utils/chartMath';
import type { YearlySummary } from '../src/types/mortgage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const years = (n: number): YearlySummary[] => Array.from({ length: n }, (_, i) => ({
  year: i + 1, totalPayment: 24000, totalInterest: 15000 - i * 300, totalPrincipal: 9000 + i * 300,
  endingBalance: 300000 - (i + 1) * 10000,
} as unknown as YearlySummary));

describe('chart maths', () => {
  it('accumulates interest and principal and never draws a negative balance', () => {
    const pts = chartPoints([...years(2), { year: 3, totalInterest: 100, totalPrincipal: 50, endingBalance: -0.4 } as unknown as YearlySummary]);
    expect(pts.map((p) => p.cumulativeInterest)).toEqual([15000, 29700, 29800]);
    expect(pts.map((p) => p.cumulativePrincipal)).toEqual([9000, 18300, 18350]);
    expect(pts[2].balance).toBe(0);
  });

  it('picks round gridlines that reach the top of the data', () => {
    expect(niceTicks(290000)).toEqual([0, 100000, 200000, 300000]);
    expect(niceTicks(240000)).toEqual([0, 50000, 100000, 150000, 200000, 250000]);
    expect(niceTicks(0)).toEqual([0]);
    const t = niceTicks(1234567);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1234567);
    expect(t.length).toBeLessThanOrEqual(8);
  });

  it('labels the axis in thousands and millions', () => {
    expect(formatYAxis(0)).toBe('$0');
    expect(formatYAxis(250000)).toBe('$250k');
    expect(formatYAxis(1500000)).toBe('$1.5M');
  });

  it('draws a smooth line through every point without overshooting a flat stretch', () => {
    const d = monotonePath([[0, 10], [10, 10], [20, 0]]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    // The flat first segment keeps both control points at y = 10.
    expect(d).toMatch(/^M0,10C3\.3+\d*,10 6\.6+\d*,10 10,10C/);
    expect(monotonePath([])).toBe('');
  });
});

describe('the chart', () => {
  it('describes itself for screen readers and keeps the legend', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<AmortizationChart schedule={[]} yearlyData={years(30)} />));
    expect(host.textContent).toContain('Remaining Balance');
    expect(host.textContent).toContain('Cumulative Interest');
    expect(host.textContent).toContain('Cumulative Principal');
    await act(async () => root.unmount());
    host.remove();
  });
});
