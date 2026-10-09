/**
 * The homepage as a goal hub (revamp phase 4).
 *
 * The plan's rule for this phase: never link to a page that does not exist,
 * and replace every /#savings link in the same release, because /#savings
 * stopped meaning anything the moment the calculator left the homepage.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import App from '../src/App';
import { HomeGoals } from '../src/components/HomeHub';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** A same-site path the build serves: a Vite entry or a static page in public/. */
function served(path: string): boolean {
  const dir = path.replace(/^\//, '').replace(/#.*$/, '');
  if (dir === '') return true;
  return existsSync(join(root, dir, 'index.html')) || existsSync(join(root, 'public', dir, 'index.html'));
}

describe('the homepage', () => {
  const page = renderToStaticMarkup(<App />);

  it('no longer hosts the debt calculator', () => {
    expect(page).not.toContain('id="savings"');
    expect(page).not.toMatch(/See How Much You Could Save/);
  });

  it('links only to pages that exist', () => {
    const hrefs = [...page.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(expect.arrayContaining(['/debt-consolidation/', '/home-equity/', '/adu/', '/fha/']));
    for (const h of hrefs) expect(served(h), h).toBe(true);
  });

  it('keeps the sections the nav and the hero point at', () => {
    for (const id of ['goals', 'about', 'reviews', 'tools']) expect(page).toContain(`id="${id}"`);
    expect(page).toContain('href="#goals"');
  });
});

describe('no /#savings link is left anywhere', () => {
  it('in the React source or the static pages', () => {
    const files = [
      ...readdirSync(join(root, 'src'), { recursive: true }).map((f) => join('src', String(f))),
      'public/dscr/index.html', 'public/fha/index.html', 'public/realestateinvesting/index.html',
    ].filter((f) => /\.(tsx?|html)$/.test(f));
    for (const f of files) expect(read(f), f).not.toMatch(/\/#savings/);
  });
});

describe('the goal cards', () => {
  let r: Root | null = null;
  let host: HTMLDivElement;
  afterEach(() => { act(() => r?.unmount()); host?.remove(); r = null; });

  function mount(onOpenContact = () => {}) {
    host = document.body.appendChild(document.createElement('div'));
    r = createRoot(host);
    act(() => r!.render(<HomeGoals onOpenContact={onOpenContact} />));
    return (name: RegExp) => [...host.querySelectorAll<HTMLElement>('.hub-goal')].find((b) => name.test(b.textContent ?? ''))!;
  }

  it('"Not sure where to start?" opens the contact modal', () => {
    let opened = 0;
    const card = mount(() => { opened++; });
    act(() => card(/Not sure where to start/).click());
    expect(opened).toBe(1);
  });

  it('Invest asks which of its two pages, and Escape closes it', () => {
    const card = mount();
    expect(host.querySelector('[role=dialog]')).toBeNull();
    act(() => card(/Invest in Property/).click());
    const dialog = host.querySelector('[role=dialog]')!;
    expect([...dialog.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/dscr/', '/realestateinvesting/']);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });
});
