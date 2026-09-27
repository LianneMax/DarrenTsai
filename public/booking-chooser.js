/**
 * The "Book a Call" chooser: one CTA, two ways to act, and the calendar itself.
 *
 * WHY THIS EXISTS. Every booking CTA on the site used to go straight to
 * Calendly. That pushed the hottest lead there is, someone ready to talk right
 * now, into scheduling a future appointment, while the CallRail number sat in
 * the footer where nobody looks. So the one conversion path that is already
 * fully instrumented (CallRail: website pool, >60s, an Ads conversion) had
 * almost nothing to attribute, and the path that is not carried everything.
 *
 * The call option is a real <a href="tel:">, deliberately. That is what makes
 * it cheap: CallRail's swap.js rewrites the number and the href on every page,
 * and the existing listener in attribution.js already fires phone_click for any
 * tel: anchor. No new tracking code exists anywhere for the call path.
 *
 * WHY THE CALENDAR IS INLINE. Booking used to happen in Calendly's own popup,
 * or, on the first click of any page, in a new browser tab because the widget
 * had not loaded yet. A new tab is not observable: Calendly announces a booking
 * by posting a message to its parent window, and a tab we opened is not our
 * parent. That is why completed bookings went uncounted and why a webhook
 * looked like the only answer.
 *
 * Rendered inline, the calendar is an iframe inside this page, so the parent it
 * posts to is us. Every booking is visible, with no webhook and no plan
 * upgrade. The popup and new-tab paths remain only as fallbacks for when the
 * widget cannot load at all.
 *
 * All of the Calendly plumbing lives here rather than in each caller. There are
 * two runtimes to serve, the React bundle and the three hand-written landing
 * pages, and they each used to carry their own copy of the loader. Same
 * reasoning as attribution.js and email-suggest.js.
 *
 * ES5 on purpose: this is served verbatim to the browser with no transpile.
 */
