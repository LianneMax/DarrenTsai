/**
 * Attribution capture + dataLayer plumbing.
 *
 * Loaded by all four pages (index.html and the three static landing pages).
 * Plain ES5 in public/ on purpose: the static pages have no build step, and a
 * TS module plus a hand-maintained JS twin would drift. src/utils/attribution.ts
 * is a thin typed facade over this same implementation.
 *
 * All four pages share an origin, so localStorage carries attribution across
 * / <-> /dscr/ <-> /fha/ <-> /realestateinvesting/ for free.
 *
 * To switch on Google Tag Manager, set GTM_ID below. That is the only change
 * needed: events pushed to dataLayer before the container loads are replayed by
 * GTM on init, so nothing recorded in the meantime is lost.
 */
(function () {
  'use strict';

  var GTM_ID = 'GTM-N7Z8Q4QF';

  var STORAGE_KEY = 'dt_attr';
  var FIRST_TOUCH_TTL = 90 * 24 * 60 * 60 * 1000; // Google's gclid lookback
  var LAST_TOUCH_TTL = 30 * 24 * 60 * 60 * 1000; // default Ads conversion window

  // One per network. Only ever one is present on a given click.
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  // localStorage throws in Safari private mode, so every access is guarded and
  // falls back to memory. A visitor in that mode still attributes for the life
  // of the pageview, which is the case that matters for a single-page opt-in.
  var memoryFallback = null;

  function readStore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return memoryFallback;
    }
  }

  function writeStore(value) {
    memoryFallback = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (e) {
      /* memoryFallback already holds it */
    }
  }

  function params() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return { get: function () { return null; } };
    }
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function isInternalReferrer(ref) {
    if (!ref) return false;
    var refHost = hostOf(ref);
    var here = window.location.hostname.replace(/^www\./, '').toLowerCase();
    return refHost === here;
  }

  /**
   * Read the current URL + referrer into a touch record, or return null when
   * this pageview carries no attribution signal at all.
   *
   * Returning null is the important half: a direct visit or an internal
   * navigation must NEVER overwrite a stored ad click. Getting this wrong is
   * the usual cause of "Ads reports conversions but the sheet has no gclids".
   */
  function readTouch() {
    var qs = params();
    var touch = { ts: Date.now() };
    var hasSignal = false;

    for (var i = 0; i < UTM_KEYS.length; i++) {
      var v = qs.get(UTM_KEYS[i]);
      if (v) {
        touch[UTM_KEYS[i]] = v;
        if (UTM_KEYS[i] === 'utm_source') hasSignal = true;
      }
    }

    for (var j = 0; j < CLICK_IDS.length; j++) {
      var id = qs.get(CLICK_IDS[j]);
      if (id) {
        touch.clickId = id;
        touch.clickIdType = CLICK_IDS[j];
        hasSignal = true;
        break; // only one click id per click
      }
    }

    // An external referrer is a real touch even with no tagging on the URL.
    var ref = document.referrer || '';
    if (!hasSignal && ref && !isInternalReferrer(ref)) {
      touch.utm_source = hostOf(ref);
      touch.utm_medium = 'referral';
      hasSignal = true;
    }

    if (!hasSignal) return null;

    touch.landingPage = window.location.pathname + window.location.search;
    touch.referrer = ref;
    return touch;
  }

  function fresh(touch, ttl) {
    return !!touch && typeof touch.ts === 'number' && Date.now() - touch.ts < ttl;
  }

  function record() {
    var store = readStore() || {};
    var first = fresh(store.first, FIRST_TOUCH_TTL) ? store.first : null;
    var last = fresh(store.last, LAST_TOUCH_TTL) ? store.last : null;
    var touch = readTouch();

    if (touch) {
      last = touch;
      if (!first) first = touch; // written once, never overwritten while fresh
    }

    var next = {};
    if (first) next.first = first;
    if (last) next.last = last;
    writeStore(next);
    return next;
  }

  var state = record();

  /**
   * Flat payload. Flat because Apps Script writes flat sheet columns and Bonzo
   * only accepts flat top-level keys — nesting here means unwrapping twice.
   */
  function attr() {
    var last = state.last || {};
    var first = state.first || {};
    return {
      utm_source: last.utm_source || '',
      utm_medium: last.utm_medium || '',
      utm_campaign: last.utm_campaign || '',
      utm_term: last.utm_term || '',
      utm_content: last.utm_content || '',
      clickId: last.clickId || '',
      clickIdType: last.clickIdType || '',
      landingPage: last.landingPage || (window.location.pathname + window.location.search),
      referrer: last.referrer || document.referrer || '',
      firstUtmSource: first.utm_source || '',
      firstUtmCampaign: first.utm_campaign || '',
      firstClickId: first.clickId || '',
      // The network of the FIRST click, not just its id. Without this, a lead
      // whose last touch has no click id (an ad click followed later by an
      // organic YouTube or search visit) cannot be tagged ads:google from the
      // first touch, and gets filed as organic instead.
      firstClickIdType: first.clickIdType || '',
      firstTouchTs: first.ts ? new Date(first.ts).toISOString() : ''
    };
  }

  window.dataLayer = window.dataLayer || [];

  /** Every event carries the attribution snapshot, so GTM tags need no second lookup. */
  function track(event, paramsObj) {
    var payload = { event: event };
    var a = attr();
    for (var k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) payload[k] = a[k]; }
    if (paramsObj) {
      for (var p in paramsObj) { if (Object.prototype.hasOwnProperty.call(paramsObj, p)) payload[p] = paramsObj[p]; }
    }
    window.dataLayer.push(payload);
    return payload;
  }

  window.DT = { attr: attr, track: track };

  // Outbound clicks that are conversions in their own right. Phone calls are
  // plausibly the dominant conversion for a broker and are currently invisible.
  // Note for when CallRail lands: its number swap rewrites tel: hrefs and it
  // records the call too, so pick one as the primary Ads conversion rather than
  // letting both feed automated bidding.
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!el) return;
    var href = el.getAttribute('href') || '';

    if (href.indexOf('tel:') === 0) {
      track('phone_click', { phone_number: href.slice(4), page_path: window.location.pathname });
      return;
    }
    if (href.indexOf('calendly.com') !== -1) {
      track('calendly_open', { page_path: window.location.pathname });
      return;
    }

    // Anything leaving the site. Some conversions finish on someone else's
    // domain (the Saxton/Figure HELOC soft-pull, the Point HEI link), where our
    // UTMs never reach the Sheet or Bonzo, so the click itself is the only
    // signal we will ever get that the visitor went. Without this those
    // journeys are invisible: the visitor simply stops existing in our data.
    var dest = hostOf(href);
    if (dest && dest !== window.location.hostname.replace(/^www\./, '').toLowerCase()) {
      track('outbound_click', {
        outbound_domain: dest,
        outbound_url: href,
        link_text: (el.textContent || '').trim().slice(0, 80),
        page_path: window.location.pathname
      });
    }
  }, true);

  if (GTM_ID) {
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0];
      var j = d.createElement(s);
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i;
      // A normal page always has an earlier script (this file), but keep the
      // loader safe in stripped-down test/preview documents too.
      if (f && f.parentNode) f.parentNode.insertBefore(j, f);
      else if (d.head) d.head.appendChild(j);
    })(window, document, 'script', 'dataLayer', GTM_ID);
  }
})();
