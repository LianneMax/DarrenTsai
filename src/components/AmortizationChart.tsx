import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MonthlyRow, YearlySummary } from '../types/mortgage';
import { chartPoints, niceTicks, formatYAxis, monotonePath } from '../utils/chartMath';
import { formatCurrency } from '../utils/formatters';
import { useScrollReveal } from '../hooks/useScrollReveal';

/**
 * The yearly amortization chart on /mortgage-calculator/.
 *
 * Drawn as plain SVG since 6 Nov 2026 (Max approved). It used recharts, which
 * put a 396 KB (109 KB gzipped) chunk behind three lines, a legend and a
 * tooltip. Same series, colours, legend and tooltip as before; the tooltip
 * now also works from the keyboard (focus the chart, then the arrow keys).
 */

interface Props {
  schedule: MonthlyRow[];
  yearlyData: YearlySummary[];
}


const SERIES = [
  { key: 'balance', name: 'Remaining Balance', color: 'var(--navy)' },
  { key: 'cumulativeInterest', name: 'Cumulative Interest', color: 'var(--rose)' },
  { key: 'cumulativePrincipal', name: 'Cumulative Principal', color: 'var(--teal)' },
] as const;

const HEIGHT = 320;
const M = { top: 8, right: 24, bottom: 30, left: 76 };
const FONT = "'Outfit', 'Outfit Fallback', sans-serif";

export default function AmortizationChart({ yearlyData }: Props) {
  const ref = useScrollReveal<HTMLDivElement>(80);
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = chartPoints(yearlyData);
  const max = Math.max(0, ...data.flatMap((p) => [p.balance, p.cumulativeInterest, p.cumulativePrincipal]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;
  const first = data[0]?.year ?? 0;
  const last = data[data.length - 1]?.year ?? 0;
  const span = Math.max(1, last - first);
  const x = (year: number) => M.left + ((year - first) / span) * innerW;
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  // About one year label per 56px, so labels never collide on a phone.
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56))));

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    if (!data.length || innerW <= 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const year = first + ((e.clientX - box.left - M.left) / innerW) * span;
    setActive(Math.min(data.length - 1, Math.max(0, Math.round(year - first))));
  };
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!data.length) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(data.length - 1);
    else if (step) setActive((i) => Math.min(data.length - 1, Math.max(0, (i ?? -1) + step)));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const point = active === null ? null : data[active];
  const narrow = width > 0 && width < 520;
  const tipLeft = point ? Math.min(Math.max(x(point.year) + 12, 0), Math.max(0, width - 220)) : 0;
  const lastPoint = data[data.length - 1];
  const summary = lastPoint
    ? `Chart of the loan from ${first} to ${last}. The balance falls to ${formatCurrency(lastPoint.balance)}; total interest reaches ${formatCurrency(lastPoint.cumulativeInterest)} and total principal ${formatCurrency(lastPoint.cumulativePrincipal)}. Use the arrow keys to read each year; the table below lists every figure.`
    : 'Amortization chart';

  return (
    <div ref={ref} className="chart-wrapper card reveal">
      <h3 className="card-heading">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Amortization Over Time
      </h3>
      <div ref={plotRef} className="chart-plot" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary} tabIndex={0}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
            onKeyDown={keys} onBlur={() => setActive(null)} style={{ touchAction: 'pan-y' }}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)}
                  stroke="#e5e7eb" strokeDasharray={v === 0 ? undefined : '4 4'} />
                <text x={M.left - 10} y={y(v)} dy="0.32em" textAnchor="end" fontSize={12}
                  fontFamily={FONT} style={{ fill: 'var(--text-muted)' }}>{formatYAxis(v)}</text>
              </g>
            ))}
            {data.map((p, i) => (i % every === 0 || i === data.length - 1) && (
              <text key={p.year} x={x(p.year)} y={HEIGHT - 8} textAnchor="middle" fontSize={12}
                fontFamily={FONT} style={{ fill: 'var(--text-muted)' }}>{p.year}</text>
            ))}
            {point && <line x1={x(point.year)} x2={x(point.year)} y1={M.top} y2={M.top + innerH} stroke="#cbd5dc" />}
            {SERIES.map((s) => (
              <path key={s.key} className="chart-line" pathLength={1} fill="none" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" style={{ stroke: s.color }}
                d={monotonePath(data.map((p) => [x(p.year), y(p[s.key])]))} />
            ))}
            {point && SERIES.map((s) => (
              <circle key={s.key} cx={x(point.year)} cy={y(point[s.key])} r={4.5} fill="#fff" strokeWidth={2.5} style={{ stroke: s.color }} />
            ))}
          </svg>
        )}
        {point && !narrow && (
          <div className="chart-tooltip chart-tooltip-float" style={{ left: tipLeft }} aria-hidden="true">
            <p className="chart-tooltip-year">Year {point.year}</p>
            {SERIES.map((s) => (
              <div key={s.key} className="chart-tooltip-row">
                <span className="chart-tooltip-dot" style={{ background: s.color }} />
                <span className="chart-tooltip-label">{s.name}</span>
                <span className="chart-tooltip-val">{formatCurrency(point[s.key])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Phones: a floating box would cover most of the lines, so the figures
          sit in a fixed slot under the chart (its height is reserved). */}
      {narrow && (
        <div className="chart-readout" aria-hidden="true">
          {point ? (
            <>
              <p className="chart-tooltip-year">Year {point.year}</p>
              {SERIES.map((s) => (
                <div key={s.key} className="chart-tooltip-row">
                  <span className="chart-tooltip-dot" style={{ background: s.color }} />
                  <span className="chart-tooltip-label">{s.name}</span>
                  <span className="chart-tooltip-val">{formatCurrency(point[s.key])}</span>
                </div>
              ))}
            </>
          ) : <p className="chart-readout-hint">Tap or drag across the chart to read any year.</p>}
        </div>
      )}
      <div className="chart-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <div key={s.key} className="chart-legend-item">
            <span className="chart-legend-line" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>
      {/* Screen readers hear the focused year; the table below has every figure. */}
      <p className="sr-only" aria-live="polite">
        {point ? `Year ${point.year}: ${SERIES.map((s) => `${s.name} ${formatCurrency(point[s.key])}`).join(', ')}` : ''}
      </p>
    </div>
  );
}
