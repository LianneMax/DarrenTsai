/** Browser -> real local HTTP proxy -> real Apps Script writer. Storage and
 * provider APIs are isolated by the existing GAS test adapter. No real leads,
 * email, CRM, analytics or bookings are created. Not a production-account test.
 * Run after build: node scripts/sitewide-capture-check.mjs [dist-directory]
 */
/* global document, window, getComputedStyle */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const runtime=resolve('.local-notes/sitewide-runtime');
const output=resolve('.local-notes/sitewide-browser');
const dist=resolve(process.argv[2]||'dist');
await mkdir(runtime,{recursive:true});await mkdir(output,{recursive:true});
await build({entryPoints:['netlify/functions/lead.mts'],outfile:runtime+'/lead.mjs',bundle:true,platform:'node',format:'esm',external:['@netlify/blobs']});
await build({entryPoints:['tests/helpers/gas-harness.ts'],outfile:runtime+'/gas.mjs',bundle:true,platform:'node',format:'esm',define:{__dirname:JSON.stringify(resolve('tests/helpers'))}});
const {default:handler}=await import(pathToFileURL(runtime+'/lead.mjs'));
const {loadGas}=await import(pathToFileURL(runtime+'/gas.mjs'));
const key='local-only-browser-check';const base='http://127.0.0.1:4177';
const requests=[];const providerCalls=[];const mail=[];
let h;
function reset(){h=loadGas({exports:['doPost','processFollowUps'],props:{LEAD_PROXY_KEY:key,HUBSPOT_PORTAL_ID:'local',HUBSPOT_FORM_GUID:'local',HUBSPOT_SEND_TESTS:'true',CALLRAIL_SYNC_ENABLED:'true',CALLRAIL_SEND_TESTS:'true',CALLRAIL_API_TOKEN:'local',CALLRAIL_ACCOUNT_ID:'local',CALLRAIL_COMPANY_ID:'local'},onMail:m=>mail.push(m),fetch:url=>{providerCalls.push(url);return {getResponseCode:()=>200,getContentText:()=>'{"emails":[]}'};}});requests.length=0;providerCalls.length=0;mail.length=0;}
globalThis.Netlify={env:{get:name=>({LEAD_PROXY_KEY:key,APPS_SCRIPT_WEBHOOK_URL:base+'/__writer'})[name]}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>{assert.equal(new URL(String(url)).origin,base,'Server attempted an outside request');return nativeFetch(url,init);};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,base);
    if(req.method==='POST'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
      res.setHeader('content-type','application/json');
      if(url.pathname==='/__writer'){res.end(h.gas.doPost({postData:{contents:body}}).__body);return;}
      if(url.pathname==='/api/lead'){
        requests.push(JSON.parse(body));
        // Only this test adapter maps loopback to the production request origin.
        // Production origin checks are left intact, with their own test suite.
        const reply=await handler(new Request('https://realdarrentsai.com/api/lead',{method:'POST',headers:{'content-type':'application/json',origin:'https://realdarrentsai.com'},body}),{});
        res.statusCode=reply.status;res.end(await reply.text());return;
      }
    }
    if(url.pathname.startsWith('/api/')){res.statusCode=503;res.end('{}');return;}
    let path=resolve(dist,'.'+decodeURIComponent(url.pathname));assert.ok(path.startsWith(dist+sep)||path===dist);
    if(!extname(path))path=resolve(path,'index.html');
    try{res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
    catch{res.statusCode=404;res.setHeader('content-type','text/html');res.end(await readFile(resolve(dist,'404.html')));}
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
});
await new Promise(resolve=>server.listen(4177,'127.0.0.1',resolve));
let browser;const results=[];let blocked=0;
let events=[];
async function open(path,width=390){
  reset();const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await ctx.newPage();page.setDefaultTimeout(12000);
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==base){blocked++;return route.abort();}return route.continue();});
  await page.goto(base+path+(path.includes('?')?'&':'?')+'utm_source=local-verification');
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});if(await reject.isVisible())await reject.click();
  events=[];await page.exposeFunction('recordLocalEvent',name=>events.push(name));
  await page.evaluate(()=>{const track=window.DT&&window.DT.track;if(window.DT)window.DT.track=function(name,...args){window.recordLocalEvent(name);if(track)track.call(this,name,...args);};});
  return {ctx,page};
}
async function layout(page,label){
  const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('input:not([type=checkbox]):not([type=range]):not([type=hidden]),select,textarea')].filter(el=>el.getBoundingClientRect().width>1&&parseFloat(getComputedStyle(el).fontSize)<16).map(el=>el.id||el.name)}));
  assert.ok(metrics.scroll<=metrics.width,label+' overflow '+JSON.stringify(metrics));if(metrics.width<600)assert.deepEqual(metrics.small,[],label+' small fields');
}
async function choose(page,group,name){await page.getByRole('group',{name:group,exact:true}).getByRole('button',{name,exact:true}).click();}
async function identity(page,prefix='lead-'){for(const [name,value]of[['fname','TEST'],['lname','Local Browser'],['email','sitewide.local@gmail.com'],['phone','7145550123']])await page.locator('#'+prefix+name).fill(value);}
async function assertSaved(page,{tab,outside,use='primary',formId}){
  if(outside)await page.waitForURL('**/out-of-market-'+(use==='investment'?'dscr':'primary')+'/#recorded');
  else await page.waitForFunction(()=>[...document.querySelectorAll('.dcp-recap,.adu-recap,.dt-book-calendar,.dt-book-frame,.dt-book-confirm,.dt-book-success,#modalSuccess,#leadSuccess')].some(el=>el.getBoundingClientRect().height>0));
  assert.equal(requests.length,1,formId+' expected one HTTP post');const data=requests[0];const row=h.rowOf(tab);
  assert.equal(data.formId,formId);assert.equal(data.privacyAcknowledged,true);assert.ok(data.message.includes('LOCAL ONLY'));assert.equal(row['Inquiry Message'],data.message);
  assert.equal(row['Submission ID'],data.submissionId);assert.equal(row['Service Area Result'],outside?'out-of-market':'supported');assert.equal(row['Property State'],data.propertyState);
  if(formId==='debt-savings-calculator'){
    const snapshot=JSON.parse(row['Submission Snapshot']);
    assert.equal(data.comparisonOption,'heloc');assert.equal(snapshot.comparisonOption,'heloc');
    assert.deepEqual(snapshot.helocIllustration,{amount:252500,assumedCltvPercent:85,homeValue:650000,mortgageBalance:300000,illustrationOnly:true});
    assert.equal(data.loanType,undefined,'discussion choice must not change CRM loan type');
  }
  if(outside){assert.equal(h.tabs.has('Follow-ups'),false);assert.equal(h.tabs.has('CallRail Sync'),false);assert.equal(row.Status,'Sheet only: outside service area');h.gas.processFollowUps();assert.deepEqual(providerCalls.filter(url=>!url.endsWith('/stop-email')),[]);assert.deepEqual(mail,[]);assert.equal(await page.locator('iframe[src*="calendar.google"]').count(),0);}
  else assert.equal(h.tabs.get('Follow-ups').rows.length,2);
  assert.equal(events.filter(e=>e==='generate_lead').length,outside?0:1,'qualified conversion only after supported receipt');
  results.push({formId,outside,use,state:data.propertyState,tab,receipt:'saved',message:true});console.log('PASS',JSON.stringify(results.at(-1)));
}
async function equity(page,outside){
  await page.locator('#he-value').fill('650000');await page.locator('#he-balance').fill('300000');await choose(page,'Property type','Single family or condo');await choose(page,'Property use','Primary home');await page.locator('#he-zip').fill(outside?'80202':'92646');await page.locator('#he-state').selectOption(outside?'CO':'CA');
  await page.locator('#equity .dcp-panel').getByRole('button',{name:'Continue',exact:true}).click();await choose(page,'Goal','Home improvement');await choose(page,'Credit range','720+');await choose(page,'Cash range','$25k-75k');await choose(page,'Mortgage current','Yes');await choose(page,'Bankruptcy or foreclosure','No');await page.locator('#equity .dcp-panel').getByRole('button',{name:'Continue',exact:true}).click();await identity(page);await page.locator('#equity-inquiry-message').fill('LOCAL ONLY equity browser inquiry');
}
async function payoff(page,outside){
  await page.locator('[id^=debt-type-]').first().click();await page.getByRole('option',{name:'Credit Card',exact:true}).click();for(const [field,value]of[['balance','25000'],['payment','750'],['rate','24.99']])await page.locator('[id^=debt-'+field+'-]').first().fill(value);await page.getByRole('button',{name:'Continue to Home Info'}).click();
  for(const [i,value]of ['650000','300000','1800','3.5','24'].entries())await page.locator('#equity .dcp-panel input[type=number]').nth(i).fill(value);await page.getByRole('button',{name:'See My Comparison'}).click();
  await page.locator('#heloan-tier').click();await page.getByRole('option').first().click();await page.locator('#heloan-term').click();await page.getByRole('option').first().click();
  assert.equal(await page.locator('.dcp-primary-options > .dcp-option').count(),4);await layout(page,'payoff comparison');await page.locator('#equity').screenshot({path:output+'/payoff-'+page.viewportSize().width+'.png'});
  const aprSummary=page.locator('.dcp-details .apr-info > summary').first();await page.locator('.dcp-details > summary').first().click();assert.ok((await aprSummary.boundingBox()).height<=26,'APR info is compact');assert.equal(await aprSummary.evaluate(el=>getComputedStyle(el,'::after').content),'none');
  await page.getByRole('button',{name:'Discuss a HELOC'}).click();assert.equal(requests.length,0,'HELOC action only advances to contact');await page.getByText('You’d like to discuss a HELOC.',{exact:false}).waitFor();await page.locator('[data-property-use]').selectOption('primary');await page.locator('[data-property-state]').selectOption(outside?'CO':'CA');await identity(page,'payoff-');await page.locator('#payoff-inquiry-message').fill('LOCAL ONLY payoff browser inquiry');
}
async function adu(page,outside){
  await page.getByRole('button',{name:/ADU for family/}).click();await page.locator('#adu-cost').fill('175000');await page.locator('#adu-finance').fill('75000');await page.getByRole('button',{name:'Add my home'}).click();await page.locator('#adu-value').fill('650000');await page.locator('#adu-balance').fill('350000');await page.locator('#adu-calculator-property-use').selectOption('primary');await page.locator('#adu-calculator-property-state').selectOption(outside?'CO':'CA');await page.getByRole('button',{name:'See my snapshot'}).click();await page.getByRole('button',{name:'Talk through my plan'}).click();await identity(page);await page.locator('textarea.inquiry-message, .inquiry-message textarea').fill('LOCAL ONLY ADU browser inquiry');
}
async function staticSelect(page,id,value){const native=page.locator('#'+id);const shell=native.locator('..');await shell.locator('.cselect-trigger').click();const label=await native.locator('option[value="'+value+'"]').textContent();await page.locator('.cselect-panel').getByRole('option',{name:label,exact:true}).click();}
async function guide(page,kind,outside){
  const id=kind==='dscr'?'dscr-magnet':kind==='fha'?'fha-magnet':'rei-magnet';const prefix=kind==='rei'?'l':'m';
  await page.locator(kind==='dscr'?'#openModalBtn':'[data-'+kind+'-guide]').first().click();
  for(const [field,value]of[['Name','TEST Local Browser'],['Email','sitewide.local@gmail.com'],['Phone','7145550123']])await page.locator('#'+prefix+field).fill(value);
  const next=page.locator(kind==='dscr'?'#guideNext':'#'+kind+'GuideNext');await next.click();
  const use=kind==='fha'?'primary':'investment';if(kind==='rei')await page.locator('[data-property-use="'+id+'"]').selectOption(use);
  assert.equal(await page.locator('[data-property-state="'+id+'"]').count(),1,'one property state field');await staticSelect(page,prefix+'State',outside?(use==='investment'?'NY':'CO'):'CA');
  if(kind==='fha'){await page.locator('#mCreditShell .cselect-trigger').click();await page.locator('.cselect-panel').getByRole('option').first().click();}
  assert.equal(requests.length,0,'state does not post or exit');await next.click();await page.locator('[data-inquiry-message="'+id+'"]').fill('LOCAL ONLY '+kind+' browser inquiry');return {formId:id,use};
}
async function booking(page,outside){
  await page.waitForSelector('.dt-book-card');const card=page.locator('.dt-book-card');const next=()=>card.locator('.dt-book-next').click();const tap=(q,value)=>card.locator('[data-q="'+q+'"] [data-value="'+value+'"]').click();
  await tap('bookingGoal','equity');await next();await tap('propertyUse','primary');await card.locator('[data-book="state"]').selectOption(outside?'CO':'CA');await next();await tap('propertyType','single-family-condo');await next();await tap('mortgageCurrent','yes');await tap('recentBankruptcyForeclosure','no');await next();
  for(const [field,value]of[['firstName','TEST'],['lastName','Local Browser'],['email','sitewide.local@gmail.com'],['phone','7145550123']])await card.locator('[name="'+field+'"]').fill(value);await next();await card.locator('[name="message"]').fill('LOCAL ONLY booking browser inquiry');return card;
}
try{
  browser=await chromium.launch();
  for(const outside of [true,false])for(const kind of ['equity','payoff','adu','dscr','fha','rei','booking']){
    const paths={equity:'/home-equity/',payoff:'/home-equity/?goal=payoff',adu:'/adu/',dscr:'/dscr/',fha:'/fha/',rei:'/realestateinvesting/',booking:'/book/'};
    const {ctx,page}=await open(paths[kind],kind==='payoff'&&!outside?1440:390);
    try{
      let formId;let use='primary';let submit;let privacy;
      if(kind==='equity'||kind==='payoff'||kind==='adu'){
        await ({equity,payoff,adu})[kind](page,outside);formId={equity:'home-equity-calculator',payoff:'debt-savings-calculator',adu:'adu-calculator'}[kind];privacy=page.locator('[data-privacy-form="'+formId+'"]');submit=page.locator(kind==='adu'?'.adu-contact-stage .dcp-actions button':'#equity .dcp-actions button').last();
      }else if(kind==='booking'){
        const card=await booking(page,outside);formId='booking-prequal';privacy=card.locator('[name="privacy"]');submit=card.locator('.dt-book-next');
      }else{
        ({formId,use}=await guide(page,kind,outside));privacy=page.locator('[data-privacy-form="'+formId+'"]');submit=page.locator('#submitLead');
      }
      assert.equal(requests.length,0);await layout(page,kind+' contact');await privacy.check();assert.equal(requests.length,0,'privacy alone does not post');await submit.click();
      await assertSaved(page,{formId,outside,use,tab:{equity:'Home Equity',payoff:'Debt Consolidation',adu:'ADU',dscr:'DSCR',fha:'FHA',rei:'Real Estate Investing',booking:'Home Equity'}[kind]});
    }catch(error){await page.screenshot({path:output+'/failure-'+kind+'-'+outside+'.png',fullPage:true});throw new Error(kind+'/'+outside+': '+error.message,{cause:error});}
    finally{await ctx.close();}
  }
  await writeFile(output+'/results.json',JSON.stringify({results,blocked,transport:'real loopback HTTP; actual endpoint and GAS source; isolated Sheet/provider adapter'},null,2));
  console.log('Site-wide local E2E OK:',results.length,'journeys;',blocked,'external requests blocked.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;}
