/**
 * The choices the debt calculator offers, in one place.
 *
 * The homepage view and the /debt-consolidation/ page view both draw these
 * dropdowns. The credit tiers are rates: written out twice, the two pages would
 * price the same borrower differently the first time one list was edited. The
 * rates themselves are Saxton's wholesale HELOAN guidelines and are not to be
 * changed from a design mock-up.
 */
export const DEBT_TYPES = [
  'Credit Card',
  'Auto Loan',
  'Personal Loan',
  'Medical',
  'Student Loan',
  'Other',
];

/** `value` is the rate the tier is priced at, as the string the select holds. */
export const HELOAN_TIERS = [
  { value: '13.99', label: '580–619 (est. 13.99%)' },
  { value: '11.99', label: '620–659 (est. 11.99%)' },
  { value: '10.49', label: '660–679 (est. 10.49%)' },
  { value: '8.99',  label: '680+ (est. 8.99%)' },
];

export const HELOAN_TERMS = [
  { value: '5',  label: '5 Years' },
  { value: '10', label: '10 Years' },
  { value: '15', label: '15 Years' },
  { value: '30', label: '30 Years' },
];

/** The option a visitor says they want to talk about. '' until they pick one. */
export type DebtOption = '' | 'refi' | 'refiSame' | 'heloan';
