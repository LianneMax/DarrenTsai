/**
 * Optional tracking requires an explicit opt-in (Max, 19 Oct 2026).
 * A banner alone would leave GTM, HubSpot's ads pixel and CallRail tracking
 * running after Reject. Gate the loaders instead, while keeping forms and
 * in-memory URL attribution available. Saved opt-outs and GPC override the
 * opt-in; absence of a choice never starts optional vendors or persistence.
 * One optional category includes analytics and marketing together, because
 * the existing GTM container loads both. Do not offer a split we cannot honor.
 */
(function () {
  'use strict';
  var KEY = 'dt_cookie_preferences';
  var TTL = 180 * 24 * 60 * 60 * 1000;
  var choice = null;
  var storageUnavailable = false;
  var waiting = [];
  var panel, manage, toggle, previousFocus;
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
  consent(allowed() ? 'granted' : 'denied', 'default');
  function allowed() { return choice === true && !gpc; }
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
  function clearOptionalStorage() {
    // Pending inquiry snapshots contain attribution too. Consent withdrawal
    // removes the durable draft while the loaded page can still retry in memory.
    try { window.sessionStorage.removeItem('dt_pending_leads_v1'); } catch (e) { /* Storage may be denied. */ }
    try {
      window.localStorage.removeItem('dt_attr');
      Object.keys(window.localStorage).forEach(function (key) {
        if (/^(calltrk|__hstc|hubspot|_gcl)/i.test(key)) window.localStorage.removeItem(key);
      });
    } catch (e) { /* Storage denial must never disable a form. */ }
    var domains = ['', window.location.hostname, '.' + window.location.hostname, '.realdarrentsai.com'];
    document.cookie.split(';').forEach(function (part) {
      var name = part.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat|_gcl|__hs|hubspotutk|calltrk)/i.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
      });
    });
  }
  if (!allowed()) clearOptionalStorage();
  function close() {
    panel.hidden = true;
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function save(value) {
    var wasAllowed = allowed();
    choice = value && !gpc;
    try { window.localStorage.setItem(KEY, JSON.stringify({ optional: choice, ts: Date.now() })); } catch (e) { /* Page-view choice remains in memory. */ }
    consent(allowed() ? 'granted' : 'denied', 'update');
    if (window.dispatchEvent) window.dispatchEvent(new Event('dt:consent'));
    if (!allowed()) clearOptionalStorage();
    close();
    if (wasAllowed && !allowed()) {
      // A loaded third-party library cannot be unloaded safely. The Manage
      // panel explicitly warns that switching off optional tracking reloads.
      window.location.reload();
    } else loadDeferred();
  }
  function show(focusChoice) {
    previousFocus = document.activeElement;
    panel.hidden = false;
    manage.hidden = true;
    panel.querySelector('.dt-cookie-reload-note').hidden = !allowed();
    if (focusChoice !== false) panel.querySelector('button:not(:disabled)').focus();
  }
  window.DTConsent = {
    isAllowed: allowed,
    whenAllowed: function (callback) { if (allowed()) callback(); else waiting.push(callback); },
    open: function () { if (panel) show(); },
  };
  function init() {
    panel = document.createElement('section');
    panel.className = 'dt-cookie-panel'; panel.hidden = true;
    panel.setAttribute('aria-label', 'Cookie preferences');
    panel.innerHTML = '<h2>Your privacy, your choice.</h2><p>With your permission, Google, HubSpot and CallRail help us measure visits, ads and calls. Optional analytics and marketing stay off until you accept. Calculators and forms work either way.</p><p class="dt-cookie-reload-note" hidden>Turning tracking off reloads this page. Submit any completed form first.</p><div class="dt-cookie-actions"><button type="button" data-choice="accept">Accept optional</button><button type="button" data-choice="reject">Reject optional</button><button type="button" data-choice="manage">Manage preferences</button></div><div class="dt-cookie-manage" hidden><label><input type="checkbox"> Allow optional analytics and marketing</label><p>Necessary preferences stay on. You can change your choice from the footer at any time.</p><button type="button" data-choice="save">Save preferences</button></div><a href="/privacy-policy/">Privacy policy</a><button type="button" class="dt-cookie-close" aria-label="Close cookie preferences">×</button>';
    document.body.appendChild(panel);
    manage = panel.querySelector('.dt-cookie-manage'); toggle = manage.querySelector('input');
    toggle.checked = allowed(); toggle.disabled = gpc;
    if (storageUnavailable) {
      var storageNotice = document.createElement('p');
      storageNotice.textContent = 'Your browser cannot save preferences, so optional tracking starts off.';
      panel.insertBefore(storageNotice, panel.querySelector('.dt-cookie-actions'));
    }
    if (gpc) {
      var notice = document.createElement('p'); notice.textContent = 'Your Global Privacy Control signal keeps optional tracking off.'; manage.appendChild(notice);
      panel.querySelector('[data-choice="accept"]').disabled = true;
    }
    panel.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var action = button.getAttribute('data-choice');
      if (action === 'accept') save(true);
      else if (action === 'reject') save(false);
      else if (action === 'save') save(toggle.checked);
      else if (action === 'manage') { manage.hidden = false; toggle.checked = allowed(); toggle.focus(); }
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
