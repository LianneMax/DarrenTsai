/* One policy file feeds browser and server. Screening does not establish loan eligibility. */
(function () {
  var policy = null;
  var failed = false;
  var waiting = [];
  // The booking prequal (booking-chooser.js) builds its own fields, so it waits
  // on the policy here rather than fetching a second copy.
  function whenReady(cb, onFail) {
    if (policy) { cb(); return; }
    if (failed) { if (onFail) onFail(); return; }
    waiting.push({ ok: cb, fail: onFail });
  }
  function settle(ok) {
    waiting.splice(0).forEach(function (w) { try { if (ok) w.ok(); else if (w.fail) w.fail(); } catch (e) { /* one caller must not break another */ } });
  }
  if (!document.querySelector('link[href="/compliance.css"]')) { var css=document.createElement('link');css.rel='stylesheet';css.href='/compliance.css';document.head.appendChild(css); }
  // State rules, final (policy v3, 15 Oct 2026): the state checked is the
  // state of the property the loan is on. Primary or second home: the 8
  // licensed states. Investment (DSCR, or a rental used as collateral for an
  // equity loan): on either list. Mirrors src/utils/serviceArea.ts.
  var GOALS = { equity: 'general', dscr: 'dscr', 'own-home': 'own-home', commercial: 'dscr', 'not-sure': 'own-home' };
  function context(id, goal) {
    if (goal) return Object.prototype.hasOwnProperty.call(GOALS, goal) ? GOALS[goal] : null;
    var where = String(id) + ' ' + (window.location ? window.location.pathname : '');
    if (where.indexOf('fha') >= 0) return 'fha';
    if (where.indexOf('dscr') >= 0) return 'dscr';
    return 'general';
  }
  function propertyUses(id, goal) {
    var c = context(id, goal);
    return c ? policy.propertyUses[c] : [];
  }
  function isCaptureInquiry(id, source) {
    return !!policy && !!policy.inquiryForms && Object.prototype.hasOwnProperty.call(policy.inquiryForms, id) && policy.inquiryForms[id] === source;
  }
  function isCaptureForm(id) { return !!policy && !!policy.inquiryForms && Object.prototype.hasOwnProperty.call(policy.inquiryForms, id); }
  var RECORDING_NOTE = 'Availability is checked after you acknowledge privacy and submit. Outside our service area, your inquiry is recorded without a calendar or financing review.';
  function addMessage(input, id) {
    if (!isCaptureForm(id) || !/-magnet$/.test(id) || document.querySelector('[data-inquiry-message="' + id + '"]')) return;
    var disclosure = input.closest('.compliance-disclosure'); if (!disclosure) return;
    var note = document.createElement('div'); note.className = 'inquiry-message';
    note.innerHTML = '<label for="'+id+'-message">Anything you’d like Darren to know? <span>(optional)</span></label><textarea id="'+id+'-message" data-inquiry-message="'+id+'" rows="3" maxlength="2000" aria-describedby="'+id+'-message-help"></textarea><p id="'+id+'-message-help">Please leave out account numbers, Social Security numbers and other sensitive details. Up to 2,000 characters.</p><p>'+RECORDING_NOTE+'</p>';
    disclosure.parentNode.insertBefore(note, disclosure);
  }
  function onEitherList(state) {
    return policy.investment.indexOf(state) >= 0 || policy.consumer.indexOf(state) >= 0;
  }
  function result(use, state, id, goal) {
    if (!policy || policy.states.indexOf(state) < 0 || (use !== 'primary' && use !== 'second-home' && use !== 'investment')) return 'incomplete';
    if (propertyUses(id, goal).indexOf(use) < 0) return 'out-of-market';
    var ok = use === 'investment' ? onEitherList(state) : policy.consumer.indexOf(state) >= 0;
    return ok ? 'supported' : 'out-of-market';
  }
  function wording(id) {
    var w = String(id).toLowerCase() + ' ' + (window.location ? window.location.pathname : '');
    if (w.indexOf('fha') >= 0) return { legend: 'Where is the home?', use: 'How will you use the home?', state: 'Home state' };
    if (w.indexOf('dscr') >= 0) return { legend: 'Where is the investment property?', use: 'Property use', state: 'Investment property state' };
    if (String(id).indexOf('contact') < 0 && /home-equity|debt|adu/.test(String(id))) return { legend: 'Where is the home you’re borrowing against?', use: 'How do you use that home?', state: 'State of the home you’re borrowing against' };
    return { legend: 'Where is the property?', use: 'Property use', state: 'Property state' };
  }
  function fields(id) {
    var w = wording(id);
    var root = document.createElement('fieldset'); root.className = 'compliance-disclosure'; root.setAttribute('data-service-area', id);
    root.innerHTML = '<legend>'+w.legend+'</legend><label for="'+id+'-use">'+w.use+'</label><select id="'+id+'-use" required data-property-use="'+id+'"><option value="">Choose one</option><option value="primary">Primary home</option><option value="second-home">Second home</option><option value="investment">Rental / investment</option></select><label for="'+id+'-state">'+w.state+'</label><select id="'+id+'-state" required data-property-state="'+id+'"><option value="">Choose the state</option>'+policy.states.map(function(s){return '<option value="'+s+'">'+policy.labels[s]+'</option>';}).join('')+'</select><p role="status">This checks service area only, not loan approval.</p>';
    root.querySelectorAll('[data-property-use] option').forEach(function(option) {
      if (option.value && propertyUses(id).indexOf(option.value) < 0) option.remove();
    });
    // A single allowed use (DSCR, FHA) is the answer, not a question.
    var useSelect = root.querySelector('[data-property-use]');
    if (propertyUses(id).length === 1) useSelect.value = propertyUses(id)[0];
    // Reuse each guide's existing state control on its property step. This
    // preserves its validators/picker without asking a second location question.
    var legacyState = /-magnet$/.test(id) ? document.getElementById(id === 'rei-magnet' ? 'lState' : 'mState') : null;
    var legacyField = legacyState && legacyState.closest('.field');
    if (legacyField) {
      root.querySelector('label[for="'+id+'-state"]').remove();
      root.querySelector('[data-property-state]').remove();
      legacyState.setAttribute('data-property-state', id);
      legacyField.querySelector('label').textContent = w.state;
      root.insertBefore(legacyField, root.querySelector('[role="status"]'));
    }
    root.addEventListener('change', function(){validate(id);}); return root;
  }
  function read(id) {
    var use=document.querySelector('[data-property-use="'+id+'"]'); var state=document.querySelector('[data-property-state="'+id+'"]');
    return {propertyUse:use ? use.value : '', propertyState:state ? state.value : '', serviceAreaResult:result(use ? use.value : '', state ? state.value : '', id), serviceAreaVersion:policy ? policy.version : ''};
  }
  function validate(id, focusMissing) {
    var data=read(id); var root=document.querySelector('[data-service-area="'+id+'"]');
    var valid = !!policy && propertyUses(id).indexOf(data.propertyUse) >= 0 && data.serviceAreaResult !== 'incomplete';
    var deferred = isCaptureForm(id);
    if(root){
      var status=root.querySelector('[role="status"]');
      if (status) {
        status.className=valid && deferred ? '' : data.serviceAreaResult==='supported'?'':'service-area-warning';
        status.textContent=valid && deferred ? RECORDING_NOTE : data.serviceAreaResult==='supported'?'This checks service area only, not loan approval.':data.serviceAreaResult==='out-of-market'?'A personal review is not available for this property location right now. You can keep exploring your options with the calculator.':'Please select property use and property state to continue.';
      }
      var missing=null;
      root.querySelectorAll('select').forEach(function(select){
        select.setAttribute('aria-invalid', select.value ? 'false' : 'true');
        if(!select.value && !missing) missing=select;
      });
      if(focusMissing && missing) missing.focus();
    }
    return valid && (deferred || data.serviceAreaResult==='supported');
  }
  window.DTServiceArea={read:read,validate:validate,fields:fields,ready:function(){return !!policy;},whenReady:whenReady,isCaptureInquiry:isCaptureInquiry,
    check:function(use,state,id,goal){return policy?result(use,state,id,goal):'incomplete';},
    uses:function(id,goal){return policy?propertyUses(id,goal):[];},
    states:function(){return policy?policy.states.map(function(s){return [s,policy.labels[s]];}):[];},
    version:function(){return policy?policy.version:'';}};
  document.addEventListener('click', function(e) {
    var anchor = e.target.closest && e.target.closest('a[href^="tel:"]');
    // Only the booking flow's own Call button, shown after the prequal passes,
    // dials straight through. Every other number on the site runs the prequal.
    if (!anchor || anchor.closest('.dt-book-overlay, .dt-book-inline')) return;
    e.preventDefault();
    if (window.DTBooking) window.DTBooking.open();
  }, true);
  document.querySelectorAll('[data-privacy-form]').forEach(function(input) {
    var id=input.getAttribute('data-privacy-form'); if(document.querySelector('[data-service-area="'+id+'"]')) return;
    var disclosure=input.closest('.compliance-disclosure'); if(!disclosure) return;
    var loading=document.createElement('fieldset'); loading.setAttribute('data-service-area',id); loading.setAttribute('data-service-area-loading','true'); loading.innerHTML='<p role="status">Loading the property service-area check…</p>'; disclosure.parentNode.insertBefore(loading,disclosure);
  });
  fetch('/service-area-policy.json').then(function(r){if(!r.ok)throw new Error('policy unavailable');return r.json();}).then(function(p){policy=p;settle(true);document.querySelectorAll('[data-privacy-form]').forEach(function(input){var id=input.getAttribute('data-privacy-form');addMessage(input,id);var existing=document.querySelector('[data-service-area="'+id+'"]');if(existing){if(existing.hasAttribute('data-service-area-loading'))existing.replaceWith(fields(id));return;}var disclosure=input.closest('.compliance-disclosure');if(disclosure)disclosure.parentNode.insertBefore(fields(id),disclosure);});}).catch(function(){ failed=true; settle(false); document.querySelectorAll('[data-service-area-loading] [role="status"]').forEach(function(status){status.textContent='The service-area check is unavailable. Please refresh the page; your request has not been submitted.';}); });
})();
