/* Shared illustration control for static DSCR and React home equity. No
   network, storage, attribution or calculator state is involved. */
(function () {
  'use strict';
  function refresh() {
    document.querySelectorAll('[data-house-story]').forEach(function (root) {
      if (root.getAttribute('data-story-ready')) return;
      root.setAttribute('data-story-ready', 'true');
      var paused = false;
      var inView = false;
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      var button = root.querySelector('.property-story-toggle');
      var subject = root.getAttribute('data-house-story') === 'equity' ? 'home equity' : 'rental';
      if (subject === 'rental') {
        var stage = root.querySelector('.property-story-stage');
        var source = root.querySelector('.rent-money-symbol');
        var target = root.querySelector('.payment-vessel-window');
        var cash = root.querySelector('.rent-cash-transfer');
        // Badge widths change with the viewport and loaded font. Measure their
        // actual icon centers only on layout changes, so the note always lands
        // inside the jar without hard-coded label widths or per-frame JS work.
        function alignDeposit() {
          var bounds = stage.getBoundingClientRect();
          var from = source.getBoundingClientRect();
          var to = target.getBoundingClientRect();
          cash.style.setProperty('--rent-start-x', (from.left + from.width / 2 - bounds.left - 16) + 'px');
          cash.style.setProperty('--rent-start-y', (from.top + from.height / 2 - bounds.top - 12) + 'px');
          cash.style.setProperty('--rent-end-x', (to.left + to.width / 2 - bounds.left - 16) + 'px');
          cash.style.setProperty('--rent-end-y', (to.top + to.height / 2 - bounds.top - 12) + 'px');
          root.setAttribute('data-deposit-ready', 'true');
        }
        alignDeposit();
        if (window.ResizeObserver) {
          var layout = new ResizeObserver(alignDeposit);
          layout.observe(stage);
          layout.observe(source.parentElement);
          layout.observe(target.closest('.property-story-label'));
        } else window.addEventListener('resize', alignDeposit);
        if (document.fonts) document.fonts.ready.then(alignDeposit);
      }
      function update() {
        root.setAttribute('data-playing', String(!paused && !reduced.matches && inView && !document.hidden));
        root.setAttribute('data-user-paused', String(paused));
        button.hidden = reduced.matches;
        button.setAttribute('aria-label', (paused ? 'Play ' : 'Pause ') + subject + ' illustration');
      }
      button.addEventListener('click', function () { paused = !paused; update(); });
      document.addEventListener('visibilitychange', update);
      if (reduced.addEventListener) reduced.addEventListener('change', update);
      if (window.IntersectionObserver) {
        var observer = new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; update(); }, {threshold:0.15});
        observer.observe(root);
      }
      // Static content stays complete when observers or animation are absent.
      update();
    });
  }
  document.addEventListener('dt:property-story-mounted', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, {once:true});
  else refresh();
})();
