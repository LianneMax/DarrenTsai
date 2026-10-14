/* One policy file feeds browser and server. Screening does not establish loan eligibility. */
(function () {
  var policy = null;
  if (!document.querySelector('link[href="/compliance.css"]')) { var css=document.createElement('link');css.rel='stylesheet';css.href='/compliance.css';document.head.appendChild(css); }
  function propertyUses(id) {
    var context = String(id) + ' ' + (window.location ? window.location.pathname : '');
    if (context.indexOf('fha') >= 0) return policy.propertyUses.fha;
    if (context.indexOf('dscr') >= 0) return policy.propertyUses.dscr;
    return ['primary', 'investment'];
  }
  function result(use, state, id) {
    var equity = String(id).indexOf('home-equity') >= 0 || (window.location && window.location.pathname.indexOf('/home-equity') === 0);
    var list = policy && (use === 'primary' ? policy.consumer : use === 'investment' ? (equity ? policy.consumer : policy.investment) : []);
    if (!list || !list.length || policy.states.indexOf(state) < 0) return 'incomplete';
    if (propertyUses(id).indexOf(use) < 0) return 'out-of-market';
    return list.indexOf(state) >= 0 ? 'supported' : 'out-of-market';
  }
  function fields(id) {
    var root = document.createElement('fieldset'); root.className = 'compliance-disclosure'; root.setAttribute('data-service-area', id);
    root.innerHTML = '<legend>Where is the property?</legend><label for="'+id+'-use">Property use</label><select id="'+id+'-use" required data-property-use="'+id+'"><option value="">Choose property use</option><option value="primary">Primary home / owner-occupied</option><option value="investment">Investment / rental</option></select><label for="'+id+'-state">Property state (not your current residence)</label><select id="'+id+'-state" required data-property-state="'+id+'"><option value="">Choose property state</option>'+policy.states.map(function(s){return '<option value="'+s+'">'+policy.labels[s]+'</option>';}).join('')+'</select><p role="status">This checks service area only, not loan approval.</p>';
    root.querySelectorAll('[data-property-use] option').forEach(function(option) {
      if (option.value && propertyUses(id).indexOf(option.value) < 0) option.remove();
    });
    root.addEventListener('change', function(){validate(id);}); return root;
  }
  function read(id) {
    var use=document.querySelector('[data-property-use="'+id+'"]'); var state=document.querySelector('[data-property-state="'+id+'"]');
    return {propertyUse:use ? use.value : '', propertyState:state ? state.value : '', serviceAreaResult:result(use ? use.value : '', state ? state.value : '', id), serviceAreaVersion:policy ? policy.version : ''};
  }
  function validate(id, focusMissing) {
    var data=read(id); var root=document.querySelector('[data-service-area="'+id+'"]');
    if(root){
      var status=root.querySelector('[role="status"]');
      status.className=data.serviceAreaResult==='supported'?'':'service-area-warning';
      status.textContent=data.serviceAreaResult==='supported'?'This checks service area only, not loan approval.':data.serviceAreaResult==='out-of-market'?'A personal review is not available for this property location right now. You can keep exploring your options with the calculator.':'Please select property use and property state to continue.';
      var missing=null;
      root.querySelectorAll('select').forEach(function(select){
        select.setAttribute('aria-invalid', select.value ? 'false' : 'true');
        if(!select.value && !missing) missing=select;
      });
      if(focusMissing && missing) missing.focus();
    }
    return !!policy && data.serviceAreaResult==='supported';
  }
  window.DTServiceArea={read:read,validate:validate,fields:fields,ready:function(){return !!policy;}};
  document.addEventListener('click', function(e) {
    var anchor = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!anchor || anchor.closest('.dt-book-overlay')) return;
    e.preventDefault();
    if (window.DTBooking) window.DTBooking.open();
  }, true);
  document.querySelectorAll('[data-privacy-form]').forEach(function(input) {
    var id=input.getAttribute('data-privacy-form'); if(document.querySelector('[data-service-area="'+id+'"]')) return;
    var disclosure=input.closest('.compliance-disclosure'); if(!disclosure) return;
    var loading=document.createElement('fieldset'); loading.setAttribute('data-service-area',id); loading.setAttribute('data-service-area-loading','true'); loading.innerHTML='<p role="status">Loading the property service-area check…</p>'; disclosure.parentNode.insertBefore(loading,disclosure);
  });
  fetch('/service-area-policy.json').then(function(r){if(!r.ok)throw new Error('policy unavailable');return r.json();}).then(function(p){policy=p;document.querySelectorAll('[data-privacy-form]').forEach(function(input){var id=input.getAttribute('data-privacy-form');var existing=document.querySelector('[data-service-area="'+id+'"]');if(existing){if(existing.hasAttribute('data-service-area-loading'))existing.replaceWith(fields(id));return;}var disclosure=input.closest('.compliance-disclosure');if(disclosure)disclosure.parentNode.insertBefore(fields(id),disclosure);});}).catch(function(){ document.querySelectorAll('[data-service-area-loading] [role="status"]').forEach(function(status){status.textContent='The service-area check is unavailable. Please refresh the page; your request has not been submitted.';}); });
})();
