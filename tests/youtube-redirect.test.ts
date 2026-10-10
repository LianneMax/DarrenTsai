// @vitest-environment node
import { describe, expect, it } from 'vitest';
import redirect, { SHORTLINKS } from '../netlify/functions/youtube-redirect.mts';

describe('YouTube redirects preserve a visitor’s original tracking query', () => {
  it.each(Object.entries(SHORTLINKS))('%s has distinct description/comment defaults and never loses click IDs', (bucket, destination) => {
    for (const [suffix, content] of [['', 'description'], ['-c', 'pinned-comment']]) {
      const query = new URLSearchParams({ gclid:'TEST+/= ID', gbraid:'BRAID', wbraid:'WBRAID', msclkid:'MSCLICK', fbclid:'FBCLICK', utm_term:'video-specific terms', extra:'preserve me' });
      const response = redirect(new Request(`https://realdarrentsai.com/yt/${bucket}${suffix}?${query}`));
      const target = new URL(response.headers.get('Location')!);
      expect(response.status).toBe(302);
      expect(target.pathname).toBe(destination.path);
      expect(target.origin).toBe('https://realdarrentsai.com');
      for (const [key, value] of query) expect(target.searchParams.get(key)).toBe(value);
      expect(target.searchParams.get('utm_campaign')).toBe(destination.campaign);
      expect(target.searchParams.get('utm_content')).toBe(content);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });
  it('keeps explicit video/campaign UTMs and repeated unknown query values', () => {
    const response = redirect(new Request('https://realdarrentsai.com/yt/home?utm_source=youtube&utm_medium=cpc&utm_campaign=video-19&utm_content=description-video-19&ref=a&ref=b'));
    const query = new URL(response.headers.get('Location')!).searchParams;
    expect(query.get('utm_medium')).toBe('cpc');
    expect(query.get('utm_campaign')).toBe('video-19');
    expect(query.get('utm_content')).toBe('description-video-19');
    expect(query.getAll('ref')).toEqual(['a','b']);
  });
  it('supports HEAD checks without writing or contacting other services', () => {
    expect(redirect(new Request('https://realdarrentsai.com/yt/debt/', { method:'HEAD' })).status).toBe(302);
  });
  it.each(['unknown','constructor','__proto__','toString','home-c-c'])('returns a real 404 for %s', bucket => {
    expect(redirect(new Request(`https://realdarrentsai.com/yt/${bucket}`)).status).toBe(404);
  });
  it('rejects POST and cannot use a query parameter as an external destination', () => {
    expect(redirect(new Request('https://realdarrentsai.com/yt/home', { method:'POST' })).status).toBe(405);
    const target = new URL(redirect(new Request('https://realdarrentsai.com/yt/home?redirect=https://example.com/')).headers.get('Location')!);
    expect(target.origin).toBe('https://realdarrentsai.com');
  });
});