(function () {
  'use strict';

  // The real number. CallRail replaces both the text and the href at runtime,
  // so what a visitor sees and dials is the pool number, not this one.
  var PHONE_DISPLAY = '(714) 887-5432';
  var PHONE_HREF = 'tel:+17148875432';

  var CALENDLY_URL = 'https://calendly.com/realdarrentsai/15min';
  var CALENDLY_ORIGIN = 'https://calendly.com';
  var WIDGET_CSS = 'https://assets.calendly.com/assets/external/widget.css';
  var WIDGET_JS = 'https://assets.calendly.com/assets/external/widget.js';

  var STYLE_ID = 'dt-booking-style';
  var HINT_ID = 'dt-booking-hints';
  var overlay = null;
  var lastFocus = null;
  var widgetLoading = false;

  /**
   * How long the calendar gets before we offer a way out.
   *
   * In the Claude app's browser it sat on Calendly's own spinner for over
   * twenty seconds, twice, with no escape and no Call option left on screen,
   * because the options are replaced by the calendar. In Chrome the same embed
   * was up in three to five seconds. Eight is well clear of a slow-but-working
   * load and well inside the point where someone gives up on a page.
   */
  var STALL_MS = 8000;

  /**
   * Who is booking, when we happen to know.
   *
   * Set by the lead forms after a successful submit. Somebody who filled in
   * seven fields thirty seconds ago should not be asked for their name and
   * email again by the calendar; that retype is where a booking gets abandoned.
   * Nothing is guessed: if no form ran, the calendar asks as it always did.
   *
   * Kept in sessionStorage as well as in memory, which is the R6-2 change. In
   * memory alone it died on a reload and on every move to another page of the
   * site, so somebody who filled in a guide form and then went looking for the
   * booking button arrived at the calendar as a stranger. sessionStorage is per
   * tab and goes when the tab does. Name and email only, the two fields
   * Calendly's own form was going to ask for anyway; it is read back only to
   * hand to that form and is sent nowhere else.
   */
  var LEAD_KEY = 'dt_known_lead';

  /** Whatever a previous page view in this tab already knew. */
  function readLead() {
    try {
      var raw = window.sessionStorage.getItem(LEAD_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      if (!saved || (!saved.name && !saved.email)) return null;
      var lead = {};
      if (saved.name) lead.name = String(saved.name);
      if (saved.email) lead.email = String(saved.email);
      return lead;
    } catch (e) {
      // Private mode, blocked storage, or something else's value under our key.
      // A forgotten name is a small cost; a throw here would take the whole
      // booking panel down with it.
      return null;
    }
  }

  function writeLead(lead) {
    try {
      if (lead) window.sessionStorage.setItem(LEAD_KEY, JSON.stringify(lead));
      else window.sessionStorage.removeItem(LEAD_KEY);
    } catch (e) { /* storage is the convenience, not the feature */ }
  }

  var knownLead = readLead();

  /**
   * Set by watchForStall while a calendar is loading, called by the message
   * listener when Calendly says it has rendered. Null the rest of the time, so
   * a stray message from a closed panel does nothing.
   */
  var onCalendlyRender = null;

  function track(event, params) {
    try {
      if (window.DT && window.DT.track) window.DT.track(event, params);
    } catch (e) { /* analytics must never break a booking */ }
  }

  /**
   * DNS and TLS to Calendly, started while the visitor reads the two options.
   *
   * The iframe is the slow part of an inline embed, not the script, and it is
   * not requested until they pick "Schedule". Warming the connection here buys
   * back most of that wait without costing anything on a page view where nobody
   * clicks, because these are only hints.
   */
  function injectHints() {
    if (document.getElementById(HINT_ID)) return;
    var frag = document.createDocumentFragment();
    var hosts = ['https://assets.calendly.com', 'https://calendly.com'];
    for (var i = 0; i < hosts.length; i++) {
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = hosts[i];
      link.crossOrigin = '';
      if (i === 0) link.id = HINT_ID;
      frag.appendChild(link);
    }
    document.head.appendChild(frag);
  }

  /** Fetch the widget once. Idempotent; safe to call on every chooser open. */
  function loadWidget() {
    if (widgetLoading) return;
    widgetLoading = true;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = WIDGET_CSS;
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = WIDGET_JS;
    js.async = true;
    // A blocked or failed script must be retryable rather than permanent:
    // widgetLoading stays true otherwise and every later open falls straight
    // through to the new tab for the rest of the session.
    js.onerror = function () { widgetLoading = false; };
    document.head.appendChild(js);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.dt-book-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(15,32,45,.55);opacity:0;transition:opacity .15s ease;' +
      'overflow-y:auto;}' +
      '.dt-book-overlay.dt-open{opacity:1;}' +
      '.dt-book-card{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;' +
      'box-shadow:0 20px 60px rgba(15,32,45,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,Helvetica,sans-serif;' +
      'transform:translateY(8px);transition:transform .15s ease;margin:auto;}' +
      '.dt-book-overlay.dt-open .dt-book-card{transform:none;}' +
      // Wider once the calendar is in, which needs the room to lay out a month.
      // 520px gets Calendly's narrow layout, which pushes the date grid below
      // the fold on a desktop screen. Wider once there is room for it.
      '.dt-book-card.dt-cal{max-width:520px;padding:18px;}' +
      '@media(min-width:780px){.dt-book-card.dt-cal{max-width:720px;}}' +
      // R6-1. Calendly picks its layout from the width of the element it is
      // handed, not from the viewport: 1100px and up gives the side-by-side
      // layout (Darren's details left, month grid and times right), 650 to
      // 1099px gives the stacked one, under 650px the phone one. At 720px every
      // desktop visitor got stacked, which puts the avatar and description
      // first and a tall blank band above the card, so the first date was below
      // the fold and had to be scrolled to inside the panel.
      //
      // 1160px of card less 18px of padding each side leaves the frame 1124px,
      // clear of the 1100px threshold with room for a scrollbar. The taller
      // frame is what makes the times column reachable without scrolling; it is
      // scoped to the wide breakpoint so short laptops keep the 72vh cap below.
      '@media(min-width:1200px){.dt-book-card.dt-cal{max-width:1160px;}' +
      '.dt-book-card.dt-cal .dt-book-frame{height:700px;max-height:85vh;}}' +
      '.dt-book-title{margin:0 0 4px;font-size:19px;line-height:26px;font-weight:700;color:#0f202d;}' +
      '.dt-book-sub{margin:0 0 18px;font-size:14px;line-height:21px;color:#6b7280;}' +
      '.dt-book-opts{display:flex;flex-direction:column;gap:10px;}' +
      '.dt-book-opt{display:flex;align-items:center;gap:14px;width:100%;text-align:left;cursor:pointer;' +
      'padding:14px 16px;border-radius:12px;border:1.5px solid #e6ebf0;background:#fff;text-decoration:none;' +
      'font-family:inherit;transition:border-color .12s ease,background-color .12s ease;}' +
      '.dt-book-opt:hover,.dt-book-opt:focus-visible{border-color:#c0334d;background:#fff7f8;outline:none;}' +
      '.dt-book-ico{flex:0 0 40px;height:40px;border-radius:10px;display:flex;align-items:center;' +
      'justify-content:center;background:#f1f5f8;color:#223d55;}' +
      // Both are block: as inline spans they ran together into
      // "Call (714) 942-4217Straight through, no waiting".
      '.dt-book-opt-t{display:block;font-size:15px;font-weight:700;color:#0f202d;line-height:20px;}' +
      '.dt-book-opt-s{display:block;font-size:13px;color:#6b7280;line-height:18px;margin-top:1px;}' +
      '.dt-book-close{margin:16px auto 0;display:block;background:none;border:0;cursor:pointer;' +
      'font-family:inherit;font-size:13px;color:#6b7280;text-decoration:underline;padding:4px;}' +
      '.dt-book-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}' +
      '.dt-book-back{background:none;border:0;cursor:pointer;font-family:inherit;font-size:13px;' +
      'color:#517686;padding:4px 0;}' +
      '.dt-book-back:hover{text-decoration:underline;}' +
      // Height is capped against the viewport so the calendar never runs off a
      // short laptop screen; the overlay scrolls if it still does not fit.
      '.dt-book-frame{min-width:280px;height:680px;max-height:72vh;}' +
      '.dt-book-wait{font-size:13px;color:#6b7280;text-align:center;padding:28px 0;}' +
      '.dt-book-stall{padding:18px 4px 4px;font-family:inherit;}' +
      '.dt-book-stall p{margin:0 0 14px;font-size:14px;line-height:21px;color:#6b7280;}' +
      // Call first on a phone, where tapping a number is the native action and
      // Calendly is a multi-step form. Schedule first on desktop, where a number
      // is only something to write down. One markup, ordered by CSS.
      '.dt-book-call{order:1;}.dt-book-sched{order:2;}' +
      '@media(min-width:640px){.dt-book-call{order:2;}.dt-book-sched{order:1;}}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  var PHONE_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CAL_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function close() {
    if (!overlay) return;
    onCalendlyRender = null; // nothing left to render into
    var node = overlay;
    overlay = null;
    node.classList.remove('dt-open');
    document.removeEventListener('keydown', onKey);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 150);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  /**
   * The width at which the card is wide enough for Calendly's two-column
   * layout, and the width below which it is a phone and left alone.
   */
  var SIDE_BY_SIDE_MIN = 1200;
  var DETAILS_HIDE_MIN = 780;

  /**
   * The URL the inline widget is given. Embed options only, no visitor data.
   *
   * Name and email used to go on here as well as through `config.prefill`,
   * which is what R6-2 removed: widget.js serialises `prefill` into the iframe
   * src itself, so passing both meant the src carried `name` and `email` twice
   * and nothing documents which one Calendly reads. On 27 Sep the src
   * demonstrably carried them and the details step was still empty, which makes
   * the duplicate the best explanation available without a browser to watch it
   * in. Prefill is the documented route, so prefill is the only route now.
   *
   * hide_event_type_details is decided here rather than in CSS because it is
   * Calendly's own content: between the two thresholds the card stays 720px and
   * gets the stacked layout whatever we do, so the avatar and description block
   * is only pushing the calendar down. Above SIDE_BY_SIDE_MIN that same block
   * IS the left column, so it stays.
   *
   * hide_gdpr_banner: the banner covers the top of the frame for EU visitors,
   * on an embed they have already chosen to open.
   */
  function embedUrl() {
    var parts = ['hide_gdpr_banner=1'];
    var w = window.innerWidth || 0;
    if (w >= DETAILS_HIDE_MIN && w < SIDE_BY_SIDE_MIN) parts.push('hide_event_type_details=1');
    return CALENDLY_URL + '?' + parts.join('&');
  }

  /**
   * The booking URL for the new-tab fallback, carrying the visitor's name and
   * email when we know them.
   *
   * A plain link has no widget, so no `prefill` option and no `utm` option,
   * which is why the query string is still the only route here. The embed
   * options above are deliberately not added: they describe an iframe this link
   * does not open.
   */
  function calendlyUrlFor(lead, utm) {
    var parts = [];
    if (lead && lead.name) parts.push('name=' + encodeURIComponent(lead.name));
    if (lead && lead.email) parts.push('email=' + encodeURIComponent(lead.email));
    // The inline widget takes UTMs through initInlineWidget's own `utm` option,
    // so it does not need them here. A plain link has no such option, and the
    // new-tab fallback was dropping the ad that produced the booking along with
    // the visitor's name.
    if (utm) {
      var map = {
        utmSource: 'utm_source', utmMedium: 'utm_medium', utmCampaign: 'utm_campaign',
        utmContent: 'utm_content', utmTerm: 'utm_term'
      };
      for (var key in map) {
        if (Object.prototype.hasOwnProperty.call(utm, key) && utm[key]) {
          parts.push(map[key] + '=' + encodeURIComponent(utm[key]));
        }
      }
    }
    if (!parts.length) return CALENDLY_URL;
    return CALENDLY_URL + (CALENDLY_URL.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  /** Attribution carried into Calendly's own record of the booking. */
  function utmFromAttribution() {
    var a = null;
    try { a = window.DT && window.DT.attr ? window.DT.attr() : null; } catch (e) { a = null; }
    if (!a) return null;
    var utm = {};
    if (a.utm_source) utm.utmSource = a.utm_source;
    if (a.utm_medium) utm.utmMedium = a.utm_medium;
    if (a.utm_campaign) utm.utmCampaign = a.utm_campaign;
    if (a.utm_content) utm.utmContent = a.utm_content;
    if (a.utm_term) utm.utmTerm = a.utm_term;
    return utm;
  }

  /**
   * Swap the two options for the calendar itself.
   *
   * Falls back to whatever the caller supplied (popup, else a new tab) when the
   * widget has not arrived. That path is untrackable, which is the whole reason
   * the inline one exists, but a booking we cannot count still beats a dead
   * button.
   */
  function showCalendar(card, opts) {
    track('calendly_open', { page_path: window.location.pathname });

    var cal = window.Calendly;
    if (!cal || typeof cal.initInlineWidget !== 'function') {
      close();
      if (typeof opts.onSchedule === 'function') opts.onSchedule();
      return;
    }

    card.classList.add('dt-cal');
    card.innerHTML =
      '<div class="dt-book-bar">' +
      '<button type="button" class="dt-book-back">&#8592; Back</button>' +
      '<button type="button" class="dt-book-close" style="margin:0;">Close</button>' +
      '</div>' +
      '<div class="dt-book-frame"></div>';

    card.querySelector('.dt-book-back').addEventListener('click', function () {
      close();
      open(opts);
    });
    card.querySelector('.dt-book-close').addEventListener('click', close);

    var frame = card.querySelector('.dt-book-frame');
    var config = { url: embedUrl(), parentElement: frame };
    var utm = utmFromAttribution();
    if (utm) config.utm = utm;
    if (knownLead) config.prefill = knownLead;
    cal.initInlineWidget(config);
    watchForStall(card, frame);
  }

  /**
   * Give the visitor a way out if the calendar never arrives.
   *
   * Calendly renders its own spinner and has no failure state of its own, so a
   * blocked or very slow iframe looks identical to one that is about to appear,
   * forever. Worse, by this point the two options have been replaced, so the
   * Call route is off screen as well.
   *
   * WHY NOT THE IFRAME'S LOAD EVENT. That was the first attempt and it never
   * fired the fallback once, because it is the wrong signal: `load` means the
   * iframe document arrived, which happened about two seconds in, while
   * Calendly's own content then sat blank for fifteen to twenty seconds. The
   * watcher had already settled and there was nothing left to fire.
   *
   * Calendly says so itself. The widget posts `calendly.event_type_viewed`
   * when the booking page is up and `calendly.page_height` when it has laid
   * out, both from https://calendly.com. Either one means a visitor is looking
   * at a calendar. Waiting for those means the fallback fires on exactly the
   * case it was written for: the iframe is there, and nothing is in it.
   */
  function watchForStall(card, frame) {
    var settled = false;
    var timer = window.setTimeout(function () {
      if (settled || !card.parentNode) return;
      settled = true;
      onCalendlyRender = null;
      showStall(card, frame);
    }, STALL_MS);

    function settle() {
      settled = true;
      onCalendlyRender = null;
      window.clearTimeout(timer);
    }

    onCalendlyRender = settle;
  }

  /** The two routes that still work when the embed does not. */
  function showStall(card, frame) {
    var out = document.createElement('div');
    out.className = 'dt-book-stall';
    out.innerHTML =
      '<p>The calendar is taking longer than it should. These both still work:</p>' +
      '<div class="dt-book-opts">' +
      '<a class="dt-book-opt dt-book-call" href="' + PHONE_HREF + '">' +
      '<span class="dt-book-ico">' + PHONE_ICON + '</span>' +
      '<span><span class="dt-book-opt-t">Call ' + PHONE_DISPLAY + '</span>' +
      '<span class="dt-book-opt-s">Call Darren directly</span></span></a>' +
      '<a class="dt-book-opt dt-book-sched" href="' + calendlyUrlFor(knownLead, utmFromAttribution()) + '" target="_blank" rel="noopener">' +
      '<span class="dt-book-ico">' + CAL_ICON + '</span>' +
      '<span><span class="dt-book-opt-t">Open the calendar in a new tab</span>' +
      '<span class="dt-book-opt-s">Free 15 minute call</span></span></a>' +
      '</div>';
    // Left above the frame rather than replacing it: the embed may still arrive,
    // and pulling it out would throw away a booking that was one second away.
    card.insertBefore(out, frame);
    // A booking made in that new tab cannot be counted, for the same reason the
    // inline embed exists. Recorded so a run of stalls is visible in GA4 rather
    // than looking like people simply not booking.
    track('calendly_stalled', { page_path: window.location.pathname });
  }

  /**
   * options.onSchedule - fallback opener, used only when the inline widget is
   *                      unavailable. Should not fire calendly_open itself:
   *                      this file owns that, so it fires exactly once either
   *                      way.
   */
  function open(options) {
    var opts = options || {};
    if (overlay) return;
    injectStyles();
    injectHints();
    lastFocus = document.activeElement;

    overlay = document.createElement('div');
    overlay.className = 'dt-book-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Talk to Darren');

    overlay.innerHTML =
      '<div class="dt-book-card">' +
      '<h2 class="dt-book-title">Talk to Darren</h2>' +
      '<p class="dt-book-sub">Call now, or pick a time that suits you.</p>' +
      '<div class="dt-book-opts">' +
      '<a class="dt-book-opt dt-book-call" href="' + PHONE_HREF + '">' +
      '<span class="dt-book-ico">' + PHONE_ICON + '</span>' +
      '<span><span class="dt-book-opt-t">Call ' + PHONE_DISPLAY + '</span>' +
      '<span class="dt-book-opt-s">Call Darren directly</span></span></a>' +
      '<button type="button" class="dt-book-opt dt-book-sched">' +
      '<span class="dt-book-ico">' + CAL_ICON + '</span>' +
      '<span><span class="dt-book-opt-t">Schedule a time</span>' +
      '<span class="dt-book-opt-s">Free 15 minute call</span></span></button>' +
      '</div>' +
      '<button type="button" class="dt-book-close">Never mind</button>' +
      '</div>';

    // The tel: anchor is left entirely alone: no preventDefault, no handler.
    // attribution.js sees the click on the way down and fires phone_click, and
    // CallRail has already rewritten the number. Closing on the way out means
    // the page is tidy when they come back from the call.
    var call = overlay.querySelector('.dt-book-call');
    call.addEventListener('click', function () {
      window.setTimeout(close, 0);
    });

    var card = overlay.querySelector('.dt-book-card');
    overlay.querySelector('.dt-book-sched').addEventListener('click', function () {
      showCalendar(card, opts);
    });

    overlay.querySelector('.dt-book-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    // Fetch the widget now rather than on the click, so the calendar is ready
    // by the time they pick "Schedule".
    loadWidget();
    if (typeof opts.onOpen === 'function') opts.onOpen();

    // Next frame, so the opacity transition has a starting value to run from.
    window.setTimeout(function () {
      if (overlay) overlay.classList.add('dt-open');
      if (call && call.focus) call.focus();
    }, 10);
  }

  /**
   * Calendly announces a completed booking by posting to its parent window,
   * which is this page now the calendar is rendered inline.
   *
   * The origin check is the security boundary, not a nicety: without it any
   * page or embed could post a forged booking and inflate the count.
   *
   * calendly_booking is an observation event. It is deliberately NOT imported
   * into Google Ads: generate_lead is the single website form conversion and
   * CallRail owns paid calls, and adding a third signal to bidding is the exact
   * duplication this site's tracking is arranged to avoid.
   */
  window.addEventListener('message', function (e) {
    // Exact match, not a substring: indexOf('calendly.com') also accepts
    // https://calendly.com.attacker.example, a domain anyone can register and
    // serve a forged booking from.
    if (e.origin !== CALENDLY_ORIGIN) return;
    var d = e.data;
    if (!d || typeof d.event !== 'string') return;

    // Proof that a calendar is actually on screen, which is what the stall
    // watcher is waiting for. Handled here because this is the one listener
    // that has already checked the origin, and a forged "it rendered" would
    // suppress the fallback exactly when it is needed.
    if (d.event === 'calendly.event_type_viewed' || d.event === 'calendly.page_height') {
      if (typeof onCalendlyRender === 'function') onCalendlyRender();
    }

    if (d.event !== 'calendly.event_scheduled') return;
    track('calendly_booking', { page_path: window.location.pathname });
  });

  /**
   * Tell the chooser who this visitor is, after a form has already asked them.
   *
   * Called from every lead submit path, the three guide forms included since
   * R6-2. Held for this tab only, in memory and in sessionStorage: never sent
   * anywhere, and only ever handed to Calendly's own booking form, which was
   * going to ask for the same two fields anyway.
   */
  function identify(lead) {
    // An empty call clears it, storage included. A form that submits with
    // nothing in those fields should not leave a previous visitor's name sitting
    // in the calendar, and that now outlives the page view.
    if (!lead || (!lead.email && !lead.name)) { knownLead = null; writeLead(null); return; }
    knownLead = {};
    if (lead.name) knownLead.name = String(lead.name).trim();
    if (lead.email) knownLead.email = String(lead.email).trim();
    writeLead(knownLead);
  }

  window.DTBooking = { open: open, close: close, preload: loadWidget, identify: identify };
})();
