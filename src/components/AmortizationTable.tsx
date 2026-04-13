import React, { useState } from 'react';
import type { MonthlyRow, YearlySummary } from '../types/mortgage';
import { formatCurrency } from '../utils/formatters';
import { useScrollReveal } from '../hooks/useScrollReveal';

interface Props {
  schedule: MonthlyRow[];
  yearlyData: YearlySummary[];
}

export default function AmortizationTable({ schedule, yearlyData }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useScrollReveal<HTMLDivElement>(120);

  // Build a map from paymentNumber → YearlySummary for every 12th row
  const yearMap = new Map<number, YearlySummary>();
  yearlyData.forEach((ys, i) => {
    yearMap.set((i + 1) * 12, ys);
  });

  return (
    <div ref={ref} className="table-wrapper reveal">
      <button
        className="table-toggle btn btn-outline-navy"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth="2"/>
        </svg>
        {open ? 'Hide Payment Schedule' : 'View Full Payment Schedule'}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div
        className="table-collapsible"
        style={{ maxHeight: open ? '2400px' : '0' }}
      >
        <div className="table-scroll">
          <table className="amort-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, idx) => {
                const yearSummary = yearMap.get(row.paymentNumber);
                const yearIndex = Math.ceil(row.paymentNumber / 12);
                return (
                  <React.Fragment key={row.paymentNumber}>
                    <tr
                      className={idx % 2 === 1 ? 'row-stripe' : ''}
                    >
                      <td>{row.paymentNumber}</td>
                      <td>{row.date}</td>
                      <td className="num">{formatCurrency(row.payment)}</td>
                      <td className="num teal">{formatCurrency(row.principal)}</td>
                      <td className="num rose">{formatCurrency(row.interest)}</td>
                      <td className="num">{formatCurrency(row.balance)}</td>
                    </tr>
                    {yearSummary && (
                      <tr key={`year-${yearIndex}`} className="year-summary-row">
                        <td colSpan={2} className="year-label">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          Year {yearIndex} Total
                        </td>
                        <td className="num bold">{formatCurrency(yearSummary.totalPayment)}</td>
                        <td className="num bold teal">{formatCurrency(yearSummary.totalPrincipal)}</td>
                        <td className="num bold rose">{formatCurrency(yearSummary.totalInterest)}</td>
                        <td className="num bold">{formatCurrency(yearSummary.endingBalance)}</td>
                      </tr>
                    )}
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
