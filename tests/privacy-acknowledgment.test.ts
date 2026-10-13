import { describe, it, expect, vi, afterEach } from 'vitest';
import { useLeadSubmit } from '../src/hooks/useLeadSubmit';
vi.mock('../src/utils/attribution', () => ({ getAttribution: () => ({}), track: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });
describe('required privacy acknowledgment, optional SMS', () => {
  it('blocks a request before network activity, then permits it without SMS consent', async () => {
    document.body.innerHTML = '<input type="checkbox" required data-privacy-form="home-contact-modal"><input type="checkbox" data-sms-form="home-contact-modal">';
    const fetchMock = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const submit = useLeadSubmit({ formId: 'home-contact-modal', thankYouPath: '/thanks', thankYouTitle: 'Thanks' });
    const payload = { source: 'home-contact', email: 'test@example.com', phone: '7145550101', firstName: 'Test', lastName: '', state: 'CA' };
    expect(await submit(payload)).toMatchObject({ ok: false, kind: 'fieldError', field: 'privacyAcknowledged' });
    expect(fetchMock).not.toHaveBeenCalled();
    (document.querySelector('[data-privacy-form]') as HTMLInputElement).checked = true;
    expect(await submit(payload)).toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ privacyAcknowledged: true, smsConsent: false });
  });
});
