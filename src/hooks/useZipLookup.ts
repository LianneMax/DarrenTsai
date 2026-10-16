import {useEffect,useState} from 'react';
export type ZipResult={zip:string;status:'empty'|'typing'|'checking'|'found'|'invalid'|'unknown'|'unavailable';city?:string;state?:string};
let postalData:Promise<Record<string,[string,string]>>|undefined;
function loadPostalData(){return postalData??=fetch('/zip-data/us.json').then(r=>{if(!r.ok)throw Error('ZIP data unavailable');return r.json();}).catch(e=>{postalData=undefined;throw e;});}
export function useZipLookup(zip:string){
 const [result,setResult]=useState<ZipResult>({zip:'',status:'empty'});
 const [confirmed,setConfirmed]=useState(false);
 useEffect(()=>{
  let active=true;setConfirmed(false);
  if(!zip){setResult({zip,status:'empty'});return;}
  if(!/^\d{5}$/.test(zip)){setResult({zip,status:'typing'});return;}
  if(zip==='00000'){setResult({zip,status:'invalid'});return;}
  setResult({zip,status:'checking'});
  loadPostalData().then(data=>{if(!active)return;const place=data[zip];setResult(place?{zip,status:'found',city:place[0],state:place[1]}:{zip,status:'unknown'});}).catch(()=>{if(active)setResult({zip,status:'unavailable'});});
  return()=>{active=false;};
 },[zip]);
 const current:ZipResult=result.zip===zip?result:{zip,status:zip.length===5?'checking':zip?'typing':'empty'};
 const needsConfirmation=current.status==='unknown'||current.status==='unavailable';
 return {...current,confirmed,setConfirmed,needsConfirmation,canContinue:current.status==='found'||(needsConfirmation&&confirmed)};
}
