import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadGas } from './helpers/gas-harness';

const state = vi.hoisted(() => ({ records: new Map<string, {value: unknown; etag: string}>(), version:0, down:false, fault:'' }));
vi.mock('@netlify/blobs', () => ({ getStore: (name: string) => ({
  get: async (key: string) => { if(state.down || state.fault==='readback') throw Error('unavailable'); return structuredClone(state.records.get(name+'/'+key)?.value ?? null); },
  getWithMetadata: async (key: string) => { if(state.down) throw Error('unavailable'); const r=state.records.get(name+'/'+key); return r ? {data:structuredClone(r.value),etag:r.etag,metadata:{}} : null; },
  setJSON: async (key: string, value: unknown, options: {onlyIfNew?:boolean;onlyIfMatch?:string} = {}) => {
    if(state.down) throw Error('unavailable');
    if(state.fault==='pointer' && key.startsWith('pending/')) throw Error('pointer write failed');
    if(state.fault==='record' && key.startsWith('records/')) throw Error('record write failed');
    const old=state.records.get(name+'/'+key);
    if ((options.onlyIfNew && old) || (options.onlyIfMatch && old?.etag!==options.onlyIfMatch)) return {modified:false};
    const etag=String(++state.version);state.records.set(name+'/'+key,{value:structuredClone(value),etag});
    if(state.fault==='commit-then-disconnect' && key.startsWith('records/')) throw Error('response lost after commit');
    return {modified:true,etag};
  },
  delete: async (key: string) => {state.records.delete(name+'/'+key);},
  list: ({prefix}: {prefix:string}) => ({async *[Symbol.asyncIterator]() {if(state.down)throw Error('unavailable');yield {blobs:[...state.records.keys()].filter(k=>k.startsWith(name+'/'+prefix)).map(k=>({key:k.slice(name.length+1)}))};}}),
}) }));

import handler from '../netlify/functions/lead.mts';
import privateInboxModule, { synchronizeLeads } from '../netlify/functions/lead-inbox.mts';
import syncHandler from '../netlify/functions/lead-inbox-sync.mts';

const lead = (id: string) => ({submissionId:'inbox1-'+id,formId:'booking-prequal',source:'home-contact',bookingGoal:'equity',
  firstName:'TEST Inbox',lastName:'Admission',email:'qa@gmail.com',phone:'7145550101',propertyState:'CA',propertyUse:'primary',
  propertyType:'single-family-condo',mortgageCurrent:'yes',recentBankruptcyForeclosure:'no',privacyAcknowledged:true,
  privacyVersion:'2026-10-13-v1',timestamp:'2026-10-29T04:00:00Z',smsConsent:false,smsInformationalConsent:false,smsMarketingConsent:false,
  message:'Synthetic test; retain.',utm_source:'verification'});
const request = (body: unknown) => new Request('https://realdarrentsai.com/api/lead',{method:'POST',headers:{origin:'https://realdarrentsai.com','content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(() => {
  state.records.clear();state.version=0;state.down=false;state.fault='';
  vi.stubGlobal('Netlify',{env:{get:(key:string)=>({APPS_SCRIPT_WEBHOOK_URL:'https://script.google.com/macros/s/TEST/exec',LEAD_PROXY_KEY:'private-test-key'})[key]}});
  vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('Sheet unavailable');}));
  vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
