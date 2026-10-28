import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useLeadSubmit } from '../src/hooks/useLeadSubmit';

const runtime = readFileSync('public/lead-request.js', 'utf8');
const forms = [['home-equity-calculator','home-equity'],['debt-savings-calculator','DebtConsolidation']];
const identify = vi.fn(); const track = vi.fn();
const lead = {firstName:'Test',lastName:'Inquiry',email:'local@example.com',phone:'7145550123',state:'CO',propertyState:'CO',propertyUse:'primary'};
beforeEach(()=>{
  sessionStorage.clear(); delete window.DTLead; new Function(runtime)();
  window.DT={attr:()=>({utm_source:'local-test'}),track};
  Object.assign(window,{DTBooking:{identify}});
  document.body.innerHTML=''; identify.mockClear(); track.mockClear();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals(); delete window.DT; delete (window as Window & {DTBooking?:unknown}).DTBooking;});
function form(formId:string, checked=true) {document.body.innerHTML=`<input type="checkbox" data-privacy-form="${formId}" ${checked?'checked':''}>`;}
function submit(formId:string,source:string,patch={}) {
  return useLeadSubmit({formId,thankYouPath:'/thank-you/local',thankYouTitle:'Local',consentGatedUserData:true})({...lead,source,...patch});
}
function respond(disposition?:string,wrongId=false) {
  return vi.fn(async (_url:unknown,init:RequestInit)=>{
    const body=JSON.parse(String(init.body));
    return new Response(JSON.stringify({ok:true,receipt:'saved',submissionId:wrongId?'wrong-id':body.submissionId,...(disposition?{disposition}:{})}));
  });
}
describe('equity callers honor the confirmed capture disposition',()=>{
  it('preserves comparison APR assumptions after the comparison DOM has unmounted', async()=>{
    form('debt-savings-calculator'); const fetch=respond();vi.stubGlobal('fetch',fetch);
    const aprEstimates=[{principal:425000,noteRate:6.41,termYears:20,upfrontFinanceCharges:2000,estimatedApr:6.47,estimateOnly:true}];
    expect(await submit('debt-savings-calculator','DebtConsolidation',{propertyState:'CA',state:'CA',comparisonOption:'refiSame',refiIllustrationTermYears:20,aprEstimates})).toEqual({ok:true});
    const sent=JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(sent.aprEstimates).toEqual(aprEstimates);
    expect(sent.comparisonOption).toBe('refiSame');expect(sent.refiIllustrationTermYears).toBe(20);
    expect(sent.privacyAcknowledged).toBe(true);expect(sent.smsConsent).toBe(false);
  });
  it.each(forms)('%s does not post before explicit acknowledgment',async(formId,source)=>{
    const fetch=respond('sheet-only');vi.stubGlobal('fetch',fetch);
    expect(await submit(formId,source)).toMatchObject({ok:false,field:'privacyAcknowledged'});
    form(formId,false);expect(await submit(formId,source)).toMatchObject({ok:false,field:'privacyAcknowledged'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(forms)('%s saves interest without identifying, converting or showing a thank-you page',async(formId,source)=>{
    form(formId);vi.stubGlobal('fetch',respond('sheet-only'));
    expect(await submit(formId,source)).toEqual({ok:true,disposition:'sheet-only'});
    expect(identify).not.toHaveBeenCalled();expect(track).not.toHaveBeenCalled();
  });
  it.each(forms)('%s refuses a missing, mismatched or inappropriate disposition',async(formId,source)=>{
    form(formId);vi.stubGlobal('fetch',respond()); expect(await submit(formId,source)).toEqual({ok:false,kind:'failed'});
    vi.stubGlobal('fetch',respond('sheet-only',true));expect(await submit(formId,source)).toEqual({ok:false,kind:'failed'});
    vi.stubGlobal('fetch',respond('sheet-only'));expect(await submit(formId,source,{propertyUse:'investment'})).toEqual({ok:false,kind:'failed'});
    expect(identify).not.toHaveBeenCalled();expect(track).not.toHaveBeenCalled();
  });
  it.each(forms)('%s preserves supported rentals and emits its qualified conversion only once',async(formId,source)=>{
    form(formId);vi.stubGlobal('fetch',respond());
    expect(await submit(formId,source,{propertyUse:'investment'})).toEqual({ok:true});
    expect(await submit(formId,source,{propertyUse:'investment'})).toEqual({ok:true});
    expect(track.mock.calls.filter(c=>c[0]==='generate_lead')).toHaveLength(1);
    expect(identify).toHaveBeenCalled();
  });
});
