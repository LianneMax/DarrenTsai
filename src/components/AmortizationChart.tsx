import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { MonthlyRow, YearlySummary } from '../types/mortgage';
import { formatCurrency } from '../utils/formatters';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface Props {
  schedule: MonthlyRow[];
  yearlyData: YearlySummary[];
}

interface ChartPoint {
  year: number;
  balance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-year">Year {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: entry.color }} />
          <span className="chart-tooltip-label">{entry.name}</span>
          <span className="chart-tooltip-val">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value}`;
}

function CustomLegend() {
  return (
    <div className="chart-legend">
      <div className="chart-legend-item">
        <span className="chart-legend-line" style={{ background: 'var(--navy)' }} />
        <span>Remaining Balance</span>
      </div>
      <div className="chart-legend-item">
        <span className="chart-legend-line" style={{ background: 'var(--rose)' }} />
        <span>Cumulative Interest</span>
      </div>
      <div className="chart-legend-item">
        <span className="chart-legend-line" style={{ background: 'var(--teal)' }} />
        <span>Cumulative Principal</span>
      </div>
    </div>
  );
}

export default function AmortizationChart({ yearlyData }: Props) {
  const ref = useScrollReveal<HTMLDivElement>(80);

  const data: ChartPoint[] = yearlyData.map((row, i) => {
    const prevRows = yearlyData.slice(0, i + 1);
    const cumulativeInterest = prevRows.reduce((sum, r) => sum + r.totalInterest, 0);
    const cumulativePrincipal = prevRows.reduce((sum, r) => sum + r.totalPrincipal, 0);
    return {
      year: row.year,
      balance: Math.max(0, row.endingBalance),
      cumulativeInterest,
      cumulativePrincipal,
    };
  });

  return (
    <div ref={ref} className="chart-wrapper card reveal">
      <h3 className="card-heading">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Amortization Over Time
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="4 4" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'Outfit' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'Outfit' }}
            tickLine={false}
            axisLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#e5e7eb" />
          <Line
            type="monotone"
            dataKey="balance"
            name="Remaining Balance"
            stroke="var(--navy)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="cumulativeInterest"
            name="Cumulative Interest"
            stroke="var(--rose)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="cumulativePrincipal"
            name="Cumulative Principal"
            stroke="var(--teal)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Legend content={<CustomLegend />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
