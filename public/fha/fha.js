/* Presentation only: do not cover the estimator or guide while it is in use.
   The existing calculator and submit scripts remain the only owners of data. */
(function () {
  'use strict';
  var overlay = document.getElementById('fhaGuideOverlay');
  var panel = overlay.querySelector('.fha-guide-panel');
  var steps = Array.from(overlay.querySelectorAll('[data-fha-step]'));
  var timeline = Array.from(overlay.querySelectorAll('.fha-guide-timeline li'));
  var back = document.getElementById('fhaGuideBack');
  var next = document.getElementById('fhaGuideNext');
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
    document.getElementById('fhaGuideCount').textContent = 'Step ' + (index + 1) + ' of 3';
    steps[index].querySelector('h3').focus();
  }
  function close() {
    overlay.hidden = true;
    document.body.classList.remove('fha-guide-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function open() {
    if (window.DTLead) window.DTLead.begin('fha-magnet');
    returnFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('fha-guide-open');
    fields.classList.remove('hide');
    success.classList.remove('show');
    overlay.classList.remove('fha-guide-saved');
    var submit = document.getElementById('submitLead');
    submit.disabled = false;
    window.clearErrors();
    var error = overlay.querySelector('.submit-error');
    if (error) error.remove();
    showStep(0);
    panel.scrollTop = 0;
  }
  document.querySelectorAll('[data-fha-guide]').forEach(function (button) { button.addEventListener('click', open); });
  document.getElementById('fhaGuideClose').addEventListener('click', close);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
  next.addEventListener('click', function () {
    // Reuse the final submit's original validators; Continue never sends data.
    if (step === 0 && !window.validateFhaLeadDetails(false)) {
      var invalid = steps[0].querySelector('.input-shell.error input,.input-shell.error button');
      if (invalid) invalid.focus();
      return;
    }
    if (step === 1) {
      var credit = document.getElementById('mCredit');
      window.setError('Credit', credit.value ? '' : 'Required');
      if (!credit.value) { document.querySelector('#mCreditShell .cselect-trigger').focus(); return; }
      if (!window.DTServiceArea || !window.DTServiceArea.validate('fha-magnet', true)) return;
    }
    if (window.DT && window.DT.milestone) window.DT.milestone('form_step', {form_id:'fha-magnet',step_id:step+1});
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
    overlay.classList.toggle('fha-guide-saved', done);
    if (done) { var heading = success.querySelector('h3'); heading.tabIndex = -1; heading.focus(); }
  });
  saved.observe(success, {attributes:true, attributeFilter:['class']});
  // Close the guide before the original handler opens the shared booking flow.
  document.getElementById('openLeadBookingBtn').addEventListener('click', close, true);
  if (!window.IntersectionObserver) return;
  var tools = document.querySelectorAll('#fha-calculator, #get-fha-estimate');
  var visible = new window.Set();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    document.body.classList.toggle('fha-tool-active', visible.size > 0);
  });
  tools.forEach(function (tool) { observer.observe(tool); });
})();
