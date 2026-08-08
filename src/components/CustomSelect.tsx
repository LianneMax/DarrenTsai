import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  id: string;
  value: string;
  options: SelectOption[]; // real options only — no placeholder entry
  onChange: (value: string) => void;
  hasError?: boolean;
  placeholder: string;
}

// reui c-select-4-style combobox: trigger button + a fixed-position portaled
// panel (checkmark on the selected row) — escapes any modal's
// overflow:hidden/auto clipping instead of getting cut off. Search input
// only shows once there are 10+ options (mirrors enhanceSelect() on the
// static /fha, /dscr, /realestateinvesting pages).
export default function CustomSelect({ id, value, options, onChange, hasError, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const searchable = options.length >= 10;
  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder;
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function openPanel() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    setQuery('');
    setOpen(true);
  }
  function closePanel() {
    setOpen(false);
  }
  function choose(v: string) {
    onChange(v);
    closePanel();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();

    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      closePanel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { closePanel(); triggerRef.current?.focus(); }
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      closePanel();
    }

    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closePanel);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closePanel);
    };
  }, [open, searchable]);

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

      {open && rect && createPortal(
        <div
          ref={panelRef}
          className="cselect-panel open"
          role="listbox"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {searchable && (
            <div className="cselect-search">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search…"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) choose(filtered[0].value); }}
              />
            </div>
          )}
          <div className="cselect-options">
            {filtered.length === 0 && <div className="cselect-empty">No matches</div>}
            {filtered.map((o) => (
              <div
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`cselect-option${o.value === value ? ' selected' : ''}`}
                onClick={() => choose(o.value)}
              >
                <svg className="cselect-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{o.label}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
