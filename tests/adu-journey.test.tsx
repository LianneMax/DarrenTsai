// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AduCalculator from '../src/components/AduCalculator';
import { buildAduLead } from '../src/utils/adu';
import AduHouseExplorer from '../src/components/AduHouseExplorer';

let root:Root; let host:HTMLDivElement; let posted:Record<string,unknown>[];
const text=()=>host.textContent||'';
const heading=()=>host.querySelector('#adu-step-heading')?.textContent;
async function button(name:string) {
  const button=Array.from(host.querySelectorAll('button')).find(b=>{const label=b.getAttribute('aria-label')||b.textContent?.trim().replace(/^[\d\s←✓]+/,'')||'';return label===name||label.startsWith(name);});
  expect(button, name).toBeTruthy(); await act(async()=>button!.click());
}
async function input(id:string,value:string) {
  const el=host.querySelector<HTMLInputElement|HTMLSelectElement>('#'+id)!;
  const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function project(){await button('ADU for family');await input('adu-cost','175000');await input('adu-finance','75000');await button('Add my home');}
async function home(state='CA',balance='350000'){await input('adu-value','650000');await input('adu-balance',balance);await input('adu-calculator-property-use','primary');await input('adu-calculator-property-state',state);await button('See my snapshot');}
async function contact(){await button('Talk through my plan');await input('lead-fname','TEST');await input('lead-lname','Local Preview');await input('lead-email','test@example.com');await input('lead-phone','7145550191');}
beforeEach(async()=>{
  window.DTLead?.reset('adu-calculator');
  document.body.innerHTML='';host=document.createElement('div');document.body.append(host);root=createRoot(host);posted=[];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  Element.prototype.scrollIntoView=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const lead=JSON.parse(init.body);posted.push(lead);return new Response(JSON.stringify({ok:true,receipt:'saved',submissionId:lead.submissionId,replayed:false}),{status:200});}));
  await act(async()=>root.render(<AduCalculator/>));
});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('house exploration motion',()=>{
  async function loadImages(){await act(async()=>host.querySelectorAll('img').forEach(image=>image.dispatchEvent(new Event('load'))));}
  async function clock(ms:number){await act(async()=>vi.advanceTimersByTime(ms));}
  const scene=()=>host.querySelector('.adu-house-stage')?.getAttribute('data-scene');
  it('keeps reduced-motion visitors in control without starting a tour',async()=>{
    vi.useFakeTimers(); await loadImages(); await clock(12000);expect(scene()).toBe('original');
    expect(host.querySelector('.adu-tour-toggle')).toBeNull(); // no pause/play button since 20 Oct
    await button('Detached ADU');expect(scene()).toBe('detached');await clock(12000);expect(scene()).toBe('detached');expect(posted).toHaveLength(0);
  });
  it('cycles after number selection and holds while hovered, with no pause button',async()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
    await act(async()=>root.render(<AduHouseExplorer/>));vi.useFakeTimers();await loadImages();
    await clock(5600);expect(scene()).toBe('detached');
    await button('Garage conversion');expect(scene()).toBe('garage');await clock(5600);expect(scene()).toBe('renovation');
    expect(host.querySelector('[aria-label="Pause house animation"],[aria-label="Play house animation"]')).toBeNull();
    const figure=host.querySelector('.adu-house-explorer')!;
    await act(async()=>{figure.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));});await clock(12000);expect(scene()).toBe('renovation');
    await act(async()=>{figure.dispatchEvent(new MouseEvent('mouseout',{bubbles:true}));});await clock(5600);expect(scene()).toBe('original');
  });
  it('suspends the tour in a hidden tab and preserves a missing-image fallback',async()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
    await act(async()=>root.render(<AduHouseExplorer/>));vi.useFakeTimers();await loadImages();
    vi.spyOn(document,'hidden','get').mockReturnValue(true);
    await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await clock(12000);expect(scene()).toBe('original');
    await button('Attached ADU');
    await act(async()=>host.querySelector<HTMLImageElement>('.adu-house-attached')!.dispatchEvent(new Event('error')));
    expect(text()).toContain('This illustration is unavailable');
    expect(host.querySelector('.adu-house-original.is-fallback')).not.toBeNull();
  });
  it('pauses offscreen and supports arrow-key exploration without a form post',async()=>{
    let report: (entries:{isIntersecting:boolean}[])=>void=()=>{};
    vi.stubGlobal('IntersectionObserver',class {constructor(callback:typeof report){report=callback;}observe(){}disconnect(){}});
    vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
    await act(async()=>root.render(<AduHouseExplorer/>));vi.useFakeTimers();await loadImages();
    await act(async()=>report([{isIntersecting:false}]));await clock(12000);expect(scene()).toBe('original');
    await act(async()=>report([{isIntersecting:true}]));await clock(5600);expect(scene()).toBe('detached');
    await act(async()=>host.querySelector('.adu-house-timeline')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
    expect(scene()).toBe('attached');await clock(5600);expect(scene()).toBe('garage');expect(posted).toHaveLength(0);
  });
});
describe('isolated ADU design journey',()=>{
  it('starts empty and does not allow skipping incomplete project or home steps',async()=>{
    expect(Array.from(host.querySelectorAll('input')).every(el=>el.value==='')).toBe(true);
    expect(host.querySelector('.adu-purpose[aria-pressed="true"]')).toBeNull();
    await button('Talk to Darren');expect(heading()).toBe('What are you planning?');expect(posted).toHaveLength(0);
    await project();await button('Talk to Darren');expect(heading()).toBe('The home behind your plan.');expect(posted).toHaveLength(0);
  });
  it('shows correct project and equity figures before asking for contact',async()=>{
    await project();await home();expect(heading()).toBe('Your project, in perspective.');
    expect(text()).toContain('$175,000');expect(text()).toContain('$75,000');expect(text()).toContain('$100,000');expect(text()).toContain('$300,000');
    expect(host.querySelector('input[type="email"]')).toBeNull();expect(posted).toHaveLength(0);
  });
  it('retains project, home and state/use answers through back navigation',async()=>{
    await project();await home();await button('Back');expect((host.querySelector('#adu-value') as HTMLInputElement).value).toBe('650000');
    expect((host.querySelector('#adu-calculator-property-state') as HTMLSelectElement).value).toBe('CA');
    await button('Back');expect((host.querySelector('#adu-cost') as HTMLInputElement).value).toBe('175000');expect(host.querySelector('.adu-purpose[aria-pressed="true"]')?.textContent).toContain('ADU for family');
  });
  it('lets unsupported property locations reach contact without saving before privacy acknowledgment',async()=>{
    await project();await home('NY');expect(heading()).toBe('Your project, in perspective.');expect(text()).toContain('$100,000');
    await button('Talk through my plan');expect(host.querySelector('#lead-email')).not.toBeNull();expect(text()).toContain('your inquiry is recorded without a calendar');expect(posted).toHaveLength(0);
  });
  it('handles a paid-off home and an underwater home without implying available credit',async()=>{
    await project();await home('CA','0');expect(text()).toContain('$650,000');await button('Back');await input('adu-balance','700000');await button('See my snapshot');
    expect(text()).toContain('None at these numbers');expect(text()).toContain('not available credit');expect(posted).toHaveLength(0);
  });
  it('keeps exact lead math and consent payload when property questions move earlier',async()=>{
    await project();await home();await contact();
    const ack=host.querySelector<HTMLInputElement>('[data-privacy-form="adu-calculator"]')!;
    expect(ack).toBeTruthy();expect(host.querySelector<HTMLInputElement>('[data-sms-form]')!.checked).toBe(false);expect(host.querySelector<HTMLInputElement>('[data-sms-info-form]')!.checked).toBe(false);
    await button('Send my project');expect(posted).toHaveLength(0);
    await act(async()=>ack.click());await button('Send my project');expect(posted).toHaveLength(1);
    const expected=buildAduLead({firstName:'TEST',lastName:'Local Preview',email:'test@example.com',phone:'(714) 555-0191',state:'CA',homeValue:650000,mortgageBalance:350000,projectCost:175000,amountToFinance:75000,purpose:'ADU for family'});
    const {timestamp:_,...stable}=expected;expect(posted[0]).toMatchObject(stable);
    expect(posted[0]).toMatchObject({submissionId:expect.stringMatching(/^inbox1-[0-9a-f-]{36}$/),formId:'adu-calculator',source:'adu',propertyUse:'primary',propertyState:'CA',privacyAcknowledged:true,smsConsent:false,smsInformationalConsent:false,smsMarketingConsent:false});
    expect(text()).toContain('Your inquiry is saved. Loading the next step…');
  });
  it('keeps an editable request on a rejected email and never shows confirmation',async()=>{
    await project();await home();await contact();await act(async()=>host.querySelector<HTMLInputElement>('[data-privacy-form]')!.click());
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"field":"email","message":"Please check this email address."}',{status:422}));
    await button('Send my project');expect(text()).toContain('Please check this email address.');expect(host.querySelector('#lead-email')).not.toBeNull();expect(text()).not.toContain('Your inquiry is saved. Loading the next step…');
  });
  it('never turns a connection failure into confirmation',async()=>{
    await project();await home();await contact();await act(async()=>host.querySelector<HTMLInputElement>('[data-privacy-form]')!.click());
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));await button('Send my project');expect(text()).toContain("couldn't confirm whether your request was saved");expect(text()).not.toContain('Your inquiry is saved. Loading the next step…');
    const originalBody=vi.mocked(fetch).mock.calls[0][1]!.body;
    await button('Send my project');
    expect(vi.mocked(fetch).mock.calls[1][1]!.body).toBe(originalBody);
    expect(posted).toHaveLength(1);
    expect(text()).toContain('Your inquiry is saved. Loading the next step…');
  });
});
