/**
 * Two consent rules (Max, 13 Nov 2026):
 * - Google measurement (GTM, GA4, Google Ads) is on by default and stops on
 *   Reject or Global Privacy Control. Ads cannot record conversions or detect
 *   the tag if Google only loads after an explicit Accept.
 * - HubSpot and CallRail stay off until Accept (the 19 Oct opt-in, unchanged).
 *   The GTM container also holds HubSpot's tracking code, so until Accept GTM
 *   starts with a blocklist that stops every non-Google tag in it.
 * A banner alone would leave vendors running after Reject, so the loaders are
 * gated, while forms and in-memory URL attribution keep working either way.
 */
(function () {
  'use strict';
  var KEY = 'dt_cookie_preferences';
  var TTL = 180 * 24 * 60 * 60 * 1000;
  var choice = null;
  var storageUnavailable = false;
  var waiting = [];
  var panel, previousFocus;
  try {
    // Reject reloads to stop already-loaded vendors. If preferences cannot be
    // saved, default off so that reload cannot silently enable tracking again.
    window.localStorage.setItem(KEY + '_probe', '1');
    window.localStorage.removeItem(KEY + '_probe');
    var saved = JSON.parse(window.localStorage.getItem(KEY));
    if (saved && typeof saved.optional === 'boolean' && typeof saved.ts === 'number') {
      // Never silently restart tracking for a returning visitor who rejected it.
      // Acceptance expires after 180 days; rejection lasts until they change it.
      if (saved.optional === false || Date.now() - saved.ts < TTL) choice = saved.optional;
    }
  } catch (e) { storageUnavailable = true; choice = false; }
  var gpc = window.navigator.globalPrivacyControl === true;
  if (gpc) {
    choice = false;
    // A GPC opt-out supersedes an earlier acceptance. Removing the browser
    // signal later must not silently resurrect that withdrawn acceptance.
    try { window.localStorage.setItem(KEY, JSON.stringify({optional:false, ts:Date.now()})); } catch (e) { /* The signal still applies in memory. */ }
  }
  window.dataLayer = window.dataLayer || [];
  function consent(status, command) {
    // Use the consent API through dataLayer, never install a second gtag loader.
    function enqueue() { window.dataLayer.push(arguments); }
    enqueue('consent', command, { ad_storage: status, analytics_storage: status, ad_user_data: status, ad_personalization: status });
  }
  consent(googleAllowed() ? 'granted' : 'denied', 'default');
  // HubSpot, CallRail and persistent attribution: explicit Accept only.
  function allowed() { return choice === true && !gpc; }
  // Google: on unless rejected. A browser that cannot save a rejection starts
  // with choice false, so a reload can never silently restart Google either.
  function googleAllowed() { return choice !== false && !gpc; }
  var googleTagId = null;
  var googleTagLoaded = false;
  // GTM reads the blocklist once, when the container starts. A visitor who
  // accepts after the container started gets HubSpot from the next page view.
  var NON_GOOGLE_TAGS = ['customScripts', 'customPixels', 'nonGoogleScripts', 'nonGoogleIframes', 'nonGooglePixels'];
  function startGoogleTag() {
    if (!googleTagId || googleTagLoaded || !googleAllowed()) return;
    googleTagLoaded = true;
    if (!allowed()) window.dataLayer.push({ 'gtm.blocklist': NON_GOOGLE_TAGS });
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + googleTagId;
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else (document.head || document.documentElement).appendChild(script);
  }
  function loadDeferred() {
    if (!allowed()) return;
    document.querySelectorAll('script[type="application/x-dt-consent"]').forEach(function (placeholder) {
      if (placeholder.getAttribute('data-loaded')) return;
      placeholder.setAttribute('data-loaded', 'true');
      var script = document.createElement('script');
      script.src = placeholder.getAttribute('data-src');
      script.async = false;
      document.head.appendChild(script);
    });
    var callbacks = waiting;
    waiting = [];
    callbacks.forEach(function (callback) { callback(); });
  }
  function clearCookies(pattern) {
    var domains = ['', window.location.hostname, '.' + window.location.hostname, '.realdarrentsai.com'];
    document.cookie.split(';').forEach(function (part) {
      var name = part.split('=')[0].trim();
      if (!pattern.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
      });
    });
  }
  function clearLocal(pattern) {
    try {
      Object.keys(window.localStorage).forEach(function (key) {
        if (pattern.test(key)) window.localStorage.removeItem(key);
      });
    } catch (e) { /* Storage denial must never disable a form. */ }
  }
  // HubSpot, CallRail and the site's own persistent attribution.
  function clearOptionalStorage() {
    // Pending inquiry snapshots contain attribution too. Consent withdrawal
    // removes the durable draft while the loaded page can still retry in memory.
    try { window.sessionStorage.removeItem('dt_pending_leads_v1'); } catch (e) { /* Storage may be denied. */ }
    try { window.localStorage.removeItem('dt_attr'); } catch (e) { /* Storage denial must never disable a form. */ }
    clearLocal(/^(calltrk|__hstc|hubspot)/i);
    clearCookies(/^(__hs|hubspotutk|calltrk)/i);
  }
  // Kept apart so a visitor who has not chosen keeps one stable GA4 client ID.
  function clearGoogleStorage() {
    clearLocal(/^_gcl/i);
    clearCookies(/^(_ga|_gid|_gat|_gcl)/i);
  }
  if (!allowed()) clearOptionalStorage();
  if (!googleAllowed()) clearGoogleStorage();
  function close() {
    panel.hidden = true;
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function save(value) {
    var wasAllowed = allowed();
    choice = value && !gpc;
    try { window.localStorage.setItem(KEY, JSON.stringify({ optional: choice, ts: Date.now() })); } catch (e) { /* Page-view choice remains in memory. */ }
    consent(googleAllowed() ? 'granted' : 'denied', 'update');
    if (window.dispatchEvent) window.dispatchEvent(new Event('dt:consent'));
    if (!allowed()) clearOptionalStorage();
    if (!googleAllowed()) clearGoogleStorage();
    close();
    if ((wasAllowed && !allowed()) || (googleTagLoaded && !googleAllowed())) {
      // A loaded third-party library cannot be unloaded safely. The panel
      // warns that switching tracking off reloads the page.
      window.location.reload();
    } else {
      startGoogleTag();
      loadDeferred();
    }
  }
  function show(focusChoice) {
    previousFocus = document.activeElement;
    panel.hidden = false;
    panel.querySelector('.dt-cookie-reload-note').hidden = !(allowed() || googleTagLoaded);
    if (focusChoice !== false) panel.querySelector('button:not(:disabled)').focus();
  }
  window.DTConsent = {
    isAllowed: allowed,
    whenAllowed: function (callback) { if (allowed()) callback(); else waiting.push(callback); },
    isGoogleAllowed: googleAllowed,
    // Called inline in every page's <head> so the container ID is in the
    // served HTML. Safe to call again: the container only ever loads once.
    loadGoogleTag: function (id) { googleTagId = googleTagId || id; startGoogleTag(); },
    open: function () { if (panel) show(); },
  };
  function init() {
    panel = document.createElement('section');
    panel.className = 'dt-cookie-panel'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Cookie preferences');
    panel.innerHTML = '<h2>Your privacy, your choice.</h2><p>Google Analytics and Google Ads measure visits and ad results unless you reject them. HubSpot and CallRail marketing and call tracking stay off until you accept. Calculators and forms work either way.</p><p class="dt-cookie-reload-note" hidden>Turning tracking off reloads this page. Submit any completed form first.</p><div class="dt-cookie-actions"><button type="button" data-choice="accept">Accept</button><button type="button" data-choice="reject">Reject</button></div><a href="/privacy-policy/">Privacy policy</a><button type="button" class="dt-cookie-close" aria-label="Close cookie preferences">×</button>';
    document.body.appendChild(panel);
    if (storageUnavailable) {
      var storageNotice = document.createElement('p');
      storageNotice.textContent = 'Your browser cannot save preferences, so optional tracking starts off.';
      panel.insertBefore(storageNotice, panel.querySelector('.dt-cookie-actions'));
    }
    if (gpc) {
      var notice = document.createElement('p'); notice.textContent = 'Your Global Privacy Control signal keeps optional tracking off.'; panel.insertBefore(notice, panel.querySelector('.dt-cookie-actions'));
      panel.querySelector('[data-choice="accept"]').disabled = true;
    }
    panel.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var action = button.getAttribute('data-choice');
      if (action === 'accept') save(true);
      else if (action === 'reject') save(false);
      else close();
    });
    panel.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
    // Footer controls are rendered by React or static HTML. Delegation survives
    // hydration; a fixed fallback keeps settings reachable before React mounts,
    // without adding the old 72px empty strip below the footer.
    document.body.addEventListener('click', function (event) {
      if (event.target.closest('[data-dt-cookie-open]')) show();
    });
    if (!document.querySelector('[data-dt-cookie-open]')) {
      var reopen = document.createElement('button');
      reopen.type = 'button'; reopen.className = 'dt-cookie-reopen dt-cookie-fallback'; reopen.textContent = 'Cookie preferences';
      reopen.setAttribute('data-dt-cookie-open', '');
      document.body.appendChild(reopen);
      var footerDocument = reopen.ownerDocument;
      var footerObserver = new MutationObserver(function () {
        if (footerDocument.querySelector('footer [data-dt-cookie-open]')) { reopen.remove(); footerObserver.disconnect(); }
      });
      footerObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (choice === null || storageUnavailable) show(false);
    loadDeferred();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
