import { getStore } from '@netlify/blobs';
import { createHash, randomUUID } from 'node:crypto';

// Netlify also discovers top-level shared modules as functions. The inbox is
// private; direct HTTP invocation must never become a read/maintenance route.
export default function privateInboxModule() { return new Response(null,{status:404}); }

// Max, 29 Oct: an acknowledged durable website inbox may open the calendar;
// Google Sheets and its existing CRM/email queue synchronize afterward.
// No public read endpoint exists. Keys are opaque and never contain contact data.
export const CAPTURE_PROTOCOL = 'stable-id-v1';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const inbox = (signal: AbortSignal) => getStore('lead-inbox', {consistency:'strong',
  fetch:(url,init)=>fetch(url,{...init,signal})});
type Payload = Record<string, unknown>;
type RecordState = {
  version:1; id:string; fingerprint:string; createdAt:number; sheetOnly:boolean;
  payload?:Payload; status:'pending'|'processing'|'retry'|'synced'|'review';
  attempts:number; nextAt?:number; leaseUntil?:number; token?:string;
  lastCode?:string; syncedAt?:number; alertedAt?:number;
};

// Cookies/transport credentials can change between retries. Answers, consent,
// attribution and client timestamps cannot. Match the Apps Script comparison.
function fingerprint(payload:Payload):string {
  const ordered = (value:unknown):unknown => {
    if(Array.isArray(value)) return value.map(ordered);
    if(!value || typeof value!=='object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Payload)[key])]));
  };
  return digest(JSON.stringify(ordered(Object.fromEntries(Object.entries(payload)
    .filter(([key])=>key!=='submissionId' && key!=='hutk' && !key.startsWith('_'))))));
}

/** Pointer FIRST, immutable identity SECOND, then strong readback. If a process
 * dies between writes, it cannot acknowledge success; a committed record always
 * has a recoverable pointer. A replay repairs the pointer without replacing the
 * first body. Workers never delete pointers for a missing/not-yet-written record.
 * Conditional writes are atomic, unlike a read-then-write duplicate check. */
export async function admitLead(payload:Payload, sheetOnly:boolean, signal:AbortSignal) {
  const store=inbox(signal), id=String(payload.submissionId), key=digest(id);
  const frozen=structuredClone(payload);
  Object.keys(frozen).forEach(name=>{if(name.startsWith('_')) delete frozen[name];});
  const record:RecordState={version:1,id,fingerprint:fingerprint(frozen),createdAt:Date.now(),sheetOnly,
    payload:frozen,status:'pending',attempts:0};
  await store.setJSON(`pending/${key}`,{createdAt:record.createdAt},{onlyIfNew:true});
  const written=await store.setJSON(`records/${key}`,record,{onlyIfNew:true});
  const original=await store.get(`records/${key}`,{type:'json'}) as RecordState|null;
  if(!original || original.version!==1 || original.id!==id) throw Error('Inbox readback unavailable');
  if(original.fingerprint!==record.fingerprint || original.sheetOnly!==sheetOnly) return {conflict:true as const};
  if(original.status!=='synced' && (!original.payload || original.payload.submissionId!==id || fingerprint(original.payload)!==original.fingerprint)) {
    throw Error('Inbox body readback unavailable');
  }
  return {conflict:false as const,replayed:!written.modified,submissionId:id};
}

// A single bounded scheduled run drains serially to avoid contending on the
// Sheet lock. Its 22s budget leaves headroom under Netlify's 30s schedule limit.
// Per-record CAS leases protect overlapping workers and survive process death.
const WORK_MS=22_000, LEASE_MS=60_000;
const backoff=(attempt:number)=>[60_000,5*60_000,20*60_000,60*60_000][Math.min(attempt-1,3)];

async function deliverAlert(reference:string, subject:string, text:string, signal:AbortSignal):Promise<boolean> {
  const key=Netlify.env.get('RESEND_API_KEY');
  if(!key) return false;
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal,
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',
        'Idempotency-Key':`lead-inbox-alert/${digest(reference)}`},
      body:JSON.stringify({from:'Darren Tsai <darren@realdarrentsai.com>',to:['liannemaxbalbastro@gmail.com'],
        subject,text})});
    const body=await response.json();
    return response.ok && typeof body?.id==='string';
  } catch {return false;}
}

