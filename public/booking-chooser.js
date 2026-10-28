/**
 * Booking: one short prequal in front of Darren's calendar and his phone.
 *
 * WHY THIS EXISTS. Decided with Darren on 15 Oct 2026: only licensed-state
 * leads can book, and the site does the qualifying. Calendly's free plan could
 * not screen anyone, and its public link let a New York visitor book around the
 * state check the site already had. Google scheduling now follows this prequal, and
 * the calendar is only ever drawn here, after this prequal passes and the lead
 * has been saved. Nothing else on the site links to the calendar.
 *
 * The same flow serves every "Book a Call", "Schedule" and "Call" button, the
 * phone numbers in the footer and nav (service-area.js routes any tel: click
 * here), and the /book/ page, which mounts it inline instead of in a panel.
 * There are two runtimes to serve, the React bundle and the three hand-written
 * landing pages, so it lives here once rather than in each. Same reasoning as
 * attribution.js and email-suggest.js.
 *
 * ORDER, which is the point of the file:
 *   1. goal, on its own screen
 *   2. property use/state, then type, then the two knockout questions
 *   3. contact details, then the required privacy and optional SMS choices
 *   4. POST /api/lead. Only after a confirmed receipt: the calendar,
 *      plus a Call button.
 * State screening is deferred until deliberate final submission with privacy
 * acknowledged. An unsupported inquiry is saved to the Sheet only, then goes
 * to its out-of-market page. It cannot create a qualified conversion, CRM job
 * or calendar. A non-state knockout still declines without posting anything,
 * unless the property is outside the service area: that inquiry is recorded.
 *
 * ES5 on purpose: this is served verbatim to the browser with no transpile.
 */
