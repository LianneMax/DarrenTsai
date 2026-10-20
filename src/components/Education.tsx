import { useEffect, useRef, useState } from 'react';

const REVIEWS = [
  {
    id: 1,
    initials: 'EW',
    name: 'Edward W.',
    meta: 'Home Purchase',
    quote: `Darren went above and beyond to help us with a home purchase. He gave us quality time, and ran multiple scenarios to find what worked best for us. There were complications with our close on the sellers side, and he handled the obstacles easily. Everything he did for us was extremely transparent, and purposeful. Darren is super trustworthy, and honest. Thanks Darren!`,
  },
  {
    id: 2,
    initials: 'ES',
    name: 'Ernesto S.',
    meta: 'Purchase Loan',
    quote: `Darren, went above and beyond to get us the best rate. He is honest and straightforward. Darren kept communication open throughout the process. I highly recommend Darren to anyone looking for a broker and will be working with Darren in the future.`,
  },
  {
    id: 3,
    initials: 'DA',
    name: 'Donovan A.',
    meta: 'Home Purchase & Refinance',
    quote: `Darren is the man! Darren is someone who has helped my wife & I a couple times now. First was our first home buying experience & from the jump, he made things easy to understand & was easy to work with. Darren has now recently assisted my wife & I with our refinance & again, service was great. He's patient, knowledgeable & makes you feel like you're always in good hands. I recommend working with Darren as I will continue to do so myself.`,
  },
  {
    id: 4,
    initials: 'AW',
    name: 'Angela W.',
    meta: 'Purchase Loan',
    quote: `Worked with Darren because I found him on YouTube! He has some good content on there. Anyways, he's amazing! And will go above and beyond to have all questions answered and if he doesn't know, he will find out and get back to you promptly. He's responsive and very knowledgeable. I will definitely work with him again and have referred my parents for an upcoming ADU project.`,
  },
  {
    id: 5,
    initials: 'FY',
    name: 'Fen Y C.',
    meta: 'Refinance',
    quote: `Just closed on a refinance with Darren. He was so helpful throughout the whole process to my wife and I. Darren was very transparent and let us know everything that was going on. Ran into a few hiccups along the way, but Darren and Kim were able to take care of it without hassling us too much, which was a blessing. Thanks, Darren and Kim!`,
  },
  {
    id: 6,
    initials: 'LJ',
    name: 'Lety J.',
    meta: 'Broker Services',
    quote: `It was great working with Darren. I highly recommend him, as he was very quick to respond to all the questions we had. He would always keep us in the loop in every step of the process and was also straightforward with everything that we needed to know. He has a great attitude and made us work comfortable with him.`,
  },
  {
    id: 7,
    initials: 'PP',
    name: 'Paul P.',
    meta: 'Transaction · REALTOR®',
    quote: `I recently worked with Darren Tsai at Saxton Mortgage on a transaction, and the entire process was very smooth from start to finish. Darren was professional, responsive, and proactive throughout escrow. Communication was clear and consistent, which helped ensure we stayed on track and closed without issues. It's always a pleasure working with a lender who understands timelines and works efficiently with all parties involved. I look forward to working together again on future transactions. — Paul Phan, REALTOR®`,
  },
  {
    id: 8,
    initials: 'LP',
    name: 'Lauren P.',
    meta: 'Home Purchase · 18-day close',
    quote: `Darren and his team were great to work with! They were communicative and efficient. They helped us close in 18 days! I would recommend them to anyone looking to buy a new home.`,
  },
  {
    id: 9,
    initials: 'ZB',
    name: 'Zenebe B.',
    meta: 'Birdeye Review',
    quote: `I'm so honored and blessed to have met and worked with Darren Tsai, Sam Hsu and Kim Miller. Honestly one of the best group of people to work with. The process was so smooth and effortless. They never pressure you and always there to answer all my questions. I will definitely be working with them in the near future and I would highly recommend them. Don't waste your time looking elsewhere. This is the company to work with.`,
  },
];

