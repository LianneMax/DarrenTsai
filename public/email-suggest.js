/**
 * Email domain typo check.
 *
 * Why: Resend rejects some addresses outright (422 "Invalid `to` field"). By the
 * time that happens the lead is already saved and the visitor has gone, so the
 * only place to catch a typo is in the form, while they can still fix it. This
 * suggests, never blocks: a wrong guess must not stop a real address.
 *
 * Shared by the three static landing pages and the React app, so the rule lives
 * in one file instead of five copies that drift apart.
 */
(function (root) {
  'use strict';

  // Domains common enough among US mortgage leads to be worth matching against.
  var KNOWN = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com',
    'me.com', 'live.com', 'msn.com', 'comcast.net', 'verizon.net', 'att.net',
    'sbcglobal.net', 'pacbell.net', 'cox.net', 'charter.net', 'ymail.com',
    'protonmail.com', 'protonmail.ch', 'proton.me', 'mail.com', 'earthlink.net', 'frontier.com',
    'roadrunner.com', 'bellsouth.net', 'outlook.co.uk', 'yahoo.co.uk'
  ];

  // Reserved by RFC 2606 / used in docs and tests: mail to these can never be
  // delivered. This is what produced the 422s in the 16 Sep logs.
  var UNDELIVERABLE = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];

  /** Levenshtein distance, capped for speed: we only care about <= 2. */
  function distance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) {
        cur[k] = Math.min(
          prev[k] + 1,
          cur[k - 1] + 1,
          prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /**
   * @returns {null | {kind: 'typo'|'undeliverable', suggestion: string|null, email: string|null}}
   *   null means "nothing to say" — including for any address we are unsure about.
   */
  function check(value) {
    var email = String(value || '').trim();
    var at = email.lastIndexOf('@');
    if (at < 1 || at === email.length - 1) return null; // not finished typing
    var local = email.slice(0, at);
    var domain = email.slice(at + 1).toLowerCase();
    if (domain.indexOf('.') === -1) return null; // still typing the domain

    if (UNDELIVERABLE.indexOf(domain) !== -1) {
      return { kind: 'undeliverable', suggestion: null, email: null };
    }
    if (KNOWN.indexOf(domain) !== -1) return null; // already right

    var best = null;
    var bestScore = 3;
    for (var i = 0; i < KNOWN.length; i++) {
      // Short domains are never suggested against: aim.com is one edit from
      // aol.com and my.com is one edit from me.com, and both are real. On a
      // domain of 9+ characters, two edits can't reach a different real
      // provider, so the suggestion is safe.
      if (KNOWN[i].length < 9) continue;
      var d = distance(domain, KNOWN[i]);
      if (d <= 2 && d < bestScore) { bestScore = d; best = KNOWN[i]; }
    }
    if (!best) return null;
    return { kind: 'typo', suggestion: best, email: local + '@' + best };
  }

  function message(result) {
    if (!result) return '';
    if (result.kind === 'undeliverable') return "That address can't receive email. Please check it.";
    return 'Did you mean ' + result.email + '?';
  }

  root.dtEmailSuggest = { check: check, message: message };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.dtEmailSuggest;

  // Plain-HTML pages: one delegated listener covers every email field, including
  // fields inside modals that do not exist yet at load time. React renders its
  // own hint from check() above, so anything inside #root is left alone here.
  if (typeof document === 'undefined') return;

  function hintFor(input) {
    var el = input.parentNode.querySelector('.email-hint');
    if (!el) {
      el = document.createElement('p');
      el.className = 'email-hint';
      el.style.cssText = 'font-size:13px;line-height:1.4;margin:6px 0 0;color:#b54708;';
      input.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function review(input) {
    var result = check(input.value);
    var el = hintFor(input);
    el.textContent = '';
    if (!result) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (result.kind === 'undeliverable') { el.textContent = message(result); return; }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = message(result);
    btn.style.cssText = 'background:none;border:0;padding:0;color:#b54708;font:inherit;text-decoration:underline;cursor:pointer;';
    btn.addEventListener('click', function () {
      input.value = result.email;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      el.style.display = 'none';
    });
    el.appendChild(btn);
  }

  document.addEventListener('blur', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'email') return;
    if (t.closest && t.closest('#root')) return; // React owns that DOM
    try { review(t); } catch (err) { /* a hint must never break a form */ }
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