(function () {
  'use strict';

  // The real number. CallRail replaces both the text and the href at runtime,
  // so what a visitor sees and dials is the pool number, not this one.
  var PHONE_DISPLAY = '(714) 887-5432';
  var PHONE_HREF = 'tel:+17148875432';

  /**
   * The one schedule setting, supplied by Max on 17 Oct 2026. The site saves
   * a screened lead before drawing Google's booking page. Google owns the
   * inner calendar UI; our wrapper and actions use the site's brand styles.
   */
  var BOOKING_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2jtRO6oFZU1VgtFGePqnIMm8cYDO5eRRXAyu-5cuX9stZDl4mkCOn5nV83SFtW4BtfxhPu336X?gv=true';
  var BOOKING_READY = BOOKING_URL.indexOf('PLACEHOLDER') === -1;

  /**
   * The words that promise a calendar, and what they say while there is none
   * (16 Oct 2026): until BOOKING_URL is real, a passing lead is called back,
   * so the copy says that. Set the link and the calendar wording returns.
   * The React pages read the same setting at build (vite.config.ts).
   */
  var COPY = BOOKING_READY
    ? { when: 'before you pick a time', submit: 'See Darren\'s calendar' }
    : { when: 'before Darren calls you', submit: 'Send my request' };

  var FORM_ID = 'booking-prequal';

  /**
   * /book/'s goal question (15 Oct 2026). The values are what the Sheet's
   * Booking Goal column and lead.mts receive; src/utils/serviceArea.ts maps
   * each to its rule. Commercial and not-sure are flagged for Darren.
   */
  var GOAL_OPTIONS = [
    ['equity', 'Get cash from my home’s equity (HELOC / HEI)'],
    ['dscr', 'Investment property (DSCR)'],
    ['own-home', 'Buy or refinance a home I live in or a second home (self-employed welcome)'],
    ['commercial', 'Commercial or custom scenario'],
    ['not-sure', 'Not sure yet']
  ];
  var GOAL_WORDING = {
    equity: { state: 'Where is the home you’re borrowing against?', use: 'How do you use that home?' },
    dscr: { state: 'Where is the investment property?', use: '' },
    'own-home': { state: 'Where is the home?', use: 'How will you use it?' },
    commercial: { state: 'Where is the property?', use: '' },
    'not-sure': { state: 'Where is the home?', use: 'How will you use it?' }
  };
  var REVIEW_GOALS = ['commercial', 'not-sure'];
  function outOfMarketPage(use) { return use === 'investment' ? '/out-of-market-dscr/' : '/out-of-market-primary/'; }
  var STYLE_ID = 'dt-booking-style';

  /**
   * source per page, so a booking lead lands under the same label as that
   * entry page context. This is retained as entrySource; the chosen goal
   * determines source after screening, so bookings use targeted Sheet/CRM buckets.
   */
  var PAGE_SOURCES = {
    '/': 'home-contact',
    '/home-equity/': 'home-equity-contact',
    '/adu/': 'adu-contact',
    '/mortgage-calculator/': 'mortgage-calculator-contact',
    '/dscr/': 'dscr-contact',
    '/fha/': 'fha-contact',
    '/realestateinvesting/': 'rei-contact'
  };

  // Release 0 wording (CallRail's 10DLC template), word for word with
  // compliance.js, so the evidence recorded matches what the visitor ticked.
  var PRIVACY_VERSION = '2026-10-13-v1';
  var SMS_CONSENT_VERSION = '2026-10-15-v5';
  var SMS_INFO_TEXT = 'By checking this box, I am agreeing to receive transactional/informational text messages from Darren Tsai (Ren Marketing Group LLC) about my inquiry and appointments. Message frequency will vary. Msg & data rates may apply. Reply HELP for help or STOP to opt-out.';
  var SMS_MARKETING_TEXT = 'By checking this box, I am agreeing to receive marketing text messages from Darren Tsai (Ren Marketing Group LLC), which may be sent using automated technology. Message frequency will vary. Msg & data rates may apply. Reply HELP for help or STOP to opt-out.';
  var SMS_LINKS = ' View our <a href="/privacy-policy" target="_blank" rel="noopener">SMS Privacy Policy</a> | <a href="/legal" target="_blank" rel="noopener">Terms</a>';

  var overlay = null;
  var savedOverlay = null;
  var lastFocus = null;
  var bookingStylesUnavailable = false;

  /**
   * Who is booking, when we happen to know.
   *
   * Set by the lead forms after a successful submit, so somebody who filled in
   * a form thirty seconds ago is not asked for their name and email again.
   * Kept in sessionStorage as well as in memory, per tab: in memory alone it
   * died on every move to another page of the site. Read back only to prefill
   * this flow's own contact step and the calendar; sent nowhere else.
   */
  var LEAD_KEY = 'dt_known_lead';

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

  // Only the shared request runtime can remember a matching saved receipt.
  // Recheck the CURRENT policy before reusing it on this page or another one.
  // Identification alone, a guide click, or an uncertain save never qualifies.
  function savedContinuation() {
    var area = window.DTServiceArea;
    var saved = window.DTLead && window.DTLead.savedInquiry ? window.DTLead.savedInquiry() : null;
    if (!saved || !area || !area.ready() || !saved.privacyAcknowledged || saved.serviceAreaVersion !== area.version()) return null;
    if (saved.formId !== FORM_ID && !area.isCaptureInquiry(saved.formId, saved.source)) return null;
    var result = area.check(saved.propertyUse, saved.propertyState, saved.formId, saved.bookingGoal);
    if (result === 'incomplete' || (saved.disposition === 'sheet-only') !== (result === 'out-of-market')) return null;
    // Keep explicit non-state knockouts intact. Other accepted inquiry forms
    // have their own server validation; do not ask their contact details twice.
    if (saved.propertyType === 'mobile-land' || saved.mortgageCurrent === 'no' || saved.recentBankruptcyForeclosure === 'yes') return null;
    return saved;
  }
  function refreshCallNumber(node) {
    try {
      if (window.DTConsent && window.DTConsent.isAllowed() && window.CallTrk && window.CallTrk.swap) window.CallTrk.swap(node);
    } catch (e) { /* preserve a working call even if optional tracking fails */ }
  }
  function continueSaved(card) {
    var saved = savedContinuation();
    if (!saved) return false;
    if (saved.disposition === 'sheet-only') { window.location.assign(outOfMarketPage(saved.propertyUse) + '#recorded'); return true; }
    var inDialog = !!card.closest('.dt-book-overlay');
    renderCalendar(card, saved, inDialog ? '<button type="button" class="dt-book-close" aria-label="Close booking"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>' : '');
    if (inDialog) card.querySelector('.dt-book-close').onclick = close;
    return true;
  }

  function track(event, params) {
    try {
      if (window.DT && window.DT.track) window.DT.track(event, params);
    } catch (e) { /* analytics must never break a booking */ }
  }

  /**
   * Contact checks, the same rules as the static pages' forms (16 Oct 2026):
   * a US number of 10 digits once a leading 1 is dropped, whose area code and
   * exchange start 2-9 and are not N11 (NANP), formatted (XXX) XXX-XXXX as it
   * is typed; and an email with a dot and at least two letters after the @.
   * lead.mts holds the same line on the server.
   */
  function phoneDigits(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    // No US area code starts with 1, so a leading 1 is the country code: dropped
    // as soon as it is typed, so "+1 714..." never shows as (171) 4...
    if (d.charAt(0) === '1') d = d.slice(1);
    return d;
  }
  function formatPhone(raw) {
    var d = phoneDigits(raw).slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function validPhone(raw) {
    var d = phoneDigits(raw);
    if (d.length !== 10) return false;
    var block = function (b) { return /^[2-9]\d{2}$/.test(b) && !/^[2-9]11$/.test(b); };
    return block(d.slice(0, 3)) && block(d.slice(3, 6));
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The goal owns the product bucket; entrySource retains the originating page.
  function bookingBucket(goal, entry) {
    if (goal === 'equity') return entry === 'adu-contact' || entry === 'adu' ? 'adu' : 'home-equity';
    if (goal === 'dscr') return 'dscr';
    if (goal === 'commercial') return 'commercial';
    if (goal === 'own-home') return entry === 'fha-contact' || entry === 'fha' ? 'fha'
      : entry === 'mortgage-calculator-contact' || entry === 'mortgage-review' ? 'mortgage-review' : 'home-purchase-refinance';
    return 'needs-guidance';
  }

  function pageSource() {
    var path = window.location.pathname || '/';
    if (path.charAt(path.length - 1) !== '/') path += '/';
    return Object.prototype.hasOwnProperty.call(PAGE_SOURCES, path) ? PAGE_SOURCES[path] : 'book-contact';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // The full questionnaire used to paint before its late stylesheet.
      // Keep its content out of the first paint until that stylesheet lands.
      '.dt-book-shell{visibility:hidden;}' +
      '.dt-book-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;' +
      'justify-content:center;padding:20px 16px;background:rgba(15,32,45,.55);opacity:0;transition:opacity .15s ease;' +
      'overflow-y:auto;}' +
      '.dt-book-overlay.dt-open{opacity:1;}' +
      '.dt-book-card{background:#fff;border-radius:16px;max-width:460px;width:100%;padding:24px;box-sizing:border-box;' +
      'box-shadow:0 20px 60px rgba(15,32,45,.28);font-family:inherit;' +
      'transform:translateY(8px);transition:transform .15s ease;margin:auto;color:#0f202d;}' +
      '.dt-book-overlay.dt-open .dt-book-card{transform:none;}' +
      '.dt-book-inline .dt-book-card{box-shadow:none;border:1px solid #e6ebf0;transform:none;margin:0 auto;}' +
      '.dt-book-card.dt-cal{max-width:760px;}' +
      '.dt-book-title{margin:0 0 4px;font-size:19px;line-height:26px;font-weight:700;color:#0f202d;}' +
      '.dt-book-sub{margin:0 0 16px;font-size:14px;line-height:21px;color:#6b7280;}' +
      '.dt-book-step{margin:0 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#517686;font-weight:600;}' +
      '.dt-book-q{margin:16px 0 8px;font-size:15px;font-weight:600;line-height:21px;}' +
      '.dt-book-choices{display:flex;flex-wrap:wrap;gap:8px;}' +
      '.dt-book-choice{flex:1 1 140px;min-height:44px;padding:10px 12px;border-radius:10px;border:1.5px solid #e6ebf0;' +
      'background:#fff;font:inherit;font-size:15px;color:#0f202d;cursor:pointer;text-align:center;}' +
      '.dt-book-choice[aria-pressed="true"]{border-color:#223d55;background:#f1f5f8;font-weight:600;}' +
      '.dt-book-choice:focus-visible{outline:2px solid #517686;outline-offset:2px;}' +
      '.dt-book-field{display:block;margin:12px 0 0;font-size:14px;font-weight:600;}' +
      '.dt-book-field input,.dt-book-field select{display:block;width:100%;box-sizing:border-box;margin-top:6px;' +
      'padding:11px 12px;border:1px solid #cfd8e0;border-radius:8px;font:inherit;font-size:16px;font-weight:400;background:#fff;color:#0f202d;}' +
      '.dt-book-situation{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cfd8e0;border-radius:8px;font:inherit;font-size:16px;color:#223d55;resize:vertical;min-height:104px;}' +
      '.dt-book-situation:focus-visible{outline:3px solid #1a7f99;outline-offset:3px;}' +
      '.dt-book-row{display:flex;gap:10px;}.dt-book-row .dt-book-field{flex:1;min-width:0;}' +
      // Consent, layout only (16 Oct 2026): muted 12.5px on a tighter line, each
      // box on its text's first line, a gap after the required box, and the
      // disclosure at the smallest legible size. The words do not change.
      '.dt-book-check{display:flex;gap:10px;align-items:flex-start;margin:8px 0 0;font-size:12.5px;line-height:18px;color:#5b6573;}' +
      '.dt-book-check input{flex-shrink:0;margin:1px 0 0;width:16px;height:16px;}' +
      '.dt-book-check-req{margin:14px 0 14px;}' +
      '.dt-book-check a{color:#2b6b80;}' +
      '.dt-book-note{margin:12px 0 0;font-size:11px;line-height:16px;color:#6b7280;}' +
      // The SMS line reads at the boxes' size; the mortgage disclosure stays 11px.
      '.dt-book-note-sms{font-size:12.5px;line-height:18px;color:#5b6573;}' +
      '.dt-book-err{margin:12px 0 0;font-size:14px;line-height:20px;color:#b42318;}' +
      '.dt-book-err:empty{display:none;}' +
      '.dt-book-card .dt-book-next{display:block;width:100%;margin-top:18px;min-height:48px;padding:12px 16px;border:0;border-radius:10px;' +
      'background:#1a7f99;color:#fff;font:inherit;font-size:16px;font-weight:600;cursor:pointer;}' +
      '.dt-book-next:hover{background:#146b82;}' +
      '.dt-book-next:focus-visible,.dt-book-calendar-link:focus-visible{outline:3px solid #1a7f99;outline-offset:3px;}' +
      '.dt-book-next[disabled]{opacity:.6;cursor:default;}' +
      '.dt-book-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;}' +
      '.dt-book-link{background:none;border:0;cursor:pointer;font:inherit;font-size:13px;color:#517686;padding:4px 0;text-decoration:underline;}' +
      '.dt-book-call{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;min-height:48px;' +
      'border-radius:10px;border:1.5px solid #e6ebf0;text-decoration:none;color:#0f202d;font-weight:600;}' +
      '.dt-book-nowrap{white-space:nowrap;}' +
      '.dt-book-frame{margin-top:20px;background:#fff;border-radius:12px;overflow:hidden;}' +
      '.dt-book-frame iframe{display:block;width:100%;height:680px;border:0;background:#fff;}' +
      '.dt-book-calendar-link{display:flex;align-items:center;justify-content:center;min-height:48px;margin-top:14px;padding:12px 16px;border-radius:8px;background:#1a7f99;color:#fff;text-decoration:none;font-weight:600;}' +
      '.dt-book-calendar-link:hover{background:#146b82;}' +
      '.dt-book-calendar-help{margin:14px 0 0;font-size:14px;line-height:1.6;color:#526676;}' +
      '@media(max-width:600px){.dt-book-frame iframe{height:720px;}.dt-book-card.dt-cal{padding:22px 16px;}}' +
      '.dt-book-done{padding:8px 0 0;font-size:15px;line-height:22px;}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
    var sheet = document.querySelector('link[href="/booking-chooser.css"]') || document.createElement('link');
    sheet.rel = 'stylesheet'; sheet.href = '/booking-chooser.css';
    sheet.addEventListener('error', function () {
      bookingStylesUnavailable = true;
      var shells = document.querySelectorAll('.dt-book-shell');
      for (var i = 0; i < shells.length; i++) {
        shells[i].textContent = 'The booking display could not load. Refresh this page to try again.';
        shells[i].style.visibility = 'visible';
      }
    });
    document.head.appendChild(sheet);
  }

  /**
   * One visitor's answers, retained in memory when its panel closes. Never stored: only
   * the name and email go to sessionStorage, through identify().
   */
  function newAnswers() {
    return { situation: '', bookingGoal: '', propertyUse: '', propertyState: '', propertyType: '', mortgageCurrent: '', recentBankruptcyForeclosure: '' };
  }

  function choiceGroup(name, options, value) {
    var html = '<div class="dt-book-choices" role="group" data-q="' + name + '">';
    for (var i = 0; i < options.length; i++) {
      html += '<button type="button" class="dt-book-choice" data-value="' + options[i][0] + '" aria-pressed="' +
        (value === options[i][0] ? 'true' : 'false') + '">' + esc(options[i][1]) + '</button>';
    }
    return html + '</div>';
  }

  function wireChoices(root, answers, onPick) {
    var groups = root.querySelectorAll('[data-q]');
    for (var g = 0; g < groups.length; g++) {
      (function (group) {
        group.addEventListener('click', function (e) {
          var btn = e.target.closest ? e.target.closest('.dt-book-choice') : null;
          if (!btn) return;
          answers[group.getAttribute('data-q')] = btn.getAttribute('data-value');
          var all = group.querySelectorAll('.dt-book-choice');
          for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', all[i] === btn ? 'true' : 'false');
          if (onPick) onPick();
        });
      })(groups[g]);
    }
  }

  /**
   * Renders the flow into `card`. `host` is the overlay or the inline mount,
   * and only decides what Close means.
   */
  function start(card, inline) {
    if (bookingStylesUnavailable) {
      card.textContent = 'The booking display could not load. Refresh this page to try again.';
      return;
    }
    if (window.DTLead) window.DTLead.begin(FORM_ID);
    card.setAttribute('data-dt-form', FORM_ID);
    var answers = newAnswers();
    var source = pageSource();
    var ctx = source + ' ' + FORM_ID;
    var stage = 0;
    var reached = 0;
    var busy = false;
    var contactView = null;
    var contact = { firstName: '', lastName: '', email: '', phone: '', message: '', privacy: false, smsInfo: false, smsMarketing: false };
    if (knownLead) {
      var names = (knownLead.name || '').split(/\s+/);
      contact.firstName = names.shift() || '';
      contact.lastName = names.join(' ');
      contact.email = knownLead.email || '';
    }
    card.classList.add('dt-book-shell');
    var checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    card.innerHTML = (inline ? '' : '<div class="dt-book-header"><a class="dt-book-brand" href="/" aria-label="Darren Tsai Home"><img src="/darren-avatar.png" width="44" height="44" alt=""><span><strong>Darren Tsai</strong><small>Senior Loan Officer · Saxton Mortgage</small></span></a><span class="dt-book-duration">15-minute conversation</span><button type="button" class="dt-book-close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>') +
      '<div class="dt-book-layout"><aside class="dt-book-guide"><div class="dt-book-intro"><h1>Book a call<br> with Darren.</h1><p>A few questions to help Darren prepare for your conversation.</p></div><nav class="dt-book-progress" aria-label="Booking progress"><ol></ol></nav><p class="dt-book-guide-note">This checks whether Darren can help with your property ' + COPY.when + '. It is not a loan application.</p></aside><section class="dt-book-panel" aria-label="Booking questions"></section></div><p class="dt-book-status" role="status" aria-live="polite"></p>';
    var panel = card.querySelector('.dt-book-panel');
    var progress = card.querySelector('.dt-book-progress');
    var status = card.querySelector('.dt-book-status');
    function observeError(code) {
      try { if (window.DT && window.DT.milestone) window.DT.milestone('form_error', {form_id:FORM_ID,error_code:code,field_category:stage === 2 ? 'contact':'property'}); } catch (e) { /* Never affect the screening decision. */ }
    }
    function setErr(msg, observe) { if (msg && observe !== false) observeError('validation'); var el = panel.querySelector('.dt-book-err'); if (el) el.textContent = msg || ''; }
    function wireClose() { var c = card.querySelector('.dt-book-close'); if (c) c.onclick = close; }
    function rememberContact() {
      var form = panel.querySelector('form');
      if (!form) return;
      for (var key in contact) if (Object.prototype.hasOwnProperty.call(contact, key) && form.elements[key]) {
        contact[key] = typeof contact[key] === 'boolean' ? form.elements[key].checked : form.elements[key].value;
      }
    }
    function draw(stageIndex, part, title, intro, html, label, back) {
      if (stageIndex > stage && window.DT && window.DT.milestone) window.DT.milestone('form_step', { form_id: FORM_ID, step_id: stage + 1 });
      stage = stageIndex; reached = Math.max(reached, stage);
      panel.innerHTML = '<div class="dt-book-meta"><span>' + ['Your goal', 'Your property', 'Your details', BOOKING_READY ? 'Pick a time' : 'Your request'][stage] + '</span><span>' + esc(part || 'Step ' + (stage + 1) + ' of 4') + '</span></div>' +
        '<h2 class="dt-book-title" tabindex="-1">' + esc(title) + '</h2>' + (intro ? '<p class="dt-book-sub">' + esc(intro) + '</p>' : '') + html +
        (label ? '<p class="dt-book-err" role="alert"></p><div class="dt-book-actions">' + (back ? '<button type="button" class="dt-book-link dt-book-back">Back</button>' : '<span class="dt-book-action-note">You can change your answers.</span>') + '<button type="button" class="dt-book-next">' + esc(label) + '</button></div>' : '');
      updateProgress(); wireClose(); focusPanel();
      if (back) panel.querySelector('.dt-book-back').onclick = back;
    }
    function focusPanel() {
      var heading = panel.querySelector('.dt-book-title');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
    function updateProgress() {
      var labels = ['Your goal', 'Your property', 'Your details', BOOKING_READY ? 'Pick a time' : 'Your request'];
      var descriptions = ['What you have in mind', 'A short property check', 'How to reach you', 'Your conversation'];
      var html = '';
      for (var i = 0; i < labels.length; i++) html += '<li class="' + (i === stage ? 'current' : i < stage ? 'done' : '') + '"><button type="button" data-stage="' + i + '"' + (i > reached || stage === 3 || busy ? ' disabled' : '') + (i === stage ? ' aria-current="step"' : '') + '><span class="dt-book-marker">' + (i < stage ? checkIcon : i + 1) + '</span><span><strong>' + labels[i] + '</strong><small>' + (i < stage ? 'Completed' : descriptions[i]) + '</small></span></button></li>';
      progress.querySelector('ol').innerHTML = html;
      status.textContent = 'Step ' + (stage + 1) + ' of 4: ' + labels[stage];
    }
    progress.addEventListener('click', function (e) {
      var button = e.target.closest('[data-stage]');
      if (!button || button.disabled || busy) return;
      var target = Number(button.getAttribute('data-stage'));
      if (target === stage) return;
      rememberContact();
      if (target === 0) stepGoal();
      if (target === 1) stepProperty();
      if (target === 2) stepContact();
    });
    function changed() { reached = Math.min(reached, stage); setErr(''); updateProgress(); }
    function stepGoal() {
      var hints = ['Use the value you’ve built in your home', 'Discuss a DSCR loan', 'For a primary or second home; self-employed welcome', 'Talk through a different property scenario', 'Tell Darren what you have in mind'];
      var labels = ['Access home equity', 'Investment property', 'Buy or refinance a home', 'Commercial or custom', 'Help choosing'];
      var goals = '<div class="dt-book-choices dt-book-goals" role="group" aria-label="Your goal" data-q="bookingGoal">';
      for (var i = 0; i < GOAL_OPTIONS.length; i++) goals += '<button type="button" class="dt-book-choice" data-value="' + GOAL_OPTIONS[i][0] + '" aria-pressed="' + (answers.bookingGoal === GOAL_OPTIONS[i][0]) + '"><strong>' + labels[i] + '</strong><small>' + hints[i] + '</small></button>';
      goals += '</div><div class="dt-book-situation-wrap"' + (answers.bookingGoal === 'not-sure' ? '' : ' hidden') + '><label class="dt-book-field" for="dt-book-situation">Tell Darren a little about your situation (required)</label><textarea class="dt-book-situation" id="dt-book-situation" rows="3" maxlength="2000" aria-describedby="dt-book-situation-help">' + esc(answers.situation) + '</textarea><p class="dt-book-calendar-help" id="dt-book-situation-help">A sentence or two about your goal or question helps Darren prepare. Please leave out account numbers and other sensitive details.</p></div>';
      draw(0, '', 'What would you like to discuss?', 'Start with the option that’s closest to your plans.', goals, 'Continue');
      wireChoices(panel, answers, function () {
        panel.querySelector('.dt-book-situation-wrap').hidden = answers.bookingGoal !== 'not-sure';
        var uses = window.DTServiceArea.uses(ctx, answers.bookingGoal);
        if (uses.indexOf(answers.propertyUse) === -1) answers.propertyUse = uses.length === 1 ? uses[0] : '';
        changed();
      });
      var situation = panel.querySelector('#dt-book-situation');
      situation.addEventListener('input', function () { answers.situation = situation.value; situation.removeAttribute('aria-invalid'); changed(); });
      panel.querySelector('.dt-book-next').onclick = function () {
        if (!answers.bookingGoal) { setErr('Please choose what you would like help with.'); return; }
        if (answers.bookingGoal === 'not-sure' && !answers.situation.trim()) { setErr('Please tell Darren a little about your situation.'); situation.setAttribute('aria-invalid', 'true'); situation.focus(); return; }
        stepProperty();
      };
    }
    function stepProperty() {
      var uses = window.DTServiceArea.uses(ctx, answers.bookingGoal);
      if (uses.indexOf(answers.propertyUse) === -1) answers.propertyUse = uses.length === 1 ? uses[0] : '';
      var w = GOAL_WORDING[answers.bookingGoal];
      var states = window.DTServiceArea.states();
      var stateOpts = '<option value="">Choose a state</option>';
      for (var i = 0; i < states.length; i++) stateOpts += '<option value="' + states[i][0] + '"' + (answers.propertyState === states[i][0] ? ' selected' : '') + '>' + esc(states[i][1]) + '</option>';
      var options = [['primary', 'Primary home'], ['second-home', 'Second home'], ['investment', 'Rental']].filter(function (o) { return uses.indexOf(o[0]) !== -1; });
      draw(1, 'Property · 1 of 3', 'A little about your property.', 'These answers check which property rules apply.', '<label class="dt-book-field">' + w.state + '<select data-book="state">' + stateOpts + '</select></label>' + (uses.length > 1 ? '<h3 class="dt-book-q">' + w.use + '</h3>' + choiceGroup('propertyUse', options, answers.propertyUse) : '<p class="dt-book-fact">Property use: <strong>Investment</strong></p>'), 'Continue', stepGoal);
      wireChoices(panel, answers, changed);
      panel.querySelector('[data-book="state"]').onchange = function (e) { answers.propertyState = e.target.value; changed(); };
      panel.querySelector('.dt-book-next').onclick = function () {
        if (!answers.propertyUse || !answers.propertyState) { setErr('Please answer each question to continue.'); return; }
        var area = window.DTServiceArea.check(answers.propertyUse, answers.propertyState, ctx, answers.bookingGoal);
        // Keep all four steps and collect the acknowledged inquiry before the
        // state decision. Choosing a state must not save or redirect anything.
        if (area === 'incomplete') { setErr('Please choose the property state.'); return; }
        stepType();
      };
    }
    // 22 Oct (Max): a property outside the service area is recorded as a Sheet-only
    // inquiry even when a knockout answer fails, so Darren can see demand by state.
    // Inside the service area the knockouts still decline without posting.
    function outsideArea() { return window.DTServiceArea.check(answers.propertyUse, answers.propertyState, ctx, answers.bookingGoal) === 'out-of-market'; }
    function stepType() {
      draw(1, 'Property · 2 of 3', 'What type of property is it?', '', choiceGroup('propertyType', [['single-family-condo', 'Single family or condo'], ['2-4-units', '2 to 4 units'], ['mobile-land', 'Mobile home or land']], answers.propertyType), 'Continue', stepProperty);
      wireChoices(panel, answers, changed);
      panel.querySelector('.dt-book-next').onclick = function () {
        if (!answers.propertyType) { setErr('Please choose the property type.'); return; }
        if (answers.propertyType === 'mobile-land' && !outsideArea()) { decline('property-type'); return; }
        stepHistory();
      };
    }
    function stepHistory() {
      draw(1, 'Property · 3 of 3', 'Two quick questions.', '', '<h3 class="dt-book-q">Is your mortgage current?</h3>' + choiceGroup('mortgageCurrent', [['yes', 'Yes'], ['no', 'No'], ['no-mortgage', 'No mortgage yet']], answers.mortgageCurrent) + '<h3 class="dt-book-q">Any bankruptcy or foreclosure in the last 4 years?</h3>' + choiceGroup('recentBankruptcyForeclosure', [['no', 'No'], ['yes', 'Yes']], answers.recentBankruptcyForeclosure), 'Continue', stepType);
      wireChoices(panel, answers, changed);
      panel.querySelector('.dt-book-next').onclick = function () {
        if (!answers.mortgageCurrent || !answers.recentBankruptcyForeclosure) { setErr('Please answer both to continue.'); return; }
        if (answers.mortgageCurrent === 'no' && !outsideArea()) { decline('mortgage'); return; }
        if (answers.recentBankruptcyForeclosure === 'yes' && !outsideArea()) { decline('bankruptcy-foreclosure'); return; }
        stepContact();
      };
    }
    function stepContact() {
      var note = answers.bookingGoal === 'not-sure' ? '' : '<label class="dt-book-field">Anything you’d like Darren to know? (optional)<textarea class="dt-book-situation" name="message" rows="3" maxlength="2000" aria-describedby="dt-book-message-help">' + esc(contact.message) + '</textarea></label><p id="dt-book-message-help" class="dt-book-note">Up to 2,000 characters. Please leave out account numbers, Social Security numbers and other sensitive details.</p>';
      draw(2, 'Contact details', 'Where should Darren reach you?', 'Your contact details stay here while you review your answers.', '<form novalidate><div class="dt-book-contact-details"><div class="dt-book-row"><label class="dt-book-field">First name<input name="firstName" autocomplete="given-name" required value="' + esc(contact.firstName) + '"></label><label class="dt-book-field">Last name<input name="lastName" autocomplete="family-name" required value="' + esc(contact.lastName) + '"></label></div><label class="dt-book-field">Email<input name="email" type="email" autocomplete="email" required value="' + esc(contact.email) + '"></label><label class="dt-book-field">Phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="14" placeholder="(714) 000-0000" required value="' + esc(contact.phone) + '"></label></div><div class="dt-book-consents" hidden>' +
        note + '<label class="dt-book-check dt-book-check-req"><input type="checkbox" name="privacy" required' + (contact.privacy ? ' checked' : '') + '> <span>I acknowledge the <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/legal" target="_blank" rel="noopener">Terms &amp; Legal Disclosures</a>. (Required)</span></label>' +
        '<label class="dt-book-check"><input type="checkbox" name="smsInfo"' + (contact.smsInfo ? ' checked' : '') + '> <span>' + esc(SMS_INFO_TEXT) + SMS_LINKS + '</span></label>' +
        '<label class="dt-book-check"><input type="checkbox" name="smsMarketing"' + (contact.smsMarketing ? ' checked' : '') + '> <span>' + esc(SMS_MARKETING_TEXT) + SMS_LINKS + '</span></label>' +
        '<p class="dt-book-note dt-book-note-sms">Text messages are optional and not a condition of purchase or of submitting this form.</p>' +
        '<p class="dt-book-note">Submitting records your inquiry and checks service availability. Calendar access depends on the property and your answers. Darren Tsai (NMLS #2438102 · CA DRE #02103705), Ren Marketing Group LLC / Saxton Mortgage. Not a loan application, approval or commitment to lend. Equal Housing Opportunity.</p></div><p class="dt-book-err" role="alert"></p><div class="dt-book-actions"><button type="button" class="dt-book-link dt-book-back">Back</button><button type="submit" class="dt-book-next">Review preferences</button></div></form>', '');
      var form = panel.querySelector('form');
      var consentVisible = false;
      contactView = function (show) {
        consentVisible = show;
        form.querySelector('.dt-book-contact-details').hidden = show;
        form.querySelector('.dt-book-consents').hidden = !show;
        panel.querySelector('.dt-book-title').textContent = show ? 'Review your preferences.' : 'Where should Darren reach you?';
        panel.querySelector('.dt-book-sub').textContent = show ? 'Text messages are optional. Both choices start unchecked.' : 'Your contact details stay here while you review your answers.';
        panel.querySelector('.dt-book-meta span:last-child').textContent = show ? 'Contact preferences' : 'Contact details';
        form.querySelector('.dt-book-next').textContent = show ? COPY.submit : 'Review preferences';
        setErr(''); focusPanel();
      };
      form.elements.phone.addEventListener('input', function (e) { e.target.value = formatPhone(e.target.value); });
      form.addEventListener('input', rememberContact);
      form.addEventListener('change', rememberContact);
      form.querySelector('.dt-book-back').onclick = function () {
        if (busy) return;
        rememberContact();
        if (consentVisible) contactView(false); else stepHistory();
      };
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        rememberContact();
        var f = form.elements;
        if (!f.firstName.value.trim() || !f.lastName.value.trim() || !f.email.value.trim() || !f.phone.value.trim()) { setErr('Please fill in your name, email and phone.'); return; }
        if (!validEmail(f.email.value)) { contactView(false); setErr('Please enter a valid email address.'); f.email.focus(); return; }
        if (!validPhone(f.phone.value)) { contactView(false); setErr('Please enter a valid US phone number.'); f.phone.focus(); return; }
        if (!consentVisible) { contactView(true); return; }
        submit(form);
      });
    }

    function submit(form) {
      var f = form.elements;
      var val = function (n) { return String(f[n].value || '').trim(); };
      if (!val('firstName') || !val('lastName') || !val('email') || !val('phone')) { setErr('Please fill in your name, email and phone.'); return; }
      if (!validEmail(val('email'))) { setErr('Please enter a valid email address.'); f.email.focus(); return; }
      if (!validPhone(val('phone'))) { setErr('Please enter a valid US phone number.'); f.phone.focus(); return; }
      if (!f.privacy.checked) { setErr('Please acknowledge the Privacy Policy and Terms to continue.'); f.privacy.focus(); return; }
      if (busy) return;
      busy = true; updateProgress();
      setErr('');
      var btn = form.querySelector('.dt-book-next');
      btn.disabled = true;
      btn.textContent = 'Saving your request...';
      var saveStatus = document.createElement('p');
      saveStatus.className = 'dt-book-calendar-help dt-book-save-status';
      saveStatus.setAttribute('role', 'status');
      saveStatus.textContent = 'Saving your details and checking your property. This can take a few seconds.';
      form.appendChild(saveStatus);
      form.setAttribute('aria-busy', 'true');
      var area = window.DTServiceArea.check(answers.propertyUse, answers.propertyState, ctx, answers.bookingGoal);
      var lead = {
        firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'),
        state: answers.propertyState,
        source: bookingBucket(answers.bookingGoal, source), entrySource: source, formId: FORM_ID, magnet: 'Booking prequal',
        bookingGoal: answers.bookingGoal, reviewFlag: REVIEW_GOALS.indexOf(answers.bookingGoal) !== -1 ? 'Yes' : '',
        propertyUse: answers.propertyUse, propertyState: answers.propertyState,
        serviceAreaResult: area, serviceAreaVersion: window.DTServiceArea.version(),
        propertyType: answers.propertyType, mortgageCurrent: answers.mortgageCurrent,
        recentBankruptcyForeclosure: answers.recentBankruptcyForeclosure,
        privacyAcknowledged: true, privacyVersion: PRIVACY_VERSION,
        smsInformationalConsent: !!f.smsInfo.checked, smsInformationalConsentText: SMS_INFO_TEXT,
        smsMarketingConsent: !!f.smsMarketing.checked, smsConsent: !!f.smsMarketing.checked,
        smsConsentText: SMS_MARKETING_TEXT, smsConsentVersion: SMS_CONSENT_VERSION,
        smsConsentAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };
      var inquiryMessage = answers.bookingGoal === 'not-sure' ? answers.situation.trim() : contact.message.trim();
      if (inquiryMessage.length > 2000) { busy = false; btn.disabled = false; setErr('Please keep your message within 2,000 characters.'); return; }
      if (inquiryMessage || answers.bookingGoal === 'not-sure') lead.message = inquiryMessage;
      var attr = {};
      try { attr = window.DT && window.DT.attr ? window.DT.attr() : {}; } catch (e2) { attr = {}; }
      var body = {};
      var k;
      for (k in attr) if (Object.prototype.hasOwnProperty.call(attr, k)) body[k] = attr[k];
      for (k in lead) if (Object.prototype.hasOwnProperty.call(lead, k)) body[k] = lead[k];

      var fail = function (message) {
        busy = false; updateProgress();
        form.removeAttribute('aria-busy');
        if (saveStatus.parentNode) saveStatus.parentNode.removeChild(saveStatus);
        btn.disabled = false;
        btn.textContent = COPY.submit;
        setErr(message, false);
      };
      window.DTLead.submit(FORM_ID, body)
        .then(function (res) {
          if (res.ok) return res.clone().json().then(function (receipt) { return { ok: true, response: res, body: receipt }; });
          return res.json().then(function (j) { return { ok: false, status: res.status, body: j }; }, function () { return { ok: false, status: res.status, body: null }; });
        })
        .then(function (r) {
          if (r.ok) {
            // DTLead already verified the saved submission ID. The additive
            // writer disposition is required before a recorded-only redirect;
            // a generic saved receipt must never masquerade as this outcome.
            if (r.body.disposition === 'sheet-only') {
              if (area !== 'out-of-market') { fail('We couldn’t confirm the next step for your request. Retry here with the same details.'); return; }
              observeError('policy_exit');
              // #recorded shows the page's "your inquiry is recorded" note (CSS
              // :target); calculator exits that saved nothing never carry it.
              window.location.assign(outOfMarketPage(answers.propertyUse) + '#recorded');
              return;
            }
            if (area !== 'supported') { fail('We couldn’t confirm whether your inquiry was recorded. Retry here with the same details.'); return; }
            identify({ name: lead.firstName + ' ' + lead.lastName, email: lead.email });
            // The one website form conversion. Once, and only for a qualified
            // lead the server confirmed. user_data is attached only after
            // consent (DT.userData), for the Google tag to hash as enhanced
            // conversions; it is never a GA4 event parameter.
            var conversion = Object.assign({}, window.DTLead.attribution(FORM_ID, r.response), { lead_source: lead.source, form_id: FORM_ID, page_path: window.location.pathname });
            var ud;
            try { ud = window.DT && window.DT.userData ? window.DT.userData(lead) : undefined; } catch (e3) { ud = undefined; }
            if (ud) conversion.user_data = ud;
            if (window.DTLead.claimConversion(FORM_ID, r.response)) track('generate_lead', conversion);
            showCalendar(lead);
            return;
          }
          // A rejected/old endpoint has not confirmed a Sheet-only record.
          // Stay here so the visitor can correct answers or retry safely.
          if (r.status === 422 && r.body && r.body.field === 'propertyState') {
            fail(r.body.message || 'We couldn’t record this inquiry. Please review your property answers and try again.');
            return;
          }
          if (r.status === 422 && r.body && r.body.field === 'prequal') { decline('server'); return; }
          if ((r.status === 422 || r.status === 429 || r.status === 409) && r.body && r.body.message) { fail(r.body.message); if (r.body.field === 'email' && contactView) { contactView(false); btn.textContent = 'Review preferences'; setErr(r.body.message); form.elements.email.focus(); } return; }
          // A server error can mean a delayed write or a rescue attempt. It
          // cannot prove delivery, so do not claim Darren received anything or
          // encourage an immediate duplicate submission. No calendar is shown.
          fail('We couldn’t confirm whether your request was saved. Retry here with the same details to safely check it again.');
        }, function () {
          fail('We couldn’t confirm your request. Check your connection and retry here with the same details.');
        });
    }

    function showCalendar(lead) {
      stage = 3; reached = 3; busy = false;
      updateProgress();
      renderCalendar(panel, lead, '');
      focusPanel();
    }
    function decline(reason) {
      busy = false;
      var why = reason === 'property-type' ? 'Darren does not finance mobile homes or land, so a call would not be the best use of your time.' : 'Based on your answers, a call with Darren is not the right next step just yet.';
      draw(1, 'Property check', 'Thanks for checking', why + ' You are welcome to keep exploring your numbers with the free calculators.', '<a class="dt-book-call" href="/">Explore the calculators</a>', 'Review answers', stepType);
      reached = 1; updateProgress();
      panel.querySelector('.dt-book-next').onclick = stepProperty;
      track('booking_prequal_declined', { reason: reason, page_path: window.location.pathname });
    }
    // Draw the step-1 tracker now rather than on the first draw(). On phones it
    // sits above the panel, and filling it only after the service-area policy
    // arrives pushed the question down: live Lighthouse CLS 0.23 on /book/
    // mobile (26 Oct 2026). draw() repaints the identical markup.
    updateProgress();
    window.DTServiceArea.whenReady(stepGoal, function () {
      draw(0, '', 'Book a Call', 'The property check could not load. Please refresh the page and try again.', '', '');
    });
  }

  /**
   * The calendar, for a lead that has passed and been saved. Shared by this
   * flow and by /home-equity/, which asks the same questions as its own steps
   * (DTBooking.calendar). While BOOKING_URL is the placeholder, the Call button
   * and a plain "Darren has your details" stand in for it.
   */
  function renderCalendar(card, lead, headerAction) {
    injectStyles();
    var call = '<a class="dt-book-call" href="' + PHONE_HREF + '"><span>Prefer to talk now? Call <span class="dt-book-nowrap">' + PHONE_DISPLAY + '</span></span></a>';
    if (!BOOKING_READY) {
      card.innerHTML = '<div class="dt-book-calendar-heading"><h2 class="dt-book-title">You\'re all set, ' + esc(lead.firstName) + '</h2>' + (headerAction || '') + '</div>' +
        '<p class="dt-book-sub">Darren has your details and will call you to set a time.</p>' + call;
      refreshCallNumber(card);
      return;
    }
    // Google's embed has no documented HubSpot-style prefill parameters.
    // Keep names and emails out of the third-party iframe URL.
    card.classList.add('dt-cal');
    card.innerHTML = '<div class="dt-book-calendar-heading"><h2 class="dt-book-title">Pick a time, ' + esc(lead.firstName) + '</h2>' + (headerAction || '') + '</div>' +
      '<p class="dt-book-sub">Your request is saved. Choose a time for your 15-minute qualification call with Darren.</p>' +
      '<p class="dt-book-calendar-help dt-book-calendar-status" role="status">Your request is saved. Loading Google Calendar...</p>' +
      '<div class="dt-book-frame"><iframe src="' + esc(BOOKING_URL) + '" title="Book a qualification call with Darren Tsai" width="100%" height="680" referrerpolicy="strict-origin" loading="eager"></iframe></div>' +
      '<p class="dt-book-calendar-help">Google Calendar will ask you to confirm your booking details. If the calendar does not load, open it in a new tab.</p>' +
      '<a class="dt-book-calendar-link" href="' + esc(BOOKING_URL) + '" target="_blank" rel="noopener noreferrer">Open calendar in a new tab</a>' + call;
    // The saved receipt and Google's network request are separate waits. Do
    // not prefetch the calendar while the visitor is still answering. A frame
    // load means only that Google responded, never an appointment confirmation.
    var frame = card.querySelector('iframe');
    frame.addEventListener('load', function () {
      var loading = card.querySelector('.dt-book-calendar-status');
      if (loading) loading.textContent = 'Choose a time below. You can also open the calendar in a new tab.';
    });
    track('booking_page_shown', { page_path: window.location.pathname });
    refreshCallNumber(card);
  }

  /** For a page that ran the prequal itself: draw the calendar inline in `el`. */
  function calendar(el, lead) {
    if (!el || !lead) return false;
    var saved = savedContinuation();
    if (!saved || saved.disposition === 'sheet-only') return false;
    el.classList.add('dt-book-inline');
    el.innerHTML = '<div class="dt-book-card"></div>';
    renderCalendar(el.querySelector('.dt-book-card'), saved, '');
    return true;
  }

  /** Every completed capture advances to scheduling, without another opt-in. */
  function afterSubmit(host) {
    if (!host || host.querySelector('.dcp-recap-calendar')) return;
    try {
    var slot = document.createElement('div');
    slot.className = 'dcp-recap-calendar';
    if (!calendar(slot, {})) return;
    host.insertBefore(slot, host.firstChild);
    host.classList.add('dt-calendar-success');
    // Keep the original recovery action if a saved receipt cannot be reused.
    // Only a validated, supported receipt may replace the legacy success CTA.
    var oldAction = host.querySelector('#openLeadBookingBtn, #openSuccessBookingBtn');
    if (oldAction) oldAction.hidden = true;
    var heading = host.querySelector('h3');
    if (heading) heading.hidden = true;
    var check = host.querySelector('.success-check, .check');
    if (check) check.hidden = true;
    var title = slot.querySelector('.dt-book-title');
    if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
    } catch (e) { /* Scheduling display must never turn a confirmed save into a submission error. */ }
  }

  function close() {
    if (!overlay) return;
    var node = overlay;
    overlay = null;
    savedOverlay = node;
    node.classList.remove('dt-open');
    if (node.parentNode) node.parentNode.removeChild(node);
    document.body.classList.remove('dt-booking-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !overlay) return;
    var nodes = overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
    var visible = Array.prototype.filter.call(nodes, function (el) { return el.getClientRects().length && !el.closest('[hidden]'); });
    if (!visible.length) return;
    var first = visible[0], last = visible[visible.length - 1];
    if (e.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  function loadingCard(card) {
    card.innerHTML = '<h2 class="dt-book-title">Book a Call</h2><p class="dt-book-sub dt-book-loading" role="status" aria-live="polite">Loading the property check...</p>';
  }

  /** Opens the flow in a panel. Every booking and Call button lands here. */
  function open() {
    if (overlay) return;
    // /book/ already owns this same flow. Footer links must return to its
    // existing answers instead of opening a second questionnaire over it.
    var inline = document.getElementById('dt-book-mount');
    if (/^\/book\/?$/.test(window.location.pathname) && inline) {
      var heading = inline.querySelector('.dt-book-title');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      if (inline.scrollIntoView) inline.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    // The completed equity/payoff page already has a calendar. Reuse its
    // rendered frame too, rather than load another Google frame in a dialog.
    var recap = document.querySelector('.dcp-recap-calendar .dt-book-card');
    var existing = savedContinuation();
    if (recap && existing && existing.disposition !== 'sheet-only') {
      var title = recap.querySelector('.dt-book-title');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
      if (recap.scrollIntoView) recap.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (!window.DTServiceArea) { window.location.assign('/book/'); return; }
    injectStyles();
    lastFocus = document.activeElement;
    // Mobile booking closes its navigation drawer. Returning focus to that
    // now-hidden trigger strands keyboard users, so restore the visible menu.
    if (lastFocus && lastFocus.closest && lastFocus.closest('.nav-mobile-menu')) lastFocus = document.querySelector('.nav-hamburger') || lastFocus;
    var continuation = savedContinuation();
    if (continuation && continuation.disposition === 'sheet-only') { window.location.assign(outOfMarketPage(continuation.propertyUse) + '#recorded'); return; }
    var resume = !!savedOverlay && !continuation;
    overlay = savedOverlay || document.createElement('div');
    savedOverlay = null;
    overlay.className = 'dt-book-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Book a Call');
    if (!resume) overlay.innerHTML = '<div class="dt-book-card"></div>';
    var card = overlay.querySelector('.dt-book-card');
    if (!resume) loadingCard(card);
    if (!resume) overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.classList.add('dt-booking-open');
    if (!resume) window.DTServiceArea.whenReady(function () { if (!continueSaved(card)) start(card, false); }, function () { start(card, false); });
    window.setTimeout(function () {
      if (!overlay || !overlay.contains(card)) return;
      overlay.classList.add('dt-open');
      var first = card.querySelector('.dt-book-title') || card.querySelector('button, select, input');
      if (first && first.classList.contains('dt-book-title')) first.setAttribute('tabindex', '-1');
      if (!overlay.contains(document.activeElement) && first && first.focus) first.focus();
    }, 10);
  }

  /** Renders the flow inline, for /book/. */
  function mount(el) {
    if (!el || !window.DTServiceArea) return;
    var copies = document.querySelectorAll('[data-booking-when]');
    for (var c = 0; c < copies.length; c++) copies[c].textContent = COPY.when;
    injectStyles();
    el.classList.add('dt-book-inline');
    el.innerHTML = '<div class="dt-book-card"></div>';
    var card = el.querySelector('.dt-book-card');
    loadingCard(card);
    window.DTServiceArea.whenReady(function () { if (!continueSaved(card)) start(card, true); }, function () { start(card, true); });
  }

  /**
   * Google appointment scheduling does not document a booking-success message
   * for this iframe. An open, load or arbitrary postMessage is not a booking.
   * Keep booking_page_shown as observation only; meeting_booked needs a verified
   * provider/server confirmation before it can be emitted again.
   */

  /**
   * Tell the flow who this visitor is, after a form has already asked them.
   * An empty call clears it, storage included, so one visitor's name cannot sit
   * in the next one's contact step.
   */
  function identify(lead) {
    if (!lead || (!lead.email && !lead.name)) { knownLead = null; savedOverlay = null; writeLead(null); return; }
    knownLead = {};
    if (lead.name) knownLead.name = String(lead.name).trim();
    if (lead.email) knownLead.email = String(lead.email).trim();
    writeLead(knownLead);
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href="/book/"]');
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    event.preventDefault();
    open();
  });

  // preload is kept so existing callers do not break; nothing is worth
  // fetching before the prequal passes.
  window.DTBooking = { open: open, close: close, mount: mount, calendar: calendar, afterSubmit: afterSubmit, preload: function () {}, identify: identify };
  // Load the small local stylesheet before the visitor reaches a booking CTA.
  // This has no tracking or third-party request and works after rejection too.
  injectStyles();
  window.dispatchEvent(new Event('dt:booking-ready'));
})();
