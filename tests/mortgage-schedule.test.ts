/**
 * The amortization schedule's calendar.
 *
 * WHY THIS FILE EXISTS. The maths was never wrong; the dates were. Yearly rows
 * were fixed blocks of twelve from payment one, labelled startYear + n, which
 * is only correct for a loan starting in January. A loan starting in September
 * 2026 counted twelve payments into "2026", so every row after it was a partial
 * year out of step and the last one read 2055 while the Payoff Date card
 * directly above it said September 2056. Anyone who checked one against the
 * other found the calculator contradicting itself, on the page whose whole job
 * is to be trusted with numbers.
 */
import { describe, it, expect } from 'vitest';
import { calculateMortgage, getPayoffDate } from '../src/utils/mortgageCalc';

const SEPT = { loanAmount: 330000, termYears: 30, annualRate: 6.41, startMonth: 9, startYear: 2026 };
const JAN = { ...SEPT, startMonth: 1 };

describe('yearly rows follow the calendar', () => {
  it('counts only the months left in the start year', () => {
    const { yearlyData } = calculateMortgage(SEPT);
    expect(yearlyData[0].year).toBe(2026);
    expect(yearlyData[0].paymentCount).toBe(4); // Sep, Oct, Nov, Dec
  });

  it('gives every year in between a full twelve', () => {
    const { yearlyData } = calculateMortgage(SEPT);
    for (const row of yearlyData.slice(1, -1)) expect(row.paymentCount).toBe(12);
  });

  it('puts the remainder in the last year', () => {
    const { yearlyData } = calculateMortgage(SEPT);
    expect(yearlyData[yearlyData.length - 1].paymentCount).toBe(8); // Jan–Aug 2056
  });

  it('accounts for every payment exactly once', () => {
    // The bug this replaced dropped the tail, so the table simply stopped a
    // year early rather than showing anything visibly wrong.
    const { yearlyData, schedule } = calculateMortgage(SEPT);
    const counted = yearlyData.reduce((sum, row) => sum + row.paymentCount, 0);
    expect(counted).toBe(schedule.length);
    expect(counted).toBe(360);
  });

  it('hands each year the slice of the schedule that belongs to it', () => {
    const { yearlyData, schedule } = calculateMortgage(SEPT);
    let expected = 0;
    for (const row of yearlyData) {
      expect(row.firstPaymentIndex).toBe(expected);
      expected += row.paymentCount;
    }
    expect(schedule[yearlyData[1].firstPaymentIndex].date).toContain('2027');
  });

  it('runs to the payoff year, not a year short', () => {
    const summary = calculateMortgage(SEPT);
    const lastYear = summary.yearlyData[summary.yearlyData.length - 1].year;
    expect(String(lastYear)).toBe(summary.payoffDate.split(' ')[1]);
  });

  it('still gives a January loan thirty whole years', () => {
    const { yearlyData } = calculateMortgage(JAN);
    expect(yearlyData).toHaveLength(30);
    for (const row of yearlyData) expect(row.paymentCount).toBe(12);
    expect(yearlyData[0].year).toBe(2026);
    expect(yearlyData[29].year).toBe(2055);
  });
});

describe('the payoff date is the last payment', () => {
  it('lands on the month of payment 360, not the month after', () => {
    expect(getPayoffDate(9, 2026, 30)).toBe('August 2056');
  });

  it('is the same month for a January loan', () => {
    expect(getPayoffDate(1, 2026, 30)).toBe('December 2055');
  });

  it('agrees with the last row of the schedule', () => {
    const summary = calculateMortgage(SEPT);
    expect(summary.schedule[summary.schedule.length - 1].date).toContain('2056');
    expect(summary.payoffDate).toContain('2056');
  });
});

describe('the money is untouched by the regrouping', () => {
  it('still totals the same interest', () => {
    const { schedule, totalInterest } = calculateMortgage(SEPT);
    const summed = schedule.reduce((sum, row) => sum + row.interest, 0);
    expect(totalInterest).toBeCloseTo(summed, 6);
  });

  it('splits that interest across the years without losing any', () => {
    const { yearlyData, totalInterest } = calculateMortgage(SEPT);
    const summed = yearlyData.reduce((sum, row) => sum + row.totalInterest, 0);
    expect(summed).toBeCloseTo(totalInterest, 6);
  });

  it('pays the loan off', () => {
    const { schedule } = calculateMortgage(SEPT);
    expect(schedule[schedule.length - 1].balance).toBeCloseTo(0, 6);
  });
});