type InboxRecord={id:string;payload?:Record<string,unknown>;status:string;attempts:number;fingerprint:string;nextAt?:number;leaseUntil?:number;token?:string;alertedAt?:number;createdAt:number;lastCode?:string};
const recordKey=(id:string)=>'lead-inbox/records/'+createHash('sha256').update('inbox1-'+id).digest('hex');
const record=(id:string)=>state.records.get(recordKey(id))!.value as InboxRecord;
const pointers=()=>[...state.records.keys()].filter(k=>k.startsWith('lead-inbox/pending/'));
function writer() {
  const h=loadGas<{doPost:(e:{postData:{contents:string}})=>{__body:string};doGet:()=>{__body:string}}>({exports:['doPost','doGet'],props:{LEAD_PROXY_KEY:'private-test-key'}});
  const fetcher=vi.fn(async (url:string,init:RequestInit={})=>new Response(url.includes('resend.com') ? '{"id":"alert-one"}' :
    init.method==='POST'?h.gas.doPost({postData:{contents:String(init.body)}}).__body:h.gas.doGet().__body));
  vi.stubGlobal('fetch',fetcher);
  return {...h,fetcher};
}

describe('durable admission before Sheet synchronization',()=>{
  it('exposes no HTTP inbox read or maintenance endpoint',async()=>{
    const response=privateInboxModule();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(state.records.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('confirms fifteen concurrent validated inquiries without waiting on Apps Script',async()=>{
    const responses=await Promise.all(Array.from({length:15},(_,i)=>handler(request(lead('inbox-'+i)),{ip:'203.0.113.'+(i+1)} as never)));
    expect(responses.map(r=>r.status)).toEqual(Array(15).fill(200));
    for(let i=0;i<15;i++) expect(await responses[i].json()).toMatchObject({ok:true,receipt:'saved',storage:'inbox',submissionId:'inbox1-inbox-'+i});
    expect(fetch).not.toHaveBeenCalled();
    expect([...state.records.keys()].filter(k=>k.startsWith('lead-inbox/records/'))).toHaveLength(15);
    expect([...state.records.keys()].filter(k=>k.startsWith('lead-inbox/pending/'))).toHaveLength(15);
  });
  it('reserves one body atomically for overlapping replays and refuses changed answers',async()=>{
    const same=await Promise.all(Array.from({length:15},()=>handler(request(lead('overlap-id')),{} as never)));
    expect(same.every(r=>r.status===200)).toBe(true);
    expect((await Promise.all(same.map(r=>r.json()))).filter(r=>!r.replayed)).toHaveLength(1);
    expect((await handler(request({...lead('overlap-id'),message:'different'}),{} as never)).status).toBe(409);
    expect(record('overlap-id').payload?.message).toBe('Synthetic test; retain.');
    expect(pointers()).toHaveLength(1);
  });
  it('keeps a historical ID on its existing writer conflict/replay path',async()=>{
    const f=vi.fn(async()=>new Response('{"success":false,"code":"submission_conflict"}'));vi.stubGlobal('fetch',f);
    const result=await handler(request({...lead('old'),submissionId:'historical-id'}),{} as never);
    expect(result.status).toBe(409);expect(pointers()).toHaveLength(0);expect(f).toHaveBeenCalledTimes(1);
  });
  it('will not replay a success receipt for an unsynchronized damaged body',async()=>{
    await handler(request(lead('body-readback')),{} as never);
    record('body-readback').payload!.message='damaged';
    const result=await handler(request(lead('body-readback')),{} as never);
    expect(result.status).toBe(502);expect(await result.json()).toMatchObject({receipt:'uncertain'});
  });
  it('screening still owns the lane and refuses missing acknowledgement before storage',async()=>{
    expect((await handler(request({...lead('invalid'),privacyAcknowledged:false}),{} as never)).status).toBe(422);
    expect(pointers()).toHaveLength(0);
    const outside=await handler(request({...lead('outside'),propertyState:'CO',disposition:'qualified',captureDisposition:'qualified'}),{} as never);
    expect(await outside.json()).toMatchObject({receipt:'saved',disposition:'sheet-only'});
    expect(record('outside').payload).toMatchObject({serviceAreaResult:'out-of-market',captureDisposition:'sheet-only',propertyState:'CO'});
    const rental=await handler(request({...lead('rental'),bookingGoal:'dscr',propertyUse:'investment',propertyState:'CO'}),{} as never);
    expect(await rental.json()).not.toHaveProperty('disposition');
    expect(record('rental').payload).toMatchObject({serviceAreaResult:'supported',source:'dscr'});
  });
  it.each(['pointer','record','readback','commit-then-disconnect'])('never acknowledges an unconfirmed %s write; the original ID can recover',async fault=>{
    state.fault=fault;
    const result=await handler(request(lead('interrupted')),{} as never);
    expect(result.status).toBe(502);expect(await result.json()).toMatchObject({receipt:'uncertain',submissionId:'inbox1-interrupted'});
    if(fault==='pointer') expect(state.records.size).toBe(0);
    if(fault==='record') expect(pointers()).toHaveLength(1);
    state.fault='';
    expect((await handler(request(lead('interrupted')),{} as never)).status).toBe(200);
    const w=writer();await synchronizeLeads();
    expect(record('interrupted').status).toBe('synced');
    expect(w.tabs.get('Home Equity')!.rows).toHaveLength(2);
    expect(w.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it('retains attribution/message/consent, strips private input, and sends authentication only on the worker hop',async()=>{
    await handler(request({...lead('fields'),_proxyKey:'injected',_delivery:{jobs:{guide:{state:'sent'}}},utm_campaign:'inbox-qa',clickId:'fixture-local-only',clickIdType:'gclid'}),{} as never);
    expect(record('fields').payload).not.toHaveProperty('_proxyKey');expect(record('fields').payload).not.toHaveProperty('_delivery');
    const w=writer();await synchronizeLeads();
    expect(w.rowOf('Home Equity')).toMatchObject({'Inquiry Message':'Synthetic test; retain.','UTM Campaign':'inbox-qa','Click ID':'fixture-local-only','Privacy Acknowledged':'Yes','SMS Marketing Consent':'No'});
    expect(JSON.parse(String(w.fetcher.mock.calls.find(([,init])=>init?.method==='POST')![1].body))).toMatchObject({_proxyKey:'private-test-key',submissionId:'inbox1-fields'});
  });
  it('retains the public per-address ten-request limit during fifteen simultaneous posts',async()=>{
    const results=await Promise.all(Array.from({length:15},(_,i)=>handler(request(lead('limited-'+i)),{ip:'203.0.113.15'} as never)));
    expect(results.filter(r=>r.status===200)).toHaveLength(10);expect(results.filter(r=>r.status===429)).toHaveLength(5);
    expect(pointers()).toHaveLength(10);expect(fetch).not.toHaveBeenCalled();
  });
});

describe('durable synchronization and recovery',()=>{
  it('advertises capable replay and refuses a direct legacy write into the reserved namespace',()=>{
    const w=writer();expect(JSON.parse(w.gas.doGet().__body)).toMatchObject({status:'ok',captureProtocol:'stable-id-v1'});
    expect(JSON.parse(w.gas.doPost({postData:{contents:JSON.stringify({...lead('reserved'),_proxyKey:'private-test-key'})}}).__body)).toMatchObject({success:false,code:'inbox_delivery_required'});
    expect(w.tabs.size).toBe(0);
  });
  it('drains fifteen accepted inquiries once into the real writer and existing queue',async()=>{
    await Promise.all(Array.from({length:15},(_,i)=>handler(request(lead('drain-'+i)),{} as never)));
    const w=writer();expect(await synchronizeLeads()).toMatchObject({synced:15});
    expect(w.tabs.get('Home Equity')!.rows).toHaveLength(16);expect(w.tabs.get('Follow-ups')!.rows).toHaveLength(16);expect(pointers()).toHaveLength(0);
    await synchronizeLeads();expect(w.tabs.get('Home Equity')!.rows).toHaveLength(16);
  });
  it('outside primary stays Sheet-only while CO investment retains DSCR coverage',async()=>{
    await handler(request({...lead('co-home'),propertyState:'CO'}),{} as never);
    await handler(request({...lead('co-rental'),propertyState:'CO',propertyUse:'investment',bookingGoal:'dscr'}),{} as never);
    const w=writer();await synchronizeLeads();
    expect(w.rowOf('Home Equity')).toMatchObject({'Licensed?':'No','Status':'Sheet only: outside service area'});
    expect(w.rowOf('DSCR')).toMatchObject({'Licensed?':'No','Service Area Result':'supported'});
    expect(w.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it('overlapping workers claim one provider attempt and cannot double-enqueue',async()=>{
    await handler(request(lead('workers')),{} as never);const w=writer();
    await Promise.all([synchronizeLeads(),synchronizeLeads()]);
    expect(w.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(w.tabs.get('Home Equity')!.rows).toHaveLength(2);
  });
  it('replays an unknown transport outcome with the exact stored body only against a capable writer',async()=>{
    vi.useFakeTimers();await handler(request(lead('unknown')),{} as never);const w=writer();
    const original=w.fetcher.getMockImplementation()!;let first=true;
    w.fetcher.mockImplementation(async(url,init={})=>{
      const result=await original(url,init);
      if(init.method==='POST' && first){first=false;throw Error('lost confirmation after Sheet save');}return result;
    });
    await synchronizeLeads();expect(record('unknown').status).toBe('retry');
    vi.setSystemTime(Date.now()+61_000);await synchronizeLeads();expect(record('unknown').status).toBe('synced');
    const sent=w.fetcher.mock.calls.filter(([,init])=>init?.method==='POST');expect(sent[0][1].body).toBe(sent[1][1].body);
    expect(w.tabs.get('Home Equity')!.rows).toHaveLength(2);expect(w.tabs.get('Follow-ups')!.rows).toHaveLength(2);
  });
  it('holds an older writer without sending or blindly replaying an inquiry',async()=>{
    await handler(request(lead('old-writer')),{} as never);
    const f=vi.fn(async()=>new Response('{"status":"ok"}'));vi.stubGlobal('fetch',f);
    await synchronizeLeads();expect(f).toHaveBeenCalledTimes(1);expect(record('old-writer').status).toBe('retry');expect(pointers()).toHaveLength(1);
  });
  it('recovers a worker that died after claiming, and refuses an unexpired lease',async()=>{
    vi.useFakeTimers();await handler(request(lead('crash')),{} as never);
    Object.assign(record('crash'),{status:'processing',token:'dead-worker',leaseUntil:Date.now()+60_000});
    const w=writer();await synchronizeLeads();expect(w.fetcher).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now()+61_000);await synchronizeLeads();expect(record('crash').status).toBe('synced');
  });
  it('a stale worker cannot overwrite a replacement lease or delete its pending pointer',async()=>{
    await handler(request(lead('stale')),{} as never);const w=writer();const original=w.fetcher.getMockImplementation()!;
    w.fetcher.mockImplementation(async(url,init={})=>{const result=await original(url,init);if(init.method==='POST'){
      const old=state.records.get(recordKey('stale'))!;state.records.set(recordKey('stale'),{value:{...old.value as object,token:'replacement'},etag:'replacement-etag'});
    }return result;});
    await synchronizeLeads();expect(record('stale').token).toBe('replacement');expect(pointers()).toHaveLength(1);
  });
  it('removes synchronized ordinary contact bodies but retains the receipt and marked TEST payloads',async()=>{
    await handler(request({...lead('ordinary'),firstName:'Jane'}),{} as never);await handler(request(lead('retained-test')),{} as never);
    const w=writer();await synchronizeLeads();expect(record('ordinary').payload).toBeUndefined();expect(record('retained-test').payload).toBeDefined();
    const result=await handler(request({...lead('ordinary'),firstName:'Jane'}),{} as never);expect(await result.json()).toMatchObject({replayed:true});
    expect((await handler(request({...lead('ordinary'),firstName:'Jane',message:'changed'}),{} as never)).status).toBe(409);
    await synchronizeLeads();expect(pointers()).toHaveLength(0);expect(w.tabs.get('Home Equity')!.rows).toHaveLength(3);
  });
  it('quarantines damaged payloads and receipt mismatches without blocking valid later leads',async()=>{
    await handler(request(lead('damaged')),{} as never);record('damaged').payload!.message='tampered';
    await handler(request(lead('valid')),{} as never);const w=writer();await synchronizeLeads();
    expect(record('damaged').status).toBe('review');expect(record('valid').status).toBe('synced');expect(w.tabs.get('Home Equity')!.rows).toHaveLength(2);
    await handler(request(lead('mismatch')),{} as never);
    vi.stubGlobal('fetch',vi.fn(async(_url,init={})=>new Response(init.method==='POST'?'{"success":true,"submissionId":"other","receipt":"saved"}':'{"captureProtocol":"stable-id-v1"}')));
    await synchronizeLeads();expect(record('mismatch')).toMatchObject({status:'review',lastCode:'receipt_mismatch'});
  });
  it('stops before the scheduled budget and leaves untouched leads pending',async()=>{
    vi.useFakeTimers();await handler(request(lead('budget-a')),{} as never);await handler(request(lead('budget-b')),{} as never);
    const w=writer(),original=w.fetcher.getMockImplementation()!;
    w.fetcher.mockImplementation(async(url,init={})=>{const result=await original(url,init);if(init.method==='POST')vi.setSystemTime(Date.now()+19_000);return result;});
    expect(await synchronizeLeads()).toMatchObject({synced:1});expect(pointers()).toHaveLength(1);
  });
  it('alerts only Max to a delayed saved inquiry, and does not repeat a confirmed alert',async()=>{
    vi.useFakeTimers();await handler(request(lead('delayed')),{} as never);record('delayed').createdAt=Date.now()-6*60_000;
    vi.stubGlobal('Netlify',{env:{get:(key:string)=>({APPS_SCRIPT_WEBHOOK_URL:'https://example.com/writer',LEAD_PROXY_KEY:'private-test-key',RESEND_API_KEY:'test-resend'})[key]}});
    const f=vi.fn(async(url:string,init:RequestInit={})=>new Response(url.includes('resend')?'{"id":"sent-alert"}':init.method==='POST'?'{"success":false,"code":"capture_busy"}':'{"captureProtocol":"stable-id-v1"}'));
    vi.stubGlobal('fetch',f);await synchronizeLeads();expect(record('delayed').alertedAt).toBeTruthy();
    vi.setSystemTime(Date.now()+61_000);await synchronizeLeads();
    const alerts=f.mock.calls.filter(([url])=>url.includes('resend'));expect(alerts).toHaveLength(1);
    const body=JSON.parse(String(alerts[0][1].body));expect(body.to).toEqual(['liannemaxbalbastro@gmail.com']);
    expect(body.text).toContain('safely saved');expect(body.text).not.toContain('RAW PAYLOAD');
    expect(record('delayed').payload).toBeDefined();
  });
  it('reports a worker/storage interruption without claiming an individual lost lead',async()=>{
    state.down=true;
    vi.stubGlobal('Netlify',{env:{get:(key:string)=>({APPS_SCRIPT_WEBHOOK_URL:'https://example.com/writer',LEAD_PROXY_KEY:'private-test-key',RESEND_API_KEY:'test-resend'})[key]}});
    const f=vi.fn(async()=>new Response('{"id":"ops-alert"}'));vi.stubGlobal('fetch',f);
    expect((await syncHandler()).status).toBe(503);
    const body=JSON.parse(String(f.mock.calls[0][1].body));expect(body.to).toEqual(['liannemaxbalbastro@gmail.com']);
    expect(body.text).toContain('does not identify a lost inquiry');expect(body.text).not.toContain('RAW PAYLOAD');
  });
});
