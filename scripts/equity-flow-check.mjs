/** Local browser acceptance for both equity journeys. All API calls are mocked,
 * all non-local requests are blocked. This never creates a real lead/booking.
 * Run after npm run build: node scripts/equity-flow-check.mjs
 */
/* global document, window, getComputedStyle */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4175';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {stdio:'ignore'});
const output = '.local-notes/equity-browser';
let browser; let checks = 0;
const counts = {posts:0, blocked:0};
await mkdir(output, {recursive:true});
async function checkLayout(page, label) {
  // A pointer left over a card after step navigation triggers the site's 3px
  // hover lift. Measure its resting grid geometry instead of that transition.
  await page.mouse.move(0,0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.dcp-option')].every(el=>getComputedStyle(el).transform==='none'));
  await page.evaluate(()=>new Promise(resolve=>{
    let last=-1;let still=0;
    function frame(){const y=window.scrollY;still=y===last?still+1:0;last=y;if(still>=3)resolve();else window.requestAnimationFrame(frame);}
    window.requestAnimationFrame(frame);
  }));
  const result = await page.evaluate(()=>{
    const width=document.documentElement.clientWidth;
    const fields=[...document.querySelectorAll('#equity input:not([type=checkbox]),#equity select,#equity textarea')];
    const crowded=[...document.querySelectorAll('#equity .journey-progress li')].filter(el=>{const label=el.querySelector('strong').getBoundingClientRect(),box=el.getBoundingClientRect();return label.right>box.right+1||label.left<box.left-1;}).map(el=>el.textContent);
    return {width,scroll:document.documentElement.scrollWidth,crowded,small:fields.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id)};
  });
  assert.ok(result.scroll<=result.width, `${label}: horizontal overflow ${JSON.stringify(result)}`);
  if(result.width<600) assert.deepEqual(result.small,[],`${label}: small phone fields`);
  assert.deepEqual(result.crowded,[],`${label}: crowded progress labels`);
  checks++;
}
async function pageFor(width, payoff=false) {
  const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await ctx.newPage(); const posted=[]; const events=[]; let responseMode='supported';
  await page.exposeFunction('localTrack',(event)=>events.push(event));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){counts.blocked++;return route.abort();}
    if(url.pathname==='/api/lead'){
      const body=route.request().postDataJSON(); posted.push(body); counts.posts++;
      if(responseMode==='uncertain') return route.fulfill({status:502,json:{ok:false,receipt:'uncertain',submissionId:body.submissionId}});
      return route.fulfill({json:{ok:true,receipt:'saved',submissionId:body.submissionId,...(responseMode==='sheet-only'?{disposition:'sheet-only'}:{})}});
    }
    if(url.pathname.startsWith('/api/')) return route.fulfill({status:503,json:{error:'local acceptance: no external services'}});
    return route.continue();
  });
  await page.goto(base+'/home-equity/'+(payoff?'?goal=payoff':''));
  const reject=page.getByRole('button',{name:'Reject optional',exact:true}); if(await reject.isVisible())await reject.click();
  await page.waitForSelector('#equity .dcp-panel');
  await page.evaluate(()=>{
    window.DT={attr:()=>({utm_source:'local-acceptance'}),track:e=>window.localTrack(e)};
    window.localCalendarCalls=0;window.localIdentifyCalls=0;
    window.DTBooking={identify:()=>window.localIdentifyCalls++,calendar:el=>{window.localCalendarCalls++;el.textContent='LOCAL CALENDAR PLACEHOLDER';}};
  });
  return {ctx,page,posted,events,setMode:mode=>{responseMode=mode;}};
}
async function choose(page,group,name){await page.getByRole('group',{name:group,exact:true}).getByRole('button',{name,exact:true}).click();}
async function equityHome(page,use='Primary home',state='CO',type='Single family or condo') {
  await page.locator('#he-value').fill('650000'); await page.locator('#he-balance').fill('300000');
  await choose(page,'Property type',type);await choose(page,'Property use',use);
  await page.locator('#he-zip').fill(state==='CA'?'92646':state==='NY'?'10001':'80202');
  await page.locator('#he-state').waitFor();await page.locator('#he-state').selectOption(state);
  await page.locator('#equity .dcp-panel').getByRole('button',{name:'Continue',exact:true}).click();
}
async function equityGoal(page,knockout=false) {
  await choose(page,'Goal','Home improvement');await choose(page,'Credit range','720+');await choose(page,'Cash range','$25k-75k');
  await choose(page,'Mortgage current',knockout?'No':'Yes');await choose(page,'Bankruptcy or foreclosure',knockout?'Yes':'No');
  await page.locator('#equity .dcp-panel').getByRole('button',{name:'Continue',exact:true}).click();
}
async function contact(page,payoff=false) {
  for(const [field,value] of [['fname','LOCAL'],['lname','Acceptance'],['email','local@example.com'],['phone','7145550123']])await page.locator('#'+(payoff?'payoff-':'lead-')+field).fill(value);
  await page.locator(payoff?'#payoff-inquiry-message':'#equity-inquiry-message').fill('Local browser check only. No real submission.');
}
async function payoffToCompare(page,home=['650000','300000','1800','3.5','24']) {
  await page.locator('[id^=debt-type-]').first().click();await page.getByRole('option',{name:'Credit Card',exact:true}).click();
  await page.locator('[id^=debt-balance-]').first().fill('25000');await page.locator('[id^=debt-payment-]').first().fill('750');await page.locator('[id^=debt-rate-]').first().fill('24.99');
  await page.getByRole('button',{name:'Continue to Home Info'}).click();
  const fields=page.locator('#equity .dcp-panel input[type=number]');
  for(const [i,value] of home.entries())await fields.nth(i).fill(value);
  await page.getByRole('button',{name:'See My Comparison'}).click();
}
try {
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{ /* Preview server is not ready yet. */ }await new Promise(resolve=>setTimeout(resolve,250));}
  browser=await chromium.launch();
  // Actual calculated layouts, including the narrow phone and wide desktop.
  for(const width of [1440,320,390,768,1920]){
    const {ctx,page}=await pageFor(width,true);
    await checkLayout(page,`debt entry ${width}`);
    if(width===320)await page.locator('#equity').screenshot({path:`${output}/debt-entry-${width}.png`});
    await payoffToCompare(page);await checkLayout(page,`comparison ${width}`);
    const cards=page.locator('.dcp-primary-options > .dcp-option');assert.equal(await cards.count(),4);
    if(width>=768){
      // Read both boxes in one frame: goStep scrolls smoothly, and two separate
      // browser calls can otherwise compare different scroll positions.
      const [a,b]=await cards.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
      await page.locator('#equity').screenshot({path:`${output}/grid-${width}.png`});
      const grid=await page.locator('.dcp-primary-options').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns,display:getComputedStyle(el).display,children:[...el.children].map(c=>({tag:c.tagName,className:c.className,gridColumn:getComputedStyle(c).gridColumn}))}));
      assert.ok(Math.abs(a.y-b.y)<2,JSON.stringify({width,a,b,grid}));assert.ok(a.width>=270,JSON.stringify({width,a,b,grid}));
    }
    await page.locator('#heloan-tier').click();await page.getByRole('option').first().click();
    await page.locator('#heloan-term').click();await page.getByRole('option').first().click();
    await page.locator('.dcp-details > summary').first().click();await checkLayout(page,`priced and expanded ${width}`);
    await page.locator('.dcp-primary-options').screenshot({path:`${output}/comparison-${width}.png`});
    if(width===390||width===1440)await page.locator('#equity').screenshot({path:`${output}/payoff-flow-${width}.png`});
    await page.getByRole('button',{name:'Have Darren Compare Full Costs'}).click();await checkLayout(page,`payoff contact ${width}`);
    assert.equal(await page.locator('#us-state').count(),0);checks++;
    await ctx.close();
  }
  for(const payoff of [false,true])for(const [use,state,outside,knockout=false] of [['primary','CO',true],['investment','NY',true],['primary','CA',false],['investment','CO',false],...(!payoff?[['primary','CO',true,true]]:[])]){
    const {ctx,page,posted,events,setMode}=await pageFor(390,payoff);setMode(outside?'sheet-only':'supported');
    const formId=payoff?'debt-savings-calculator':'home-equity-calculator';
    if(payoff){await payoffToCompare(page);await page.getByRole('button',{name:'Have Darren Compare Full Costs'}).click();await page.locator('[data-property-use]').selectOption(use);await page.locator('[data-property-state]').selectOption(state);}
    else{await equityHome(page,use==='primary'?'Primary home':'Rental',state,knockout?'Mobile home or land':'Single family or condo');await equityGoal(page,knockout);}
    assert.equal(posted.length,0);assert.ok(page.url().includes('/home-equity/'));
    await contact(page,payoff);await checkLayout(page,`${formId} ${state}/${use}`);
    const submit=page.locator('#equity .dcp-actions button').last();
    await submit.click();assert.equal(posted.length,0,'unchecked privacy must not post');
    const dialog=page.getByRole('alertdialog');if(await dialog.isVisible())await dialog.getByRole('button').last().click();
    await page.locator(`[data-privacy-form="${formId}"]`).check();assert.equal(posted.length,0,'acknowledgment alone must not post');
    await submit.click();
    await page.waitForFunction(()=>window.location.pathname.startsWith('/out-of-market-')||document.querySelector('.dcp-recap')||document.querySelector('[role=alertdialog]'));
    const failure=page.getByRole('alertdialog');
    if(await failure.isVisible())assert.fail(`${formId}/${state}/${use}: ${await failure.textContent()}; submitted ${JSON.stringify(posted.map(p=>({state:p.propertyState,use:p.propertyUse})))}`);
    if(outside){await page.waitForURL('**/out-of-market-'+(use==='investment'?'dscr':'primary')+'/#recorded');assert.equal(events.filter(e=>e==='generate_lead').length,0);}
    else{await page.getByRole('heading',{name:'Your request has been received.'}).waitFor();assert.equal(events.filter(e=>e==='generate_lead').length,1);if(!payoff)assert.equal(await page.evaluate(()=>window.localCalendarCalls),1);}
    assert.equal(posted.length,1);assert.equal(posted[0].propertyState,state);assert.equal(posted[0].state,state);assert.equal(posted[0].privacyAcknowledged,true);assert.ok(posted[0].message.includes('No real submission'));checks++;
    await ctx.close();
  }
  // New HELOC action: real calculated borrowing room (not capped at debt),
  // including a paid-off home and no room. Choosing the option never submits.
  for(const [balance,room] of [['350000',202500],['0',552500],['600000',0]]){
    const {ctx,page,posted}=await pageFor(390,true);
    await payoffToCompare(page,['650000',balance,balance==='0'?'0':'1800','3.5','24']);
    const card=page.locator('.dcp-option-heloc');
    assert.equal(await card.locator('.dcp-option-pay').textContent(),room.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}));
    assert.ok((await card.textContent()).includes('Not a monthly payment'));await checkLayout(page,'HELOC room '+balance);
    await card.getByRole('button',{name:'Discuss a HELOC'}).click();assert.equal(posted.length,0);
    await page.getByText('You’d like to discuss a HELOC.',{exact:false}).waitFor();
    await page.locator('[data-property-use]').selectOption('primary');await page.locator('[data-property-state]').selectOption('CA');await contact(page,true);await page.locator('[data-privacy-form]').check();
    await page.getByRole('button',{name:'Send My Numbers to Darren'}).click();await page.getByRole('heading',{name:'Your request has been received.'}).waitFor();
    assert.equal(posted[0].comparisonOption,'heloc');assert.equal(posted[0].helocIllustration.amount,room);assert.equal(posted[0].helocIllustration.illustrationOnly,true);
    assert.equal(posted[0].heloanMonthlyPayment,'');await ctx.close();checks++;
  }
  const declined=await pageFor(390);
  await equityHome(declined.page,'Primary home','CA');await equityGoal(declined.page,true);
  await declined.page.getByRole('heading',{name:'Thanks for checking.'}).waitFor();
  assert.equal(declined.posted.length,0);assert.equal(await declined.page.evaluate(()=>window.localCalendarCalls),0);checks++;await declined.ctx.close();
  // Unknown saves stay on the form; an unchanged retry keeps its identity.
  const {ctx,page,posted,setMode}=await pageFor(1440);
  await equityHome(page);await equityGoal(page);await contact(page);await page.locator('[data-privacy-form]').check();
  setMode('uncertain');await page.getByRole('button',{name:'Record my inquiry'}).click();await page.getByRole('alertdialog').waitFor();
  assert.ok(page.url().includes('/home-equity/'));await page.getByRole('alertdialog').getByRole('button').last().click();
  setMode('sheet-only');await page.getByRole('button',{name:'Record my inquiry'}).click();await page.waitForURL('**/out-of-market-primary/#recorded');
  assert.equal(posted[0].submissionId,posted[1].submissionId);checks++;await ctx.close();
  console.log(`Equity browser acceptance OK: ${checks} checks, ${counts.posts} mocked posts; ${counts.blocked} external requests blocked. No live services used.`);
}finally{if(browser)await browser.close();server.kill();}
