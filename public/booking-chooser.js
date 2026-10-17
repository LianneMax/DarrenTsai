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
 *   1. property use (primary, second home, rental), property state (service-area
 *      policy v3), property type
 *   2. Darren's two knockouts: mortgage current, and no bankruptcy or
 *      foreclosure in the last 4 years
 *   3. contact details, the required privacy box and the two optional SMS boxes
 *   4. POST /api/lead. Only after a confirmed receipt: the calendar,
 *      plus a Call button.
 * An unsupported state goes to /out-of-market-primary/ or /out-of-market-dscr/.
 * A knockout gets a short, kind decline. A fail shows no calendar and no phone
 * number, and nothing is posted: lead.mts refuses a failing booking-prequal
 * lead too, so a hand-built request cannot book around this either.
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
  var lastFocus = null;

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
  }

  /**
   * One visitor's answers, for the life of one open flow. Never stored: only
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
    var answers = newAnswers();
    var source = pageSource();
    var ctx = source + ' ' + FORM_ID;

    function setErr(msg) { var el = card.querySelector('.dt-book-err'); if (el) el.textContent = msg || ''; }
    function closeLink() { return inline ? '' : '<button type="button" class="dt-book-link dt-book-close">Close</button>'; }
    function wireClose() { var c = card.querySelector('.dt-book-close'); if (c) c.addEventListener('click', close); }

    /**
     * Step 1. The goal comes first and decides which property is asked about
     * and which rule applies (policy v3, 15 Oct 2026): for an equity loan, the
     * home being borrowed against (where the cash goes is not asked); for DSCR
     * or commercial, the investment property; otherwise the home they will
     * live in. Commercial and "Not sure yet" are flagged for Darren.
     */
    function stepProperty() {
      card.classList.remove('dt-cal');
      var goal = answers.bookingGoal;
      var html =
        '<p class="dt-book-step">Step 1 of 3</p>' +
        '<h2 class="dt-book-title">Book a Call</h2>' +
        '<p class="dt-book-sub">Three quick steps, mostly taps. They check that Darren can help with your property ' + COPY.when + '.</p>' +
        '<p class="dt-book-q">What would you like help with?</p>' +
        choiceGroup('bookingGoal', GOAL_OPTIONS, goal);
      if (goal === 'not-sure') {
        html += '<label class="dt-book-field" for="dt-book-situation">Tell Darren a little about your situation (required)</label>' +
          '<textarea class="dt-book-situation" id="dt-book-situation" rows="3" maxlength="2000" required aria-describedby="dt-book-situation-help">' + esc(answers.situation) + '</textarea>' +
          '<p class="dt-book-calendar-help" id="dt-book-situation-help">A sentence or two about your goal or question helps Darren prepare. Please leave out account numbers and other sensitive details.</p>';
      }
      if (goal) {
        var uses = window.DTServiceArea.uses(ctx, goal);
        if (uses.indexOf(answers.propertyUse) === -1) answers.propertyUse = uses.length === 1 ? uses[0] : '';
        var w = GOAL_WORDING[goal];
        var useOpts = [];
        if (uses.indexOf('primary') !== -1) useOpts.push(['primary', 'Primary home']);
        if (uses.indexOf('second-home') !== -1) useOpts.push(['second-home', 'Second home']);
        if (uses.indexOf('investment') !== -1) useOpts.push(['investment', 'Rental']);
        var states = window.DTServiceArea.states();
        var stateOpts = '<option value="">Choose a state</option>';
        for (var i = 0; i < states.length; i++) {
          stateOpts += '<option value="' + states[i][0] + '"' + (answers.propertyState === states[i][0] ? ' selected' : '') + '>' + esc(states[i][1]) + '</option>';
        }
        html +=
          '<label class="dt-book-field">' + w.state + '<select data-book="state">' + stateOpts + '</select></label>' +
          (useOpts.length > 1 ? '<p class="dt-book-q">' + w.use + '</p>' + choiceGroup('propertyUse', useOpts, answers.propertyUse) : '') +
          '<p class="dt-book-q">What type of property is it?</p>' +
          choiceGroup('propertyType', [['single-family-condo', 'Single family or condo'], ['2-4-units', '2 to 4 units'], ['mobile-land', 'Mobile home or land']], answers.propertyType);
      }
      html +=
        '<p class="dt-book-err" role="alert"></p>' +
        '<button type="button" class="dt-book-next">Continue</button>' +
        '<div class="dt-book-bar"><span></span>' + closeLink() + '</div>';
      card.innerHTML = html;
      wireChoices(card, answers, function () {
        setErr('');
        // A new goal asks a different property question.
        if (answers.bookingGoal !== goal) stepProperty();
      });
      var stateSel = card.querySelector('[data-book="state"]');
      if (stateSel) stateSel.addEventListener('change', function (e) { answers.propertyState = e.target.value; setErr(''); });
      var situation = card.querySelector('#dt-book-situation');
      if (situation) situation.addEventListener('input', function () { answers.situation = situation.value; situation.removeAttribute('aria-invalid'); setErr(''); });
      wireClose();
      card.querySelector('.dt-book-next').addEventListener('click', function () {
        if (answers.bookingGoal === 'not-sure' && !answers.situation.trim()) {
          setErr('Please tell Darren a little about your situation.');
          situation.setAttribute('aria-invalid', 'true'); situation.focus(); return;
        }
        if (!answers.bookingGoal) { setErr('Please choose what you would like help with.'); return; }
        if (!answers.propertyUse || !answers.propertyState || !answers.propertyType) {
          setErr('Please answer each question to continue.');
          return;
        }
        var area = window.DTServiceArea.check(answers.propertyUse, answers.propertyState, ctx, answers.bookingGoal);
        if (area === 'out-of-market') {
          // Darren's redirect pages: plain words, NMLS lookup, the calculators,
          // and no booking or contact buttons.
          window.location.assign(outOfMarketPage(answers.propertyUse));
          return;
        }
        if (area !== 'supported') { setErr('Please choose the property state.'); return; }
        if (answers.propertyType === 'mobile-land') { decline('property-type'); return; }
        stepHistory();
      });
    }

    function stepHistory() {
      card.innerHTML =
        '<p class="dt-book-step">Step 2 of 3</p>' +
        '<h2 class="dt-book-title">Two quick questions</h2>' +
        '<p class="dt-book-q">Is your mortgage current?</p>' +
        choiceGroup('mortgageCurrent', [['yes', 'Yes'], ['no', 'No'], ['no-mortgage', 'No mortgage yet']], answers.mortgageCurrent) +
        '<p class="dt-book-q">Any bankruptcy or foreclosure in the last 4 years?</p>' +
        choiceGroup('recentBankruptcyForeclosure', [['no', 'No'], ['yes', 'Yes']], answers.recentBankruptcyForeclosure) +
        '<p class="dt-book-err" role="alert"></p>' +
        '<button type="button" class="dt-book-next">Continue</button>' +
        '<div class="dt-book-bar"><button type="button" class="dt-book-link dt-book-back">&#8592; Back</button>' + closeLink() + '</div>';
      wireChoices(card, answers, function () { setErr(''); });
      wireClose();
      card.querySelector('.dt-book-back').addEventListener('click', stepProperty);
      card.querySelector('.dt-book-next').addEventListener('click', function () {
        if (!answers.mortgageCurrent || !answers.recentBankruptcyForeclosure) { setErr('Please answer both to continue.'); return; }
        if (answers.mortgageCurrent === 'no') { decline('mortgage'); return; }
        if (answers.recentBankruptcyForeclosure === 'yes') { decline('bankruptcy-foreclosure'); return; }
        stepContact();
      });
    }

    function stepContact() {
      var first = '';
      var last = '';
      if (knownLead && knownLead.name) {
        var parts = knownLead.name.split(/\s+/);
        first = parts.shift() || '';
        last = parts.join(' ');
      }
      card.innerHTML =
        '<p class="dt-book-step">Step 3 of 3</p>' +
        '<h2 class="dt-book-title">Where should Darren reach you?</h2>' +
        '<form novalidate>' +
        '<div class="dt-book-row">' +
        '<label class="dt-book-field">First name<input name="firstName" autocomplete="given-name" required value="' + esc(first) + '"></label>' +
        '<label class="dt-book-field">Last name<input name="lastName" autocomplete="family-name" required value="' + esc(last) + '"></label>' +
        '</div>' +
        '<label class="dt-book-field">Email<input name="email" type="email" autocomplete="email" required value="' + esc(knownLead && knownLead.email) + '"></label>' +
        '<label class="dt-book-field">Phone<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="14" placeholder="(714) 000-0000" required></label>' +
        '<label class="dt-book-check dt-book-check-req"><input type="checkbox" name="privacy" required> <span>I acknowledge the <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/legal" target="_blank" rel="noopener">Terms &amp; Legal Disclosures</a>. (Required)</span></label>' +
        '<label class="dt-book-check"><input type="checkbox" name="smsInfo"> <span>' + esc(SMS_INFO_TEXT) + SMS_LINKS + '</span></label>' +
        '<label class="dt-book-check"><input type="checkbox" name="smsMarketing"> <span>' + esc(SMS_MARKETING_TEXT) + SMS_LINKS + '</span></label>' +
        '<p class="dt-book-note dt-book-note-sms">Text messages are optional and not a condition of purchase or of submitting this form.</p>' +
        '<p class="dt-book-note">Submitting requests a mortgage review from Darren Tsai (NMLS #2438102 · CA DRE #02103705), Ren Marketing Group LLC / Saxton Mortgage. Not a loan application, approval or commitment to lend. Equal Housing Opportunity.</p>' +
        '<p class="dt-book-err" role="alert"></p>' +
        '<button type="submit" class="dt-book-next">' + esc(COPY.submit) + '</button>' +
        '</form>' +
        '<div class="dt-book-bar"><button type="button" class="dt-book-link dt-book-back">&#8592; Back</button>' + closeLink() + '</div>';
      wireClose();
      card.querySelector('.dt-book-back').addEventListener('click', stepHistory);
      var form = card.querySelector('form');
      // Formats as it is typed, so what is posted is (XXX) XXX-XXXX.
      form.elements.phone.addEventListener('input', function (e) { e.target.value = formatPhone(e.target.value); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
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
      setErr('');
      var btn = form.querySelector('.dt-book-next');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      var lead = {
        firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'),
        state: answers.propertyState,
        source: bookingBucket(answers.bookingGoal, source), entrySource: source, formId: FORM_ID, magnet: 'Booking prequal',
        bookingGoal: answers.bookingGoal, reviewFlag: REVIEW_GOALS.indexOf(answers.bookingGoal) !== -1 ? 'Yes' : '',
        propertyUse: answers.propertyUse, propertyState: answers.propertyState,
        serviceAreaResult: 'supported', serviceAreaVersion: window.DTServiceArea.version(),
        propertyType: answers.propertyType, mortgageCurrent: answers.mortgageCurrent,
        recentBankruptcyForeclosure: answers.recentBankruptcyForeclosure,
        privacyAcknowledged: true, privacyVersion: PRIVACY_VERSION,
        smsInformationalConsent: !!f.smsInfo.checked, smsInformationalConsentText: SMS_INFO_TEXT,
        smsMarketingConsent: !!f.smsMarketing.checked, smsConsent: !!f.smsMarketing.checked,
        smsConsentText: SMS_MARKETING_TEXT, smsConsentVersion: SMS_CONSENT_VERSION,
        smsConsentAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };
      if (answers.bookingGoal === 'not-sure') lead.message = answers.situation.trim();
      var attr = {};
      try { attr = window.DT && window.DT.attr ? window.DT.attr() : {}; } catch (e2) { attr = {}; }
      var body = {};
      var k;
      for (k in attr) if (Object.prototype.hasOwnProperty.call(attr, k)) body[k] = attr[k];
      for (k in lead) if (Object.prototype.hasOwnProperty.call(lead, k)) body[k] = lead[k];

      var fail = function (message) {
        btn.disabled = false;
        btn.textContent = COPY.submit;
        setErr(message);
      };
      window.fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          if (res.ok) return { ok: true };
          return res.json().then(function (j) { return { ok: false, status: res.status, body: j }; }, function () { return { ok: false, status: res.status, body: null }; });
        })
        .then(function (r) {
          if (r.ok) {
            identify({ name: lead.firstName + ' ' + lead.lastName, email: lead.email });
            // The one website form conversion. Once, and only for a qualified
            // lead the server confirmed. user_data is attached only after
            // consent (DT.userData), for the Google tag to hash as enhanced
            // conversions; it is never a GA4 event parameter.
            var conversion = { lead_source: lead.source, form_id: FORM_ID, page_path: window.location.pathname };
            var ud;
            try { ud = window.DT && window.DT.userData ? window.DT.userData(lead) : undefined; } catch (e3) { ud = undefined; }
            if (ud) conversion.user_data = ud;
            track('generate_lead', conversion);
            showCalendar(lead);
            return;
          }
          // The server's own screening said no. Same outcome as on the page.
          if (r.status === 422 && r.body && r.body.field === 'propertyState') {
            window.location.assign(outOfMarketPage(answers.propertyUse));
            return;
          }
          if (r.status === 422 && r.body && r.body.field === 'prequal') { decline('server'); return; }
          if ((r.status === 422 || r.status === 429) && r.body && r.body.message) { fail(r.body.message); return; }
          // Anything else was rescued by email server-side, so the visitor must
          // not be pushed to resubmit. But a receipt we cannot confirm is not a
          // qualified booking either, so no calendar.
          card.innerHTML = '<h2 class="dt-book-title">Thanks, your details reached Darren</h2>' +
            '<p class="dt-book-sub">We could not confirm the booking step, so Darren will reach out to set a time. No need to submit again.</p>' +
            '<div class="dt-book-bar"><span></span>' + closeLink() + '</div>';
          wireClose();
        }, function () {
          fail('We could not reach our server. Check your connection and try again.');
        });
    }

    function showCalendar(lead) {
      renderCalendar(card, lead, '<div class="dt-book-bar"><span></span>' + closeLink() + '</div>');
      wireClose();
    }

    function decline(reason) {
      card.classList.remove('dt-cal');
      var why = reason === 'property-type'
        ? 'Darren does not finance mobile homes or land, so a call would not be the best use of your time.'
        : 'Based on your answers, a call with Darren is not the right next step just yet.';
      // No calendar and no phone number, on purpose.
      card.innerHTML = '<h2 class="dt-book-title">Thanks for checking</h2>' +
        '<p class="dt-book-sub">' + why + ' You are welcome to keep exploring your numbers with the free calculators.</p>' +
        '<a class="dt-book-call" href="/">Explore the calculators</a>' +
        '<div class="dt-book-bar"><span></span>' + closeLink() + '</div>';
      wireClose();
      track('booking_prequal_declined', { reason: reason, page_path: window.location.pathname });
    }

    window.DTServiceArea.whenReady(stepProperty, function () {
      card.innerHTML = '<h2 class="dt-book-title">Book a Call</h2>' +
        '<p class="dt-book-sub">The property check could not load. Please refresh the page and try again.</p>' +
        '<div class="dt-book-bar"><span></span>' + closeLink() + '</div>';
      wireClose();
    });
  }

  /**
   * The calendar, for a lead that has passed and been saved. Shared by this
   * flow and by /home-equity/, which asks the same questions as its own steps
   * (DTBooking.calendar). While BOOKING_URL is the placeholder, the Call button
   * and a plain "Darren has your details" stand in for it.
   */
  function renderCalendar(card, lead, footer) {
    injectStyles();
    var call = '<a class="dt-book-call" href="' + PHONE_HREF + '"><span>Prefer to talk now? Call <span class="dt-book-nowrap">' + PHONE_DISPLAY + '</span></span></a>';
    if (!BOOKING_READY) {
      card.innerHTML = '<h2 class="dt-book-title">You\'re all set, ' + esc(lead.firstName) + '</h2>' +
        '<p class="dt-book-sub">Darren has your details and will call you to set a time.</p>' + call + (footer || '');
      return;
    }
    // Google's embed has no documented HubSpot-style prefill parameters.
    // Keep names and emails out of the third-party iframe URL.
    card.classList.add('dt-cal');
    card.innerHTML = '<h2 class="dt-book-title">Pick a time, ' + esc(lead.firstName) + '</h2>' +
      '<p class="dt-book-sub">Your request is saved. Choose a time for your 15-minute qualification call with Darren.</p>' +
      '<div class="dt-book-frame"><iframe src="' + esc(BOOKING_URL) + '" title="Book a qualification call with Darren Tsai" width="100%" height="680" referrerpolicy="strict-origin" loading="eager"></iframe></div>' +
      '<p class="dt-book-calendar-help">Google Calendar will ask you to confirm your booking details. If the calendar does not load, open it in a new tab.</p>' +
      '<a class="dt-book-calendar-link" href="' + esc(BOOKING_URL) + '" target="_blank" rel="noopener noreferrer">Open calendar in a new tab</a>' + call + (footer || '');
    track('booking_page_shown', { page_path: window.location.pathname });
  }

  /** For a page that ran the prequal itself: draw the calendar inline in `el`. */
  function calendar(el, lead) {
    if (!el || !lead) return;
    el.classList.add('dt-book-inline');
    el.innerHTML = '<div class="dt-book-card"></div>';
    renderCalendar(el.querySelector('.dt-book-card'), lead, '');
  }

  function close() {
    if (!overlay) return;
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

  function loadingCard(card) {
    card.innerHTML = '<h2 class="dt-book-title">Book a Call</h2><p class="dt-book-sub">Loading the property check...</p>';
  }

  /** Opens the flow in a panel. Every booking and Call button lands here. */
  function open() {
    if (overlay) return;
    if (!window.DTServiceArea) { window.location.assign('/book/'); return; }
    injectStyles();
    lastFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'dt-book-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Book a Call');
    overlay.innerHTML = '<div class="dt-book-card"></div>';
    var card = overlay.querySelector('.dt-book-card');
    loadingCard(card);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    start(card, false);
    window.setTimeout(function () {
      if (overlay) overlay.classList.add('dt-open');
      var first = card.querySelector('button, select, input');
      if (first && first.focus) first.focus();
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
    start(card, true);
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
    if (!lead || (!lead.email && !lead.name)) { knownLead = null; writeLead(null); return; }
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
  window.DTBooking = { open: open, close: close, mount: mount, calendar: calendar, preload: function () {}, identify: identify };
})();
