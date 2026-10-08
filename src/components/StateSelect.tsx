import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasFinePointer, useAnchoredPanel } from '../hooks/useAnchoredPanel';

// US states — full name shown, 2-letter abbreviation stored/sent.
// Same list used by the static /fha, /dscr, /realestateinvesting pages.
const US_STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

interface Props {
  id: string;
  value: string;
  onChange: (abbr: string) => void;
  hasError?: boolean;
  placeholder?: string;
}

// reui c-select-4-style searchable combobox: trigger button + a fixed-position
// portaled panel (search input, checkmark on the selected row) — escapes any
// modal's overflow:hidden/auto clipping instead of getting cut off.
export default function StateSelect({ id, value, onChange, hasError, placeholder = 'Select your state…' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = US_STATES.find(([abbr]) => abbr === value);
  const label = selected ? selected[1] : placeholder;
  const filtered = US_STATES.filter(([, name]) => name.toLowerCase().includes(query.trim().toLowerCase()));

  // Stable, because useAnchoredPanel's listeners are re-bound when it changes.
  const closePanel = useCallback(() => setOpen(false), []);
  const { place, measure } = useAnchoredPanel(open, triggerRef, panelRef, closePanel);

  function openPanel() {
    measure();
    setQuery('');
    setOpen(true);
  }
  function choose(abbr: string) {
    onChange(abbr);
    closePanel();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // Mouse and trackpad only, and without scrolling to it: see useAnchoredPanel.
    if (hasFinePointer()) searchRef.current?.focus({ preventScroll: true });

    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      closePanel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { closePanel(); triggerRef.current?.focus(); }
    }

    // Scroll and resize are not here any more: they used to close the panel,
    // which on a phone meant the keyboard or a thumb closed it. useAnchoredPanel
    // moves the panel with its trigger instead.
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, closePanel]);

  return (
    <div className={`cselect${open ? ' open' : ''}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`cselect-trigger${hasError ? ' input-error' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closePanel() : openPanel())}
      >
        <span className={`cselect-value${selected ? ' has-value' : ''}`}>{label}</span>
        <svg className="cselect-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && place && createPortal(
        <div
          ref={panelRef}
          className="cselect-panel open"
          role="listbox"
          style={{ top: place.top, bottom: place.bottom, left: place.left, width: place.width, maxHeight: place.maxHeight }}
        >
          <div className="cselect-search">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search state…"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) choose(filtered[0][0]); }}
            />
          </div>
          <div className="cselect-options">
            {filtered.length === 0 && <div className="cselect-empty">No matches</div>}
            {filtered.map(([abbr, name]) => (
              <div
                key={abbr}
                role="option"
                aria-selected={abbr === value}
                className={`cselect-option${abbr === value ? ' selected' : ''}`}
                onClick={() => choose(abbr)}
              >
                <svg className="cselect-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
