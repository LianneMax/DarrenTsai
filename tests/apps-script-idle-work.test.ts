import {describe,expect,it,vi} from 'vitest';
import {loadGas,type MailMessage} from './helpers/gas-harness';
type Range={getValues:()=>unknown[][];setValues:(values:unknown[][])=>unknown};
type Sheet={getRange:(...args:number[])=>Range;getLastRow:()=>number};
type Spreadsheet={getSheetByName:(name:string)=>Sheet|null};
type Runtime={processFollowUps:()=>void;sendGuideDigest:()=>void;SpreadsheetApp:{openById:()=>Spreadsheet;flush:()=>void};LockService:{getScriptLock:()=>{waitLock:(ms:number)=>void;releaseLock:()=>void}}};
function load(pending:string[]=[]){
 const calls:Array<{url:string;body:Record<string,unknown>}>=[];const mail:MailMessage[]=[];
 const h=loadGas<Runtime>({exports:['processFollowUps','sendGuideDigest','SpreadsheetApp','LockService'],props:{
  NETLIFY_CONTACT_CONFIRM_URL:'https://realdarrentsai.com/api/send-contact-confirmation',NETLIFY_CONTACT_CONFIRM_KEY:'private-test',
  NETLIFY_DSCR_PDF_URL:'https://realdarrentsai.com/api/send-dscr-guide',NETLIFY_DSCR_PDF_KEY:'private-guide',
 },onMail:message=>mail.push(message),fetch:(url,options)=>{const body=JSON.parse(String(options.payload));calls.push({url,body});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('/stop-email')?{emails:body.operation==='pending'?pending:[]}:{deliveryProtocol:'resend-key-v1',submissionId:body.submissionId})};}});
 const ops={locks:0,flushes:0,captureLookups:0,queueReads:[] as number[][]};
 const ss=h.gas.SpreadsheetApp.openById();let afterCandidateSnapshot:(()=>void)|undefined;
 h.gas.SpreadsheetApp.openById=()=>({...ss,getSheetByName(name:string){if(!['Follow-ups','Debug'].includes(name))ops.captureLookups++;const sheet=ss.getSheetByName(name);if(!sheet)return null;return {...sheet,getRange(...args:number[]){const range=sheet.getRange(...args);return {...range,getValues(){if(name==='Follow-ups')ops.queueReads.push(args);const values=range.getValues();if(name==='Follow-ups'&&args[0]===2&&args[1]===2&&args[3]===2&&afterCandidateSnapshot){const callback=afterCandidateSnapshot;afterCandidateSnapshot=undefined;callback();}return values;}};}};}});
 h.gas.LockService.getScriptLock=()=>({waitLock:()=>{ops.locks++;},releaseLock:()=>undefined});
 h.gas.SpreadsheetApp.flush=()=>{ops.flushes++;};
 return {...h,calls,mail,ops,afterSnapshot:(fn:()=>void)=>{afterCandidateSnapshot=fn;}};
}
const lead=(id='idle-test')=>({submissionId:id,source:'dscr',email:'fixture@example.com',firstName:'Fixture',lastName:'Only',phone:'7145550123'});
describe('minute worker avoids idle Sheet work without removing delivery guards',()=>{
 it('reads terminal queue eligibility once, without locking each row or visiting capture headers',()=>{
  const h=load();for(const name of ['Home Equity','ADU','DSCR'])h.tabs.set(name,{name,rows:[['Email','Unsubscribe?']]});
  for(let i=0;i<50;i++)h.queue(lead('done-'+i),'done',new Date().toISOString());
  const original=structuredClone(h.tabs.get('Follow-ups')!.rows);
  h.gas.processFollowUps();
  expect(h.ops).toEqual({locks:2,flushes:0,captureLookups:0,queueReads:[[2,2,50,2]]});
  expect(h.tabs.get('Follow-ups')!.rows).toEqual(original);
  expect(h.calls.map(c=>c.body.operation)).toEqual(['pending']);expect(h.mail).toEqual([]);
 });
 it('repairs missing opt-out headers and marks the address before acknowledging the pending outbox',()=>{
  const address='fixture@example.com';const h=load([address]);h.tabs.set('Home Equity',{name:'Home Equity',rows:[['Email','Name'],[address,'Fixture']]});
  h.gas.processFollowUps();
  expect(h.tabs.get('Home Equity')!.rows).toEqual([['Email','Name','Unsubscribe?'],[address,'Fixture',true]]);
  expect(h.calls.map(c=>c.body)).toEqual([{operation:'pending'},{operation:'acknowledge',email:address}]);expect(h.mail).toEqual([]);
 });
 it('does not treat the batched snapshot as authority when another action made the candidate terminal',()=>{
  const h=load();h.queue(lead());h.afterSnapshot(()=>{h.tabs.get('Follow-ups')!.rows[1][1]='done';});
  h.gas.processFollowUps();expect(h.statusOf().status).toBe('done');expect(h.calls.every(c=>c.url.endsWith('/stop-email'))).toBe(true);
  expect(h.ops.queueReads).toEqual([[2,2,1,2],[2,1,1,7]]);expect(h.ops.locks).toBe(3);
 });
 it('leaves a not-yet-due retry intact and delivers it on the next pass after backoff expires',()=>{
  const h=load();const now=Date.now();h.queue(lead(),'guide-retry:1',new Date(now).toISOString());
  const clock=vi.spyOn(Date,'now').mockReturnValue(now);try{
   h.gas.processFollowUps();expect(h.statusOf().status).toBe('guide-retry:1');expect(h.calls.filter(c=>c.url.includes('send-dscr-guide'))).toHaveLength(0);
   clock.mockReturnValue(now+61_000);h.gas.processFollowUps();expect(h.statusOf().status).toBe('done');expect(h.calls.filter(c=>c.url.includes('send-dscr-guide'))).toHaveLength(1);
  }finally{clock.mockRestore();}
 });
 it('retains malformed payload evidence as an error reported by the daily digest',()=>{
  const h=load();h.queue(lead());h.tabs.get('Follow-ups')!.rows[1][6]='{broken';
  h.gas.processFollowUps();expect(h.statusOf().status).toBe('error');expect(h.tabs.get('Follow-ups')!.rows[1][6]).toBe('{broken');expect(h.calls.filter(c=>!c.url.endsWith('/stop-email'))).toEqual([]);
  h.gas.sendGuideDigest();expect(h.mail).toHaveLength(1);expect(h.mail[0].body).toContain('Invalid queue payload');
 });
 it('keeps an interrupted legacy delivery uncertain instead of automatically resending it',()=>{
  const h=load();h.queue(lead(),'processing:0',new Date(Date.now()-20*60_000).toISOString());
  h.gas.processFollowUps();expect(h.statusOf().status).toMatch(/uncertain/);expect(h.calls.filter(c=>!c.url.endsWith('/stop-email'))).toEqual([]);expect(h.mail).toHaveLength(1);expect(h.mail[0].body).toContain('reconciliation');
  const retained=structuredClone(h.tabs.get('Follow-ups')!.rows);h.gas.processFollowUps();expect(h.tabs.get('Follow-ups')!.rows).toEqual(retained);
 });
});
