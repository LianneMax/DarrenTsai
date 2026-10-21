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
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var bytes = new window.Uint8Array(16);
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Secure submission identity is unavailable. Please use a current browser.');
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
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
  window.DTLead = { prepare: prepare, submit: submit, claimConversion: claimConversion, attribution: attribution, reset: reset, begin: begin };
})();
