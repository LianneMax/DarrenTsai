import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/lead-request.js', 'utf8');
const key = 'dt_pending_leads_v1';
const payload = { formId: 'dscr-magnet', email: 'test@example.com', phone: '7145550101', timestamp: 'first-time', smsConsentAt: 'first-consent-time', smsConsent: false, rent: 2400, firstTouchTs: 'first-touch' };
function saved(id = window.DTLead!.prepare('dscr-magnet', payload).submissionId) { return new Response(JSON.stringify({ok:true,receipt:'saved',submissionId:id,replayed:true})); }
function boot() { delete window.DTLead; new Function(source)(); return window.DTLead!; }
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('DTConsent', { isAllowed: () => true }); boot(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('one identity for one submitted inquiry', () => {
  it('freezes the complete body across retry, preserving original consent and attribution', () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    const retry = window.DTLead!.prepare('dscr-magnet', { ...payload, timestamp: 'later', smsConsentAt: 'later', firstTouchTs: 'regenerated', utm_source: 'changed' });
    expect(retry.body).toBe(first.body);
    expect(JSON.parse(first.body)).toMatchObject({ ...payload, submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });
  it.each([{ rent: 2500 }, { email: 'another@example.com' }, { smsConsent: true }])('starts a new identity for edited answers or consent: %j', change => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    const edited = window.DTLead!.prepare('dscr-magnet', { ...payload, ...change });
    expect(edited.submissionId).not.toBe(first.submissionId);
  });
  it('recovers an unconfirmed frozen request after reload, without posting on load', () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const reloaded = boot();
    expect(fetch).not.toHaveBeenCalled();
    expect(reloaded.prepare('dscr-magnet', { ...payload, timestamp: 'later' }).body).toBe(first.body);
  });
  it('keeps denied storage recoverable in memory without blocking capture', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.stubGlobal('fetch', vi.fn(async () => saved()));
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    expect((await window.DTLead!.submit('dscr-magnet', payload)).ok).toBe(true);
    expect(window.DTLead!.prepare('dscr-magnet', payload).body).toBe(first.body);
  });
  it('expires pending personal drafts and supports explicit new intent', () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
    const reloaded = boot();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(reloaded.prepare('dscr-magnet', payload).submissionId).not.toBe(first.submissionId);
    const second = reloaded.prepare('dscr-magnet', payload).submissionId;
    reloaded.reset('dscr-magnet');
    expect(reloaded.prepare('dscr-magnet', payload).submissionId).not.toBe(second);
  });
  it.each([undefined, { isAllowed: () => false }])('keeps rejected/unknown consent retries in memory only', consent => {
    vi.stubGlobal('DTConsent', consent);
    const first = window.DTLead!.prepare('dscr-magnet', { ...payload, utm_source: 'google', clickId: 'private-click' });
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(window.DTLead!.prepare('dscr-magnet', { ...payload, utm_source: 'google', clickId: 'private-click' }).body).toBe(first.body);
  });
  it('purges a durable pending draft on consent withdrawal and preserves same-page recovery', () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    expect(sessionStorage.getItem(key)).not.toBeNull();
    vi.stubGlobal('DTConsent', { isAllowed: () => false });
    window.dispatchEvent(new Event('dt:consent'));
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(window.DTLead!.prepare('dscr-magnet', payload).body).toBe(first.body);
    boot();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('makes reopening a confirmed form a new inquiry while preserving uncertain recovery', async () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    window.DTLead!.begin('dscr-magnet');
    expect(window.DTLead!.prepare('dscr-magnet', payload).submissionId).toBe(first.submissionId);
    vi.stubGlobal('fetch', vi.fn(async () => saved()));
    await window.DTLead!.submit('dscr-magnet', payload);
    window.DTLead!.begin('dscr-magnet');
    expect(window.DTLead!.prepare('dscr-magnet', payload).submissionId).not.toBe(first.submissionId);
  });
  it('binds conversion identity and original attribution to the actual completed response', async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const originalId = window.DTLead!.prepare('dscr-magnet', { ...payload, utm_campaign:'campaign-a' }).submissionId;
    const saving = window.DTLead!.submit('dscr-magnet', { ...payload, utm_campaign: 'campaign-a' });
    window.DTLead!.prepare('dscr-magnet', { ...payload, email: 'another@example.com', utm_campaign: 'campaign-b' });
    finish(saved(originalId));
    const response = await saving;
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(true);
    expect(window.DTLead!.claimConversion('dscr-magnet', response)).toBe(false);
    expect(window.DTLead!.attribution('dscr-magnet', response).utm_campaign).toBe('campaign-a');
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
  });
  it('clears confirmed drafts and reports the conversion once for a saved retry', async () => {
    const fetch = vi.fn(async () => saved());
    vi.stubGlobal('fetch', fetch);
    await window.DTLead!.submit('dscr-magnet', payload);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(true);
    await window.DTLead!.submit('dscr-magnet', { ...payload, timestamp: 'later' });
    expect(fetch.mock.calls).toHaveLength(2);
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
  });
  it.each([new Response('{"ok":false}'), new Response('<html>proxy failure</html>'), new Response('{"ok":true,"submissionId":"wrong"}'), new Response('{"ok":true,"receipt":"uncertain"}')])('never treats an unexpected 2xx as saved', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(window.DTLead!.submit('dscr-magnet', payload)).rejects.toThrow();
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });
  it.each([409, 422, 429, 502, 503])('retains a safe retry identity after HTTP %s', async status => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    expect((await window.DTLead!.submit('dscr-magnet', payload)).status).toBe(status);
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
    expect(window.DTLead!.prepare('dscr-magnet', payload).body).toBe(first.body);
  });
  it('waits for a deliberate retry before replacing an explicitly conflicted identity', async () => {
    const first = window.DTLead!.prepare('dscr-magnet', payload);
    const fetch = vi.fn(async () => new Response('{"code":"submission_conflict"}', {status:409}));
    vi.stubGlobal('fetch',fetch);
    await window.DTLead!.submit('dscr-magnet',payload);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(key)!)['dscr-magnet'].submissionId).toBe(first.submissionId);
    expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
    // This is the next deliberate send, not a background recovery POST.
    await window.DTLead!.submit('dscr-magnet',payload);
    expect(JSON.parse(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)).submissionId).not.toBe(first.submissionId);
  });
});


it('keeps a saved Sheet-only inquiry out of qualified conversions, including on replay', async () => {
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:true,receipt:'saved',submissionId:window.DTLead!.prepare('dscr-magnet',payload).submissionId,disposition:'sheet-only'}))));
  const response=await window.DTLead!.submit('dscr-magnet',payload);
  expect(response.ok).toBe(true);
  expect(window.DTLead!.claimConversion('dscr-magnet',response)).toBe(false);
  expect(window.DTLead!.claimConversion('dscr-magnet')).toBe(false);
  const replay=await window.DTLead!.submit('dscr-magnet',payload);
  expect(window.DTLead!.claimConversion('dscr-magnet',replay)).toBe(false);
});
