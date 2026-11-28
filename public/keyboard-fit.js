/*
 * Keep the field being typed in visible above a phone's keyboard (28 Nov 2026, Max).
 *
 * Touch devices only. When a text field gets focus, the page is marked
 * html.kb-open (CSS hides the bottom call bar, the booking panel's fixed
 * buttons and the cookie banner while typing, so they cannot sit between the
 * field and the keyboard). Once the keyboard has opened, or whenever the
 * visible area changes size while the field still has focus, the field is
 * scrolled to the middle of what is left of the screen if any part of it is
 * hidden. Nothing is read or sent; this only scrolls.
 *
 * The viewport tag's interactive-widget=resizes-content makes Chrome on
 * Android shrink the page itself when the keyboard opens; iOS Safari ignores
 * that and relies on the visualViewport check below.
 */
(function () {
  'use strict';
  if (window.__dtKeyboardFit) return;
  window.__dtKeyboardFit = true;
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;

  var FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=hidden]), textarea, [contenteditable=""], [contenteditable=true]';
  var root = document.documentElement;
  var vv = window.visualViewport;

  function isField(el) { return !!(el && el.matches && el.matches(FIELD)); }

  function reveal(el) {
    var r = el.getBoundingClientRect();
    var top = vv ? vv.offsetTop : 0;
    var height = vv ? vv.height : window.innerHeight;
    // Room for a sticky header above, and a little air above the keyboard.
    if (r.top >= top + 72 && r.bottom <= top + height - 12) return;
    // Instant, not smooth: the keyboard sliding up is already the motion, and a
    // smooth scroll can be cut short by the page re-laying out as it opens.
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); }
    catch (e) { el.scrollIntoView(false); }
  }

  // Keyboards open at different speeds and browsers report them differently,
  // so for a moment after focus (or a resize) the field is checked every 150 ms
  // rather than trusting a single event. Each check is a cheap measurement.
  var watch = 0;
  function follow(el) {
    var n = 0;
    clearInterval(watch);
    watch = setInterval(function () {
      if (!el.isConnected || document.activeElement !== el || ++n > 10) { clearInterval(watch); return; }
      reveal(el);
    }, 150);
  }

  document.addEventListener('focusin', function (e) {
    if (!isField(e.target)) return;
    root.classList.add('kb-open');
    follow(e.target);
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () { if (!isField(document.activeElement)) root.classList.remove('kb-open'); }, 0);
  });
  // iOS reports the keyboard through visualViewport; Chrome on Android (with
  // interactive-widget=resizes-content) resizes the window itself.
  function onResize() { if (isField(document.activeElement)) follow(document.activeElement); }
  if (vv) vv.addEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
})();
