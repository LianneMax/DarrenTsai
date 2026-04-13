const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value));
}

export function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatDate(month: number, year: number): string {
  const name = MONTH_NAMES[(month - 1 + 12) % 12];
  return `${name} ${year}`;
}
