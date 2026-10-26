import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import handler from '../netlify/functions/lead.mts';
import policy from '../public/service-area-policy.json';
import {propertyUses, serviceArea} from '../src/utils/serviceArea';
import {loadGas, type MailMessage} from './helpers/gas-harness';

const key='local-sitewide-verification';
const pairs=Object.entries(policy.inquiryForms);
const upstream='https://local-writer.invalid/exec';
type Runtime={doPost:(e:unknown)=>{__body:string};processFollowUps:()=>void;INQUIRY_FORMS:Record<string,string>;captureServiceArea:(d:object)=>string};
function setup(){
  const messages:MailMessage[]=[];const providers:string[]=[];
  const h=loadGas<Runtime>({exports:['doPost','processFollowUps','INQUIRY_FORMS','captureServiceArea'],props:{LEAD_PROXY_KEY:key,HUBSPOT_PORTAL_ID:'test',HUBSPOT_FORM_GUID:'test',HUBSPOT_SEND_TESTS:'true',CALLRAIL_SYNC_ENABLED:'true',CALLRAIL_SEND_TESTS:'true',CALLRAIL_API_TOKEN:'test',CALLRAIL_ACCOUNT_ID:'test',CALLRAIL_COMPANY_ID:'test'},onMail:m=>messages.push(m),fetch:url=>{providers.push(url);return {getResponseCode:()=>200,getContentText:()=>'{"emails":[]}'};}});
  vi.stubGlobal('Netlify',{env:{get:(name:string)=>({APPS_SCRIPT_WEBHOOK_URL:upstream,LEAD_PROXY_KEY:key})[name]}});
  const forwarded:Record<string,unknown>[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:unknown,init:RequestInit)=>{
    expect(String(url)).toBe(upstream);const data=JSON.parse(String(init.body));forwarded.push(data);
    return new Response(h.gas.doPost({postData:{contents:JSON.stringify(data)}}).__body,{headers:{'Content-Type':'application/json'}});
  }));
  const post=(data:object)=>handler(new Request('https://realdarrentsai.com/api/lead',{method:'POST',headers:{'content-type':'application/json',origin:'https://realdarrentsai.com'},body:JSON.stringify(data)}),{} as never);
  return {...h,post,messages,providers,forwarded};
}
function inquiry(formId:string,source:string,patch:object={}){
  return {formId,source,submissionId:'sitewide-'+formId,firstName:'TEST',lastName:'Sitewide',email:'liannemaxbalbastro+sitewide@gmail.com',phone:'7145550123',state:'CA',propertyState:source.includes('dscr')?'NY':'CO',propertyUse:source.includes('dscr')?'investment':'primary',propertyType:'single-family-condo',mortgageCurrent:'yes',recentBankruptcyForeclosure:'no',privacyAcknowledged:true,privacyVersion:'2026-10-13-v1',message:'=IMPORTXML("https://invalid.test","//a")',timestamp:'2026-10-26T00:00:00.000Z',utm_source:'local-verification',clickId:'local-test-click',clickIdType:'gclid',...patch};
}
const tabFor:Record<string,string>={'home-equity':'Home Equity',DebtConsolidation:'Debt Consolidation',adu:'ADU',dscr:'DSCR',fha:'FHA','real-estate-investing':'Real Estate Investing','home-contact':'Needs Guidance','mortgage-calculator-contact':'Mortgage Review','debt-consolidation-contact':'Debt Consolidation','home-equity-contact':'Home Equity','adu-contact':'ADU','dscr-contact':'DSCR','fha-contact':'FHA','rei-contact':'Real Estate Investing'};
beforeEach(()=>{vi.spyOn(console,'error').mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('site-wide actual endpoint -> actual writer capture',()=>{
  it('pins the independent writer allowlist and every context/state/use against the shared policy',()=>{
    const h=setup();expect(h.gas.INQUIRY_FORMS).toEqual(policy.inquiryForms);
    for(const [formId,source] of pairs)for(const propertyUse of propertyUses(source))for(const propertyState of policy.states){
      expect(h.gas.captureServiceArea({formId,propertyUse,propertyState}),`${formId}/${propertyUse}/${propertyState}`).toBe(serviceArea(propertyUse,propertyState,source));
    }
  });
  it.each(pairs)('%s independently confirms a retained inquiry, safely writes its message once and never dispatches it',async(formId,source)=>{
    const h=setup();const data=inquiry(formId,source,{captureDisposition:'supported',serviceAreaResult:'supported'});
    const reply=await h.post(data);expect(reply.status).toBe(200);expect(await reply.json()).toMatchObject({ok:true,receipt:'saved',disposition:'sheet-only',submissionId:data.submissionId});
    const row=h.rowOf(tabFor[source]);expect(row).toMatchObject({'Property State':data.propertyState,State:data.propertyState,'Licensed?':'No','Service Area Result':'out-of-market','Inquiry Message':data.message,Status:'Sheet only: outside service area','Click ID':'local-test-click'});
    expect(h.tabs.has('Follow-ups')).toBe(false);expect(h.tabs.has('CallRail Sync')).toBe(false);expect(h.providers).toEqual([]);
    const replay=await h.post(data);expect(await replay.json()).toMatchObject({replayed:true,disposition:'sheet-only'});expect(h.tabs.get(tabFor[source])!.rows).toHaveLength(2);
    // Even a damaged queue must recompute eligibility after source classification.
    h.queue({...data,...JSON.parse(String(row['Submission Snapshot']))});h.gas.processFollowUps();
    expect(h.providers.filter(url=>!url.endsWith('/stop-email'))).toEqual([]);expect(h.messages).toEqual([]);
  });
  it.each(pairs)('%s preserves normal supported capture, queueing and attribution',async(formId,source)=>{
    const h=setup();const data=inquiry(formId,source,{propertyState:'CA',captureDisposition:'sheet-only',disposition:'sheet-only',message:'Supported inquiry'});
    const reply=await h.post(data);expect(reply.status).toBe(200);expect(await reply.json()).not.toHaveProperty('disposition');
    expect(h.rowOf(tabFor[source])).toMatchObject({'Property State':'CA','Service Area Result':'supported','Inquiry Message':'Supported inquiry','Click ID':'local-test-click'});
    expect(h.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it.each(pairs)('%s refuses malformed, mismatched, unconsented or incomplete captures before writing',async(formId,source)=>{
    const h=setup();for(const patch of [{source:'forged'},{privacyAcknowledged:false},{privacyVersion:''},{propertyState:'ZZ'},{propertyUse:''},{firstName:''},{phone:''},{email:''},{submissionId:''},{message:{}},{message:'x'.repeat(2001)}]){
      expect((await h.post(inquiry(formId,source,patch))).status,JSON.stringify(patch).slice(0,120)).toBe(422);
    }
    expect(h.forwarded).toEqual([]);expect(h.tabs.size).toBe(0);expect(h.messages).toEqual([]);
  });
  it.each(pairs)('%s writer independently refuses invalid captures from a stale proxy', (formId,source)=>{
    const h=setup();
    for(const patch of [{source:'forged'},{privacyAcknowledged:false},{privacyVersion:[]},{propertyState:'ZZ'},{propertyUse:''},{firstName:{}},{phone:''},{email:''},{submissionId:[]},{message:{}},{message:'x'.repeat(2001)}]){
      const result=JSON.parse(h.gas.doPost({postData:{contents:JSON.stringify({...inquiry(formId,source,patch),_proxyKey:key})}}).__body);
      expect(result).toMatchObject({success:false,code:'invalid_booking_inquiry'});
    }
    expect(h.tabs.size).toBe(0);expect(h.providers).toEqual([]);expect(h.messages).toEqual([]);
  });
  it.each([['dscr-magnet','dscr','primary'],['fha-magnet','fha','investment']])('%s refuses an incompatible property use rather than retaining it as unsupported',async(formId,source,propertyUse)=>{
    const h=setup();expect((await h.post(inquiry(formId,source,{propertyUse}))).status).toBe(422);expect(h.tabs.size).toBe(0);
  });
});