const AVATAR_COLORS = ['#2e69cb', '#c63529', '#287b3d', '#9c27b0', '#c8461b', '#087c90', '#d1195c', '#3f51b5', '#c34619'];
const CHAR_LIMIT = 190;
type Review = typeof REVIEWS[number];
const getPerPage = () => typeof window !== 'undefined' && window.innerWidth <= 768 ? 1 : 3;
function Stars() { return <div className="review-stars" role="img" aria-label="5 out of 5 stars">{Array.from({length:5},(_,i)=><svg key={i} width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor"/></svg>)}</div>; }
function ReviewAuthor({review}:{review:Review}) { return <div className="review-author"><span className="review-initials" style={{background:AVATAR_COLORS[review.id-1],color:'#fff'}} aria-hidden="true">{review.initials}</span><div><strong>{review.name}</strong><small>{review.meta}</small></div></div>; }

/**
 * Same real reviews; autoplay stops for reading (hover), keyboard use and
 * reduced motion. The pause/play button was removed on 20 Oct at Max's request;
 * previous/next and the dots remain.
 */
export default function Reviews() {
 const [perPage,setPerPage]=useState(getPerPage);
 const [current,setCurrent]=useState(0);
 const [paused,setPaused]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(false);
 const [pageVisible,setPageVisible]=useState(true);
 const [expanded,setExpanded]=useState<Review|null>(null);
 const section=useRef<HTMLElement>(null),viewport=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement|null>(null);
 const maximum=Math.max(0,REVIEWS.length-perPage);
 const go=(n:number)=>setCurrent(((n%(maximum+1))+maximum+1)%(maximum+1));
 useEffect(()=>{const resize=()=>{setPerPage(getPerPage());setCurrent(0);};window.addEventListener('resize',resize,{passive:true});return()=>window.removeEventListener('resize',resize);},[]);
 useEffect(()=>{const m=window.matchMedia?.('(prefers-reduced-motion: reduce)');const update=()=>{if(m?.matches)setPaused(true);};m?.addEventListener('change',update);return()=>m?.removeEventListener('change',update);},[]);
 useEffect(()=>{const update=()=>setPageVisible(!document.hidden);document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{if(!section.current||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{threshold:.15});observer.observe(section.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(paused||hovered||focused||!visible||!pageVisible||expanded)return;const timer=setInterval(()=>setCurrent(n=>(n+1)%(maximum+1)),5000);return()=>clearInterval(timer);},[paused,hovered,focused,visible,pageVisible,expanded,maximum]);
 useEffect(()=>{const card=viewport.current?.querySelector('article');if(!card)return;viewport.current?.scrollTo?.({left:current*(card.getBoundingClientRect().width+20),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[current,perPage]);
 useEffect(()=>{if(!expanded)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal?.();return()=>{document.body.style.overflow=old;opener.current?.focus();};},[expanded]);
 const close=()=>{dialog.current?.close?.();setExpanded(null);};
 return <section id="reviews" className="reviews-section wrap" ref={section} aria-roledescription="carousel" aria-labelledby="reviews-heading" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false);}}>
  <div className="section-intro"><div><h2 id="reviews-heading">Client reviews.</h2><p>What homeowners are saying.</p></div><div className="review-controls"><button className="review-nav" aria-label="Previous review" onClick={()=>go(current-1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><button className="review-nav" aria-label="Next review" onClick={()=>go(current+1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div></div>
  <div className="review-viewport" ref={viewport} tabIndex={0} aria-label="Client reviews. Use the navigation buttons to browse." onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(current+(e.key==='ArrowRight'?1:-1));}}}>{REVIEWS.map((r,i)=><article className="client-review" key={r.id} role="group" aria-roledescription="slide" aria-label={`${i+1} of ${REVIEWS.length}`}><Stars/><blockquote>“{r.quote.length>CHAR_LIMIT?r.quote.slice(0,CHAR_LIMIT).trimEnd()+'…':r.quote}”</blockquote>{r.quote.length>CHAR_LIMIT&&<button className="text-button review-more" aria-haspopup="dialog" aria-label={`Read full review from ${r.name}`} onClick={e=>{opener.current=e.currentTarget;setPaused(true);setExpanded(r);}}>See more</button>}<ReviewAuthor review={r}/></article>)}</div>
  <div className="review-bottom"><div className="review-dots" role="group" aria-label="Review positions">{Array.from({length:maximum+1},(_,i)=><button key={i} aria-current={current===i?'true':'false'} aria-label={`Go to review ${i+1}`} onClick={()=>go(i)}/>)}</div><span aria-live={paused?'polite':'off'}>{current+1}–{Math.min(REVIEWS.length,current+perPage)} of {REVIEWS.length} reviews</span></div>
  {expanded&&<dialog ref={dialog} className="review-full-dialog" aria-labelledby="review-dialog-name" onCancel={close} onClose={()=>setExpanded(null)}><div className="review-dialog-top"><span>Client review</span><button onClick={close} aria-label="Close full review"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div className="full-review"><h2 id="review-dialog-name">{expanded.name}</h2><p>{expanded.meta}</p><Stars/><blockquote>{expanded.quote}</blockquote></div></dialog>}
 </section>;
}