async function notifyDelay(record:Pick<RecordState,'id'>, signal:AbortSignal):Promise<boolean> {
  return deliverAlert(record.id,'Website inquiry saved; Sheet synchronization needs attention',
        'This inquiry is safely saved in the private website inbox. Synchronization to the Sheet needs attention. '+
          'This notice does not establish a lost inquiry or a failed borrower email.\n\n'+
          `Record reference: ${record.id}\n\n`+
          'Check the lead-inbox record and lead-inbox-sync logs in Netlify. Do not re-enter the lead or create a new request ID. '+
          'The worker retains the original payload and retries eligible synchronization failures with the same identity. '+
          'Records marked review require operator reconciliation. CRM and email processing follow the confirmed Sheet write.',signal);
}

export async function notifyInboxWorkerFailure() {
  // Resend's fixed hourly idempotency key also bounds alerts when Blobs itself
  // is unavailable and cannot be used as a notification throttle.
  return deliverAlert(`worker-${Math.floor(Date.now()/3_600_000)}`,'Website inbox synchronization interrupted',
    'The scheduled website inbox worker did not complete. This notice does not identify a lost inquiry or a failed borrower email. '+
    'Previously confirmed inbox records remain the recovery source. Check the lead-inbox-sync logs and private lead-inbox records in Netlify. '+
    'The next scheduled run is expected to retry; verify recovery before re-entering anything. This notice is limited to one delivery per hour.',AbortSignal.timeout(3000));
}

/** Preflight capability is deliberately checked on the published writer before
 * replaying unknown transport outcomes. An older writer without stable-ID
 * deduplication must not receive an automatic replay after a rollback. */
