/* Static entries share the React navigation's generated markup, without mounting
   another application over their calculators. Booking still uses the one screened
   chooser, and closing the drawer restores a visible trigger for keyboard users. */
(function () {
  'use strict';
  var host = document.querySelector('.static-navigation');
  if (!host) return;
  var nav = host.querySelector('.nav');
  var toggle = host.querySelector('.nav-hamburger');
  var drawer = host.querySelector('.nav-mobile-menu');
  var dropdown = host.querySelector('.nav-dropdown');
  var calculator = host.querySelector('.nav-dropdown-trigger');
  var overlay = document.createElement('div');
  overlay.className = 'nav-mobile-overlay';
  overlay.hidden = true;
  host.append(overlay);
  function closeCalculator() {
    dropdown.classList.remove('nav-dropdown--open');
    calculator.setAttribute('aria-expanded', 'false');
  }
  function menu(open) {
    nav.classList.toggle('nav-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.classList.toggle('nav-mobile-menu--open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    drawer.querySelectorAll('a,button').forEach(function (el) { el.tabIndex = open ? 0 : -1; });
    host.querySelectorAll('.nav-hamburger-bar').forEach(function (el) { el.classList.toggle('open', open); });
    overlay.hidden = !open;
  }
  host.addEventListener('click', function (event) {
    var target = event.target.closest('a,button');
    if (!target) return;
    if (target === toggle) { menu(toggle.getAttribute('aria-expanded') !== 'true'); return; }
    if (target === calculator) {
      var open = calculator.getAttribute('aria-expanded') !== 'true';
      dropdown.classList.toggle('nav-dropdown--open', open);
      calculator.setAttribute('aria-expanded', String(open));
      return;
    }
    if (target.matches('[data-early="nav-contact"],[data-early="nav-book"],.nav-mobile-menu>.btn')) {
      event.preventDefault();
      var mobile = drawer.contains(target);
      menu(false); closeCalculator();
      if (mobile) toggle.focus();
      if (window.DTBooking) window.DTBooking.open();
      else location.href = '/book/';
    } else if (drawer.contains(target)) menu(false);
  });
  overlay.addEventListener('click', function () { menu(false); toggle.focus(); });
  // Match the React header: a drawer opened on a tablet must not reappear
  // with stale expanded state after visiting desktop width and shrinking back.
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1024) menu(false);
  }, { passive: true });
  document.addEventListener('click', function (event) { if (!dropdown.contains(event.target)) closeCalculator(); });
  host.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (toggle.getAttribute('aria-expanded') === 'true') { menu(false); toggle.focus(); }
      else { closeCalculator(); calculator.focus(); }
    }
  });
})();
