import { useEffect, useRef, useState } from 'react';
import './adu-house-explorer.css';

const HOUSE_SCENES = [
  {id:'original', label:'Original home', title:'One home. A few possibilities.', note:'Start with the home you already have.', image:'/house-3d.webp'},
  {id:'detached', label:'Detached ADU', title:'A space of its own.', note:'A separate dwelling beside the main home.', image:'/adu-scenes/detached.webp'},
  {id:'attached', label:'Attached ADU', title:'Connected, with its own entrance.', note:'An additional dwelling joined to the main home.', image:'/adu-scenes/attached.webp'},
  {id:'garage', label:'Garage conversion', title:'A new use for existing space.', note:'An existing garage converted into living space.', image:'/adu-scenes/garage.webp'},
  {id:'renovation', label:'Renovation', title:'Make more of the home you love.', note:'Updated living areas and a new connection outdoors.', image:'/adu-scenes/renovation.webp'},
];

export default function AduHouseExplorer() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const host = useRef<HTMLElement>(null);
  const active = HOUSE_SCENES[index];
  const available = loaded.includes(active.id) && !unavailable.includes(active.id);

  useEffect(()=>{
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener('change', sync);
    const visibility = () => setPageVisible(!document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.15});
    if (host.current) observer?.observe(host.current);
    return ()=>{ media.removeEventListener('change',sync); document.removeEventListener('visibilitychange',visibility); observer?.disconnect(); };
  },[]);

  // This tour explains physical project differences, never an eligibility result.
  // Only the pause control stops the tour; number selection continues cycling.
  // Suspend offscreen/hidden tabs or reduced motion;
  // a missing illustration must not produce a blank hero or hold up the form.
  useEffect(()=>{
    if(paused || reduced || !visible || !pageVisible) return;
    const timer = window.setTimeout(()=>setIndex(current=>{
      for(let offset=1; offset<HOUSE_SCENES.length; offset++) {
        const next=(current+offset)%HOUSE_SCENES.length;
        if(loaded.includes(HOUSE_SCENES[next].id) && !unavailable.includes(HOUSE_SCENES[next].id)) return next;
      }
      return current;
    }),5600);
    return ()=>window.clearTimeout(timer);
  },[index,paused,reduced,visible,pageVisible,loaded,unavailable]);

  function choose(next:number) { setIndex(next); }
  function previous() { choose((index+HOUSE_SCENES.length-1)%HOUSE_SCENES.length); }
  function next() { choose((index+1)%HOUSE_SCENES.length); }
  const playing = !paused && !reduced;
  return <figure className="adu-house-explorer" ref={host} aria-label="Explore ADU and renovation ideas">
    <div className="adu-house-stage" data-scene={active.id}>
      {HOUSE_SCENES.map(scene=><img key={scene.id} src={scene.image} width={scene.id==='original'?840:1100} height={scene.id==='original'?840:733}
        alt="" aria-hidden="true" draggable="false" className={`adu-house-image adu-house-${scene.id} ${scene.id===active.id&&available?'is-current':''} ${scene.id==='original'&&!available?'is-fallback':''}`}
        onLoad={()=>setLoaded(prior=>prior.includes(scene.id)?prior:[...prior,scene.id])}
        onError={()=>setUnavailable(prior=>prior.includes(scene.id)?prior:[...prior,scene.id])}/>) }
      <div className="adu-house-current"><i aria-hidden="true"/>{active.label}</div>
      <button type="button" className="adu-tour-toggle" data-early="adu-tour-toggle" aria-label={playing?'Pause house animation':'Play house animation'} title={playing?'Pause animation':'Play animation'}
        disabled={reduced} onClick={()=>setPaused(value=>!value)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{playing?<><path d="M9 6v12M15 6v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></>:<path d="m9 5 10 7-10 7V5Z" fill="currentColor"/>}</svg>
      </button>
    </div>
    <div className="adu-house-description" aria-live={paused?'polite':'off'} aria-atomic="true"><strong>{active.title}</strong><p>{active.note}</p>
      {unavailable.includes(active.id)&&<p className="adu-house-unavailable">This illustration is unavailable. The original home is shown.</p>}
    </div>
    <ol className="adu-house-timeline" role="group" aria-label="House illustration views" data-playing={playing&&visible&&pageVisible} onKeyDown={event=>{
      if(event.key==='ArrowRight'){event.preventDefault();next();}
      if(event.key==='ArrowLeft'){event.preventDefault();previous();}
    }}>{HOUSE_SCENES.map((scene,i)=><li key={scene.id} className={index===i?'is-active':i<index?'is-past':''}><button type="button" data-early={`adu-house-${scene.id}`} aria-label={scene.label} title={scene.label} aria-pressed={index===i} onClick={()=>choose(i)}><span>{i+1}</span></button></li>)}</ol>
    <figcaption>Concept illustrations. Permits, design and availability depend on your property and local rules.{reduced&&<span> Animation off for reduced motion.</span>}</figcaption>
  </figure>;
}
