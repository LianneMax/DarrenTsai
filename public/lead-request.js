/**
 * A submission is an inquiry, not a click on Send. A timed-out request can
 * finish in Apps Script after the browser stops waiting. Retrying that inquiry
 * must carry its original ID and exact body (including consent timestamps),
 * otherwise the server cannot distinguish recovery from another real lead.
 * This one runtime serves the React, static guide and booking forms.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.DTLead) return;
  var pending = {};
  var converted = {};
  var receipts = new window.WeakMap();
  var DRAFT_KEY = 'dt_pending_leads_v1';
  var DRAFT_TTL = 30 * 60 * 1000;
  // 27 Oct: scheduling after a calculator save is a continuation, not another
  // inquiry. Retain only a short-lived functional receipt and property context
  // per tab, never debt figures, phone, email or the optional private message.
  // A later outside-area save replaces the earlier receipt too, so it cannot
  // inherit a calendar from a different property. This is not Ads storage.
  var SAVED_KEY = 'dt_saved_inquiry_v1';
  var savedInquiry = null;
  try { savedInquiry = JSON.parse(window.sessionStorage.getItem(SAVED_KEY) || 'null'); } catch (e) { /* memory works without storage */ }
  function expireSaved() {
    var current = savedInquiry;
    if (!current || !Number.isFinite(current.savedAt)) return;
    window.setTimeout(function () {
      if (savedInquiry !== current) return;
      savedInquiry = null;
      try { window.sessionStorage.removeItem(SAVED_KEY); } catch (e) { /* storage may be unavailable */ }
    }, Math.max(0, DRAFT_TTL - (Date.now() - current.savedAt)));
  }
  expireSaved();
  function rememberInquiry(record) {
    var data = JSON.parse(record.body);
    savedInquiry = { submissionId: record.submissionId, disposition: record.disposition,
      savedAt: Date.now(), formId: data.formId, source: data.source,
      firstName: data.firstName, propertyUse: data.propertyUse, propertyState: data.propertyState,
      bookingGoal: data.bookingGoal, serviceAreaVersion: data.serviceAreaVersion,
      privacyAcknowledged: data.privacyAcknowledged === true,
      propertyType: data.propertyType, mortgageCurrent: data.mortgageCurrent,
      recentBankruptcyForeclosure: data.recentBankruptcyForeclosure };
    try { window.sessionStorage.setItem(SAVED_KEY, JSON.stringify(savedInquiry)); } catch (e) { /* functional in-memory continuation */ }
    expireSaved();
  }
  function saved() {
    if (!savedInquiry || !savedInquiry.submissionId || !Number.isFinite(savedInquiry.savedAt) || Date.now() - savedInquiry.savedAt < 0 || Date.now() - savedInquiry.savedAt >= DRAFT_TTL) return null;
    return Object.assign({}, savedInquiry);
  }
  function mayPersist() {
    try { return !!(window.DTConsent && window.DTConsent.isAllowed()); } catch (e) { return false; }
  }
  // Functional, per-tab recovery only. No optional analytics storage, automatic
  // resubmission, URL exposure or permanent/localStorage copy of an inquiry.
  try {
    var drafts = mayPersist() ? JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || '{}') : {};
    Object.keys(drafts).forEach(function (key) {
      var d = drafts[key];
      if (d && typeof d.body === 'string' && typeof d.signature === 'string' && typeof d.submissionId === 'string' && Date.now() - d.createdAt < DRAFT_TTL) pending[key] = d;
    });
  } catch (e) { /* Storage denial still permits in-memory capture and retry. */ }

  function persist() {
    var drafts = {};
    Object.keys(pending).forEach(function (key) {
      var record = pending[key];
      if (!record.confirmed && Date.now() - record.createdAt < DRAFT_TTL) drafts[key] = record;
    });
    try {
      if (mayPersist() && Object.keys(drafts).length) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
      else window.sessionStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* Do not turn unavailable storage into a lost lead. */ }
  }
  persist();
  window.addEventListener('dt:consent', persist);
  function expire(formId, record) {
    window.setTimeout(function () {
      if (pending[formId] === record) { delete pending[formId]; persist(); }
    }, Math.max(0, DRAFT_TTL - (Date.now() - record.createdAt)));
  }
  Object.keys(pending).forEach(function (key) { expire(key, pending[key]); });

  function uuid() {
    // New identities belong to the durable website inbox. Retain any recovered
    // older identity unchanged so its historical Sheet conflict/replay checks
    // remain authoritative through a mixed-version deployment.
    if (window.crypto && window.crypto.randomUUID) return 'inbox1-' + window.crypto.randomUUID();
    var bytes = new window.Uint8Array(16);
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Secure submission identity is unavailable. Please use a current browser.');
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return 'inbox1-' + hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function material(value, top) {
    if (Array.isArray(value)) return value.map(function (v) { return material(v, false); });
    if (!value || typeof value !== 'object') return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      // Attribution describes the original submit, not an edited answer. A
      // reload with rejected cookies can regenerate firstTouchTs, for example;
      // preserve its original snapshot rather than turning recovery into a new
      // submission. Actual answers and consent choices remain material.
      if (top && (/^(submissionId|timestamp|smsConsentAt|hutk|clickId|clickIdType|landingPage|referrer|pageUri|pageName|firstTouchTs|firstUtmSource|firstUtmMedium|firstUtmCampaign|firstClickId|firstClickIdType)$/.test(key) || /^utm_/.test(key))) return;
      out[key] = material(value[key], false);
    });
    return out;
  }

  function prepare(formId, payload) {
    var signature = JSON.stringify(material(payload, true));
    var record = pending[formId];
    if (!record || record.rejected || Date.now() - record.createdAt >= DRAFT_TTL || record.signature !== signature) {
      var data = JSON.parse(JSON.stringify(payload));
      data.submissionId = uuid();
      record = { signature: signature, submissionId: data.submissionId, body: JSON.stringify(data), confirmed: false, createdAt: Date.now() };
      pending[formId] = record;
      persist();
      expire(formId, record);
    }
    return record;
  }

  function submit(formId, payload, endpoint) {
    var record = prepare(formId, payload);
    function error(code) {
      try { if (window.DT && window.DT.milestone) window.DT.milestone('form_error', { form_id: formId, error_code: code }); } catch (e) { /* Do not break recovery. */ }
    }
    return window.fetch(endpoint || '/api/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: record.body
    }).then(function (response) {
      if (!response.ok) {
        error(response.status === 409 ? 'submission_conflict' : response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'uncertain' : 'rejected');
        if (response.status === 409 || response.status === 422) {
          return response.clone().json().then(function (rejection) {
            // These responses prove THIS body was refused before a write. The
            // next deliberate click may start a fresh inquiry; uncertain/busy
            // responses never erase the frozen recovery identity.
            if (rejection && (rejection.code === 'submission_conflict' || rejection.code === 'invalid_submission_id') && pending[formId] === record) { record.rejected = true; persist(); }
            return response;
          }, function () { return response; });
        }
        return response;
      }
      // A readable 2xx is necessary but not sufficient. A proxy/CDN HTML page
      // or an unexpected body must never produce a saved lead or calendar.
      return response.clone().json().then(function (receipt) {
        if (!receipt || receipt.ok !== true || receipt.submissionId !== record.submissionId || receipt.receipt !== 'saved') {
          throw new Error('The saved receipt could not be confirmed. Retry this request with the same details.');
        }
        record.disposition = receipt.disposition === 'sheet-only' ? 'sheet-only' : '';
        record.confirmed = true;
        receipts.set(response, record);
        rememberInquiry(record);
        persist();
        return response;
      }).catch(function (err) { error('receipt_invalid'); throw err; });
    }, function (err) { error('network'); throw err; });
  }

  function recordFor(formId, response) { return response ? receipts.get(response) : pending[formId]; }
  function claimConversion(formId, response) {
    var record = recordFor(formId, response);
    if (!record || !record.confirmed || record.disposition === 'sheet-only' || converted[record.submissionId]) return false;
    converted[record.submissionId] = true;
    return true;
  }
  function attribution(formId, response) {
    var record = recordFor(formId, response);
    if (!record || !record.confirmed) return {};
    var data = JSON.parse(record.body);
    var out = {};
    // Override DT.track's current-page lookup with the touch captured in the
    // confirmed request. Recovery after a new campaign must not credit B while
    // the Sheet and CRM correctly retain the originally submitted campaign A.
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'clickId', 'clickIdType', 'landingPage', 'referrer', 'firstUtmSource', 'firstUtmMedium', 'firstUtmCampaign', 'firstClickId', 'firstClickIdType', 'firstTouchTs', 'pageUri', 'pageName'].forEach(function (key) { out[key] = typeof data[key] === 'string' ? data[key] : ''; });
    return out;
  }

  function reset(formId) { delete pending[formId]; persist(); }
  // Reopening a finished form is a new inquiry. Reopening an uncertain one is
  // recovery and must keep its ID, even when no form fields survived a reload.
  function begin(formId) { if (pending[formId] && pending[formId].confirmed) reset(formId); }
  // Static guides call this before success, identification or conversion. Use
  // the frozen confirmed body, so a changed/hidden property input cannot select
  // a different exit while the original request finishes.
  function finishInquiry(formId, response) {
    var record = receipts.get(response);
    var area = window.DTServiceArea;
    if (!record || !record.confirmed || !area || !area.ready()) throw new Error('The saved inquiry could not be confirmed.');
    var data = JSON.parse(record.body);
    if (!area.isCaptureInquiry(formId, data.source) || area.uses(formId).indexOf(data.propertyUse) < 0) throw new Error('Please refresh this form before sending.');
    var result = area.check(data.propertyUse, data.propertyState, formId);
    if (result === 'incomplete' || (record.disposition === 'sheet-only') !== (result === 'out-of-market')) throw new Error('The inquiry disposition could not be confirmed. Retry with the same details.');
    if (record.disposition !== 'sheet-only') return false;
    window.location.assign((data.propertyUse === 'investment' ? '/out-of-market-dscr/' : '/out-of-market-primary/') + '#recorded');
    return true;
  }
  window.DTLead = { prepare: prepare, submit: submit, claimConversion: claimConversion, attribution: attribution, reset: reset, begin: begin, finishInquiry: finishInquiry, savedInquiry: saved };
})();
