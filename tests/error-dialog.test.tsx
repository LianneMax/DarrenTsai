import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ErrorDialog } from '../src/components/PageParts';

it.each(['validation', 'save'] as const)('%s recovery traps focus, restores it and never changes the form', async kind => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const dismiss = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return <><input aria-label="Retained message" defaultValue="Keep my question" />
      <button onClick={() => setOpen(true)}>Submit request</button>
      <ErrorDialog id="test-error" kind={kind} message={open ? 'Specific recovery instructions' : null}
        onClose={() => { dismiss(); setOpen(false); }} /></>;
  }
  try {
    await act(async () => root.render(<Example />));
    const trigger = host.querySelector('button')!; trigger.focus();
    await act(async () => trigger.click());
    const dialog = host.querySelector('[role=alertdialog]')!;
    expect(dialog.getAttribute('aria-describedby')).toBe('test-error-message');
    expect(dialog.textContent).toContain(kind === 'save' ? 'Save not confirmed' : 'Check your details');
    const [close, back] = Array.from(dialog.querySelectorAll('button'));
    expect(document.activeElement).toBe(back);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(back);
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role=alertdialog]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector('input')?.value).toBe('Keep my question');
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).not.toBe('hidden');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
