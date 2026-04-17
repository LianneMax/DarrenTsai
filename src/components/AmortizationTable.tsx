import React, { useState, useMemo } from 'react';
import type { MonthlyRow, YearlySummary } from '../types/mortgage';
import { formatCurrency } from '../utils/formatters';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface Props {
  schedule: MonthlyRow[];
  yearlyData: YearlySummary[];
}

export default function AmortizationTable({ schedule, yearlyData }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const ref = useScrollReveal<HTMLDivElement>(120);

  // Group monthly rows by year index
  const yearGroups = useMemo(() =>
    yearlyData.map((ys, i) => ({
      summary: ys,
      months: schedule.slice(i * 12, (i + 1) * 12),
    })),
    [schedule, yearlyData]
  );

  const toggleYear = (yearIdx: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(yearIdx) ? next.delete(yearIdx) : next.add(yearIdx);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedYears(new Set());
      setAllExpanded(false);
    } else {
      setExpandedYears(new Set(yearGroups.map((_, i) => i)));
      setAllExpanded(true);
    }
  };

  return (
    <div ref={ref} className="table-wrapper reveal">
      <button
        className="table-toggle btn btn-outline-navy"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth="2"/>
        </svg>
        {open ? 'Hide Payment Schedule' : 'View Full Payment Schedule'}
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="table-collapsible" style={{ maxHeight: open ? '9999px' : '0' }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0 16px',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            This table lists how much principal and interest are paid in each scheduled mortgage payment.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--navy)', flexShrink: 0 }}>
            Expand all years
            <div
              onClick={toggleAll}
              role="switch"
              aria-checked={allExpanded}
              style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                background: allExpanded ? 'var(--teal)' : '#d1d5db',
                position: 'relative', transition: 'background 0.25s ease',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: allExpanded ? 21 : 3,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </label>
        </div>

        <div className="table-scroll">
          <table className="amort-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Date</th>
                <th className="num">Principal</th>
                <th className="num">Interest</th>
                <th className="num">Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              {yearGroups.map((group, yearIdx) => {
                const isExpanded = expandedYears.has(yearIdx);
                return (
                  <React.Fragment key={`group-${yearIdx}`}>
                    {/* Year summary row */}
                    <tr
                      key={`year-${yearIdx}`}
                      className="year-summary-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleYear(yearIdx)}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--teal)', fontWeight: 700, fontSize: 16 }}>
                        {isExpanded ? '−' : '+'}
                      </td>
                      <td className="year-label">
                        <span className="year-label-inner">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          {group.summary.year}
                        </span>
                      </td>
                      <td className="num bold teal">{formatCurrency(group.summary.totalPrincipal)}</td>
                      <td className="num bold rose">{formatCurrency(group.summary.totalInterest)}</td>
                      <td className="num bold">{formatCurrency(group.summary.endingBalance)}</td>
                    </tr>

                    {/* Monthly rows (expanded) */}
                    {isExpanded && group.months.map((row, idx) => (
                      <tr key={row.paymentNumber} className={idx % 2 === 1 ? 'row-stripe' : ''}>
                        <td />
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{row.date}</td>
                        <td className="num teal" style={{ fontSize: 13 }}>{formatCurrency(row.principal)}</td>
                        <td className="num rose" style={{ fontSize: 13 }}>{formatCurrency(row.interest)}</td>
                        <td className="num" style={{ fontSize: 13 }}>{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
