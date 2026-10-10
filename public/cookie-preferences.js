/**
 * Basic consent: no optional vendor script is requested before acceptance.
 * A banner alone would leave GTM, HubSpot's ads pixel and CallRail tracking
 * running after Reject. Gate the loaders instead, while keeping forms and
 * in-memory URL attribution available. Max approved these controls on 10 Oct.
 * One optional category includes analytics and marketing together, because
 * the existing GTM container loads both. Do not offer a split we cannot honor.
 */
(function () {
  'use strict';
  var KEY = 'dt_cookie_preferences';
  var TTL = 180 * 24 * 60 * 60 * 1000;
  var choice = null;
  var waiting = [];
  var panel, manage, toggle, previousFocus;
  try {
    var saved = JSON.parse(window.localStorage.getItem(KEY));
    if (saved && typeof saved.optional === 'boolean' && typeof saved.ts === 'number' && Date.now() - saved.ts < TTL) choice = saved.optional;
  } catch (e) { /* The controls still work when storage is unavailable. */ }
  var gpc = window.navigator.globalPrivacyControl === true;
  if (gpc) choice = false;
  window.dataLayer = window.dataLayer || [];
  function consent(status, command) {
    // Use the consent API through dataLayer, never install a second gtag loader.
    function enqueue() { window.dataLayer.push(arguments); }
    enqueue('consent', command, { ad_storage: status, analytics_storage: status, ad_user_data: status, ad_personalization: status });
  }
  consent(choice === true ? 'granted' : 'denied', 'default');
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
    try {
      window.localStorage.removeItem('dt_attr');
      Object.keys(window.localStorage).forEach(function (key) {
        if (/^(calltrk|__hstc|hubspot)/i.test(key)) window.localStorage.removeItem(key);
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
  if (choice !== true) clearOptionalStorage();
  function close() {
    panel.hidden = true;
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function save(value) {
    var wasAllowed = allowed();
    choice = value && !gpc;
    try { window.localStorage.setItem(KEY, JSON.stringify({ optional: choice, ts: Date.now() })); } catch (e) { /* Page-view choice remains in memory. */ }
    consent(allowed() ? 'granted' : 'denied', 'update');
    if (!allowed()) clearOptionalStorage();
    close();
    if (wasAllowed && !allowed()) {
      // A loaded third-party library cannot be unloaded safely. The Manage
      // panel explicitly warns that switching off optional tracking reloads.
      window.location.reload();
    } else loadDeferred();
  }
  function show() {
    previousFocus = document.activeElement;
    panel.hidden = false;
    manage.hidden = true;
    panel.querySelector('button').focus();
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
    panel.innerHTML = '<h2>Cookie preferences</h2><p>Optional cookies help us measure visits, ads and calls through Google, HubSpot and CallRail. Calculators and forms work without them.</p><div class="dt-cookie-actions"><button type="button" data-choice="accept">Accept</button><button type="button" data-choice="reject">Reject optional</button><button type="button" data-choice="manage">Manage</button></div><div class="dt-cookie-manage" hidden><label><input type="checkbox"> Allow optional analytics and marketing</label><p>Necessary preferences stay on. Switching optional tracking off reloads this page; submit any completed form first.</p><button type="button" data-choice="save">Save preferences</button></div><a href="https://www.saxtonmortgage.com/privacy-policy" target="_blank" rel="noopener">Privacy policy</a><button type="button" class="dt-cookie-close" aria-label="Close cookie preferences">×</button>';
    document.body.appendChild(panel);
    manage = panel.querySelector('.dt-cookie-manage'); toggle = manage.querySelector('input');
    toggle.checked = allowed(); toggle.disabled = gpc;
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
    var reopen = document.createElement('button');
    reopen.type = 'button'; reopen.className = 'dt-cookie-reopen'; reopen.textContent = 'Cookie preferences';
    reopen.addEventListener('click', show);
    // Outside the React root, so createRoot cannot remove the controls.
    document.body.appendChild(reopen);
    if (choice === null) show();
    loadDeferred();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
