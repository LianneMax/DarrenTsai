import { useEffect, useRef, useState } from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';

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

const AVATAR_COLORS = [
  '#4285F4', // Google blue
  '#EA4335', // Google red
  '#34A853', // Google green
  '#9C27B0', // purple
  '#FF5722', // deep orange
  '#00ACC1', // cyan
  '#E91E63', // pink
  '#3F51B5', // indigo
  '#F4511E', // burnt orange
];

const STARS = '★★★★★';
const INTERVAL_MS = 5000;
const PER_PAGE = 3;
const MAX_POS = Math.max(0, REVIEWS.length - PER_PAGE);
const LOOP_SLIDES = [...REVIEWS, ...REVIEWS.slice(0, PER_PAGE)];

// Characters visible before "See more" appears
const CHAR_LIMIT = 190;

type Review = typeof REVIEWS[number];

export default function Reviews() {
  const headerRef   = useScrollReveal<HTMLDivElement>();
  const carouselRef = useScrollReveal<HTMLDivElement>(80);

  const [current, setCurrent] = useState(0);
  const [animated, setAnimated] = useState(true);
  const [expandedReview, setExpandedReview] = useState<Review | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Close modal on Escape
  useEffect(() => {
    if (!expandedReview) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedReview(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedReview]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = expandedReview ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [expandedReview]);

  // When we land on the clone zone, snap back silently
  useEffect(() => {
    if (current > MAX_POS) {
      const t = setTimeout(() => {
        setAnimated(false);
        setCurrent(0);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [current]);

  // Re-enable animation after the silent snap
  useEffect(() => {
    if (!animated) {
      const t = requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true))
      );
      return () => cancelAnimationFrame(t);
    }
  }, [animated]);

  const advance = () => setCurrent((prev) => prev + 1);

  const resetTimer = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const clamped = ((idx % (MAX_POS + 1)) + MAX_POS + 1) % (MAX_POS + 1);
    setCurrent(clamped);
    timerRef.current = setInterval(advance, INTERVAL_MS);
  };

  useEffect(() => {
    timerRef.current = setInterval(advance, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <>
      <section id="reviews" className="section section-white">
        <div className="container">

          <div ref={headerRef} className="section-header reveal">
            <span className="section-eyebrow" style={{ color: 'var(--navy)' }}>Client Reviews</span>
            <h2 className="section-title" style={{ color: 'var(--teal)' }}>What Homeowners Are Saying</h2>
            <p className="section-sub">
              Real results from real clients. Straight talk, no pressure, and savings that actually show up on your bank statement.
            </p>
          </div>

          {/* Carousel */}
          <div ref={carouselRef} className="reveal">
            <div className="reviews-carousel">
              <div
                className="reviews-track"
                style={{
                  transform: `translateX(-${current * (100 / PER_PAGE)}%)`,
                  transition: animated ? 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
                }}
              >
                {LOOP_SLIDES.map((r, i) => {
                  const isTruncated = r.quote.length > CHAR_LIMIT;
                  const displayQuote = isTruncated
                    ? r.quote.slice(0, CHAR_LIMIT).trimEnd() + '…'
                    : r.quote;

                  return (
                    <div key={`${r.id}-${i}`} className="review-slide">
                      <div className="review-card">
                        {/* Stars */}
                        <div className="review-stars" aria-label="5 out of 5 stars">
                          {STARS.split('').map((s, j) => (
                            <span key={j} className="review-star">{s}</span>
                          ))}
                        </div>

                        {/* Quote + See more */}
                        <div className="review-quote-wrap">
                          <p className="review-quote">"{displayQuote}"</p>
                          {isTruncated && (
                            <button
                              className="review-see-more"
                              onClick={() => setExpandedReview(r)}
                            >
                              See more
                            </button>
                          )}
                        </div>

                        {/* Author */}
                        <div className="review-author">
                          <div
                              className="review-avatar"
                              style={{ background: AVATAR_COLORS[(r.id - 1) % AVATAR_COLORS.length] }}
                            >{r.initials}</div>
                          <div>
                            <p className="review-name">{r.name}</p>
                            <p className="review-meta">{r.meta}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="reviews-nav">
              <button
                className="reviews-nav-btn"
                onClick={() => resetTimer(current - 1)}
                aria-label="Previous review"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                className="reviews-nav-btn"
                onClick={() => resetTimer(current + 1)}
                aria-label="Next review"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Dots */}
            <div className="reviews-dots" role="tablist" aria-label="Review slides">
              {Array.from({ length: MAX_POS + 1 }, (_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === current}
                  className={`reviews-dot${i === current ? ' active' : ''}`}
                  onClick={() => resetTimer(i)}
                  aria-label={`Go to position ${i + 1}`}
                />
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Full-review modal */}
      {expandedReview && (
        <div
          className="review-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setExpandedReview(null)}
        >
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="review-modal-close"
              onClick={() => setExpandedReview(null)}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            <div className="review-stars" aria-label="5 out of 5 stars">
              {STARS.split('').map((s, i) => (
                <span key={i} className="review-star">{s}</span>
              ))}
            </div>

            <p className="review-modal-quote">"{expandedReview.quote}"</p>

            <div className="review-author" style={{ marginTop: 20 }}>
              <div className="review-avatar">{expandedReview.initials}</div>
              <div>
                <p className="review-name">{expandedReview.name}</p>
                <p className="review-meta">{expandedReview.meta}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
