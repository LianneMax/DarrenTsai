import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { useZipLookup } from '../src/hooks/useZipLookup';
import { MarketingBenefits, MarketingFaq } from '../src/components/Marketing';
import Footer from '../src/components/Footer';
import { renderAboutShell } from '../src/prerender';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;
let latest: ReturnType<typeof useZipLookup>;
function Probe({zip}:{zip:string}) { latest=useZipLookup(zip); return null; }
async function mount(node:React.ReactNode) {
 if(!root){host=document.body.appendChild(document.createElement('div'));root=createRoot(host);}
 await act(async()=>{root!.render(node);});
 return host;
}
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=undefined;vi.unstubAllGlobals();});

describe('approved UI keeps real actions and ZIP recovery',()=>{
 it('recognizes full ZIPs locally, preserves leading zeros and rejects 00000',async()=>{
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({'92646':['Huntington Beach','CA'],'02108':['Boston','MA']})}));
  vi.stubGlobal('fetch',fetcher);
  await mount(<Probe zip="92646"/>);
  expect(latest).toMatchObject({status:'found',state:'CA',canContinue:true});
  await mount(<Probe zip="02108"/>);
  expect(latest).toMatchObject({status:'found',state:'MA'});
  await mount(<Probe zip="00000"/>);
  expect(latest).toMatchObject({status:'invalid',canContinue:false});
  expect(fetcher).toHaveBeenCalledWith('/zip-data/us.json');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('unknown ZIP needs confirmation and editing it clears that confirmation',async()=>{
  await mount(<Probe zip="90000"/>);
  expect(latest).toMatchObject({status:'unknown',canContinue:false,needsConfirmation:true});
  act(()=>latest.setConfirmed(true));expect(latest.canContinue).toBe(true);
  await mount(<Probe zip="90001"/>);
  expect(latest.canContinue).toBe(false);expect(latest.confirmed).toBe(false);
  await mount(<Probe zip="900"/>);expect(latest.status).toBe('typing');
 });
 it('whole guidance card opens the real contact callback',async()=>{
  const contact=vi.fn();await mount(<MarketingBenefits onOpenContact={contact}/>);
  act(()=>host.querySelector<HTMLButtonElement>('button.card-action')!.click());
  expect(contact).toHaveBeenCalledTimes(1);
  expect(host.querySelector('a.card-action')?.getAttribute('href')).toBe('/home-equity/');
 });
 it('FAQ tabs support keyboard navigation and contact uses its callback',async()=>{
  const contact=vi.fn();await mount(<MarketingFaq onOpenContact={contact} outlined/>);
  const tabs=host.querySelectorAll<HTMLButtonElement>('[role=tab]');
  act(()=>tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');expect(document.activeElement).toBe(tabs[1]);
  act(()=>host.querySelector<HTMLButtonElement>('.faq-bottom button')!.click());expect(contact).toHaveBeenCalledTimes(1);
 });
 it('About has one heading, no exposed phone in its shell, and both credentials',()=>{
  const shell=renderAboutShell();expect(shell.match(/<h1/g)).toHaveLength(1);
  expect(shell).not.toContain('tel:');expect(shell).toContain('Senior Loan Officer');expect(shell).toContain('Broker &amp; Investor');
 });
 it('eligible static pages contain the exact shared footer, including disclosures',()=>{
  const expected=renderToStaticMarkup(<Footer/>);
  for(const page of ['dscr','fha','realestateinvesting','book','legal','privacy-policy']){
   const html=readFileSync(`public/${page}/index.html`,'utf8');
   expect(html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0],page).toBe(expected);
  }
 });
 it('snapshot includes known full ZIPs and attribution',()=>{
  const data=JSON.parse(readFileSync('public/zip-data/us.json','utf8'));
  expect(data['92646'][1]).toBe('CA');expect(data['02108'][1]).toBe('MA');expect(data['00000']).toBeUndefined();
  expect(readFileSync('public/zip-data/README.txt','utf8')).toContain('GeoNames');
 });
});
