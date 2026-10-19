/* Presentation only. The existing guide handler owns validation and delivery;
   Continue moves between the original fields without sending a request. */
(function () {
  'use strict';
  var overlay = document.getElementById('reiGuideOverlay');
  var panel = overlay.querySelector('.rei-guide-panel');
  var steps = Array.from(overlay.querySelectorAll('[data-rei-step]'));
  var timeline = Array.from(overlay.querySelectorAll('.rei-guide-timeline li'));
  var back = document.getElementById('reiGuideBack');
  var next = document.getElementById('reiGuideNext');
  var fields = document.getElementById('formFields');
  var success = document.getElementById('leadSuccess');
  var step = 0;
  var returnFocus = null;
  function showStep(index) {
    step = index;
    steps.forEach(function (item, i) { item.hidden = i !== index; });
    timeline.forEach(function (item, i) {
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('done', i < index);
    });
    back.hidden = index === 0;
    next.hidden = index === 2;
    document.getElementById('reiGuideCount').textContent = 'Step ' + (index + 1) + ' of 3';
    steps[index].querySelector('h3').focus();
  }
  function close() {
    overlay.hidden = true;
    document.body.classList.remove('rei-guide-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function open(event) {
    if (event) event.preventDefault();
    returnFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('rei-guide-open');
    fields.classList.remove('hide');
    success.classList.remove('show');
    overlay.classList.remove('rei-guide-saved');
    var submit = document.getElementById('submitLead');
    submit.disabled = false;
    window.clearErrors();
    var error = overlay.querySelector('.submit-error');
    if (error) error.remove();
    showStep(0);
    panel.scrollTop = 0;
  }
  document.querySelectorAll('[data-rei-guide]').forEach(function (button) { button.addEventListener('click', open); });
  document.getElementById('reiGuideClose').addEventListener('click', close);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
  next.addEventListener('click', function () {
    // Reuse the final submit's original validators; Continue never sends data.
    if (step === 0 && !window.validateReiLeadDetails()) {
      var invalid = steps[0].querySelector('.input-shell.error input,.input-shell.error button');
      if (invalid) invalid.focus();
      return;
    }
    if (step === 1) {
      if (!window.DTServiceArea || !window.DTServiceArea.validate('rei-magnet', true)) return;
    }
    showStep(step + 1);
  });
  back.addEventListener('click', function () { showStep(step - 1); });
  document.addEventListener('keydown', function (event) {
    // Inspect portaled pickers before their document listeners close them.
    // Otherwise the same Escape would close both the picker and this modal.
    if (overlay.hidden || document.querySelector('.cselect-panel.open')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Enter' && event.target.matches('input:not([type=checkbox])') && step < 2) { event.preventDefault(); next.click(); return; }
    if (event.key !== 'Tab') return;
    var controls = Array.from(panel.querySelectorAll('a[href],button,input,select,[tabindex="0"]')).filter(function (el) { return el.getClientRects().length && !el.disabled && el.tabIndex >= 0; });
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  var saved = new MutationObserver(function () {
    var done = success.classList.contains('show');
    overlay.classList.toggle('rei-guide-saved', done);
    if (done) { var heading = success.querySelector('h3'); heading.tabIndex = -1; heading.focus(); }
  });
  saved.observe(success, {attributes:true, attributeFilter:['class']});
  // Close the guide before the original handler opens the shared booking flow.
  document.getElementById('openLeadBookingBtn').addEventListener('click', close, true);
  if (!window.IntersectionObserver) return;
  var tools = document.querySelectorAll('#get-case-study');
  var visible = new window.Set();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    document.body.classList.toggle('rei-tool-active', visible.size > 0);
  });
  tools.forEach(function (tool) { observer.observe(tool); });
})();
