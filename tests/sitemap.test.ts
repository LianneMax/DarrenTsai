import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');
const pages: Record<string, string> = {
  '/': 'index.html', '/home-equity/': 'home-equity/index.html', '/adu/': 'adu/index.html',
  '/mortgage-calculator/': 'mortgage-calculator/index.html', '/about/': 'about/index.html',
  '/dscr/': 'public/dscr/index.html', '/fha/': 'public/fha/index.html',
  '/realestateinvesting/': 'public/realestateinvesting/index.html',
  '/legal/': 'public/legal/index.html', '/privacy-policy/': 'public/privacy-policy/index.html',
};

describe('indexable sitemap destinations', () => {
  const xml = new DOMParser().parseFromString(read('public/sitemap.xml'), 'application/xml');
  const entries = [...xml.querySelectorAll('url')];
  it('lists the canonical public destinations once, without query funnels or booking exits', () => {
    expect(xml.querySelector('parsererror')).toBeNull();
    const urls = entries.map(entry => entry.querySelector('loc')!.textContent!);
    expect(urls.sort()).toEqual(Object.keys(pages).map(path => 'https://realdarrentsai.com' + path).sort());
    expect(new Set(urls).size).toBe(urls.length);
  });
  it.each(Object.entries(pages))('%s agrees with its page canonical and allows indexing', (path, file) => {
    const html = new DOMParser().parseFromString(read(file),'text/html');
    expect(html.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://realdarrentsai.com' + path);
    expect(html.querySelector('meta[name="robots"]')?.getAttribute('content') || '').not.toMatch(/noindex/i);
    const entry = entries.find(item => item.querySelector('loc')?.textContent === 'https://realdarrentsai.com' + path)!;
    expect(entry.querySelector('lastmod')?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.each(['book','out-of-market-primary','out-of-market-dscr'])('keeps %s intentionally noindex and out of the sitemap', slug => {
    const html = new DOMParser().parseFromString(read(`public/${slug}/index.html`),'text/html');
    expect(html.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/i);
    expect(read('public/sitemap.xml')).not.toContain(`https://realdarrentsai.com/${slug}/`);
  });
});