export async function synchronizeLeads() {
  const started=Date.now(), signal=AbortSignal.timeout(WORK_MS), store=inbox(signal);
  const url=Netlify.env.get('APPS_SCRIPT_WEBHOOK_URL') || Netlify.env.get('APP_SCRIPT_WEBHOOK_URL');
  const primary=Netlify.env.get('LEAD_PROXY_KEY') || '', fallback=Netlify.env.get('CONTACT_CONFIRM_API_KEY') || '';
  const key=primary.trim()?primary:fallback.trim()?fallback:'';
  if(!url || !key) throw Error('Inbox synchronization is not configured');
  const remaining=()=>WORK_MS-(Date.now()-started);
  let protocol:boolean|undefined;
  let synced=0, retried=0, review=0, scanned=0;
  for await (const page of store.list({prefix:'pending/',paginate:true})) {
    for(const pointer of page.blobs) {
      if(remaining()<4000 || scanned++>=100) return {synced,retried,review};
      const hash=pointer.key.slice('pending/'.length);
      if(!/^[a-f0-9]{64}$/.test(hash)) continue;
      const recordKey=`records/${hash}`;
      const found=await store.getWithMetadata(recordKey,{type:'json'});
      if(!found?.etag || !found.data) continue; // an interrupted admission can still finish
      const record=found.data as RecordState;
      if(record.version!==1 || typeof record.id!=='string' || digest(record.id)!==hash) {
        // Preserve an unreadable/future record and continue draining other leads.
        // Do not invent a replacement identity or let one bad blob poison a run.
        console.warn('Lead inbox identity needs operator review');
        await store.setJSON(`review/${hash}`,{code:'identity_damaged'},{onlyIfNew:true});
        await notifyDelay({id:`blob-${hash}`},AbortSignal.any([signal,AbortSignal.timeout(3000)]));
        continue;
      }
      if(record.status==='synced') {await store.delete(pointer.key);continue;}
      if(record.status==='review') {
        // Review records stay durable and visible without starving pending work.
        await store.setJSON(`review/${hash}`,{createdAt:record.createdAt},{onlyIfNew:true});
        let notified=Boolean(record.alertedAt);
        if(!notified && await notifyDelay(record,AbortSignal.any([signal,AbortSignal.timeout(3000)]))) {
          const marked=await store.setJSON(recordKey,{...record,alertedAt:Date.now()},{onlyIfMatch:found.etag});
          notified=marked.modified;
        }
        if(notified) await store.delete(pointer.key);
        continue;
      }
      if((record.nextAt || 0)>Date.now() || (record.status==='processing' && (record.leaseUntil || 0)>Date.now())) continue;
      const validPayload=record.payload && record.payload.submissionId===record.id && fingerprint(record.payload)===record.fingerprint;
      // Verify once per run, only when there is due work. No HTTP on idle runs.
      if(validPayload && protocol===undefined) {
        try {
          const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]),redirect:'follow'});
          const body=await response.json();protocol=response.ok && body?.captureProtocol===CAPTURE_PROTOCOL;
        } catch {protocol=false;}
      }
      if(remaining()<4000) return {synced,retried,review};
      const claimed:RecordState={...record,status:'processing',attempts:record.attempts+1,token:randomUUID(),leaseUntil:Date.now()+LEASE_MS};
      const claim=await store.setJSON(recordKey,claimed,{onlyIfMatch:found.etag});
      if(!claim.modified || !claim.etag) continue;
      let code=validPayload?'writer_protocol_unavailable':'inbox_payload_damaged', status:RecordState['status']=validPayload?'retry':'review';
      if(validPayload && protocol) {
        try {
          const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',
            body:JSON.stringify({...record.payload,_proxyKey:key,_inboxDelivery:true}),signal:AbortSignal.any([signal,AbortSignal.timeout(Math.min(8000,remaining()-1500))])});
          const body=await response.json();
          if(response.ok && body?.success===true && body.submissionId===record.id && body.receipt==='saved' &&
            (record.sheetOnly ? body.disposition==='sheet-only' : body.disposition!=='sheet-only')) {
            status='synced';code='saved';
          } else if(response.ok && ['submission_conflict','invalid_submission_id','invalid_booking_inquiry'].includes(body?.code)) {
            status='review';code=String(body.code);
          } else if(body?.success===true) {status='review';code='receipt_mismatch';}
          else code=body?.code==='capture_busy'?'capture_busy':'upstream_unconfirmed';
        } catch {code='upstream_unconfirmed';}
      }
      // No payload is removed before the writer confirms BOTH capture and its
      // required Follow-ups enqueue. Keep marked TEST payloads for Max's audit;
      // other synchronized transport copies become PII-free receipt tombstones.
      const keepTest=/^TEST(?:\s|$)/i.test(String(record.payload?.firstName || ''));
      const next:RecordState={...claimed,status,lastCode:code,token:undefined,leaseUntil:undefined,
        nextAt:status==='retry'?Date.now()+backoff(claimed.attempts):undefined,
        ...(status==='synced'?{syncedAt:Date.now(),payload:keepTest?record.payload:undefined}:{})};
      if(status==='review' || (status==='retry' && Date.now()-record.createdAt>=5*60_000)) {
        if(!record.alertedAt && await notifyDelay(record,AbortSignal.any([signal,AbortSignal.timeout(3000)]))) next.alertedAt=Date.now();
        console.warn('Lead inbox synchronization needs attention',code); // no payload/PII
      }
      const checkpoint=await store.setJSON(recordKey,next,{onlyIfMatch:claim.etag});
      if(!checkpoint.modified) continue; // a stale worker cannot overwrite a newer owner
      if(status==='synced') {synced++;await store.delete(pointer.key);}
      else if(status==='review') {
        review++;await store.setJSON(`review/${hash}`,{createdAt:record.createdAt},{onlyIfNew:true});
        if(next.alertedAt) await store.delete(pointer.key);
      } else retried++;
    }
  }
  return {synced,retried,review};
}
