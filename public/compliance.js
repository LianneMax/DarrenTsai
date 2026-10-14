/* Consent is recorded with a submission, not inferred from entering a phone number. No tracking or SMS enrollment occurs here. */
window.DTCompliance = { sms: function(formId) { var id = formId === 'fha-payment-review' ? 'fha-contact-modal' : formId; var acknowledgment = document.querySelector('input[data-privacy-form="' + id + '"]'); var input = document.querySelector('input[data-sms-form="' + id + '"]'); return Object.assign({ calculatorDisplayResults: window.DTCompliance.calculatorResults() }, window.DTServiceArea ? window.DTServiceArea.read(id) : {}, {privacyAcknowledged: !!(acknowledgment && acknowledgment.checked), privacyVersion: '2026-10-13-v1', smsConsent: !!(input && input.checked), smsMarketingConsent: !!(input && input.checked), smsInformationalConsent: !!document.querySelector('input[data-sms-info-form="' + id + '"]:checked'), smsInformationalConsentText: 'I agree to texts about my inquiry and appointment reminders from Darren Tsai (Ren Marketing Group LLC).', smsConsentVersion: '2026-10-14-v4', smsConsentText: 'I agree to marketing texts from Darren Tsai (Ren Marketing Group LLC), including automated texts.', smsConsentAt: new Date().toISOString()}); } };

window.DTCompliance.ack = function(formId) { var id = formId === 'fha-payment-review' ? 'fha-contact-modal' : formId; if(window.DTServiceArea && !window.DTServiceArea.validate(id)) return false; var input = document.querySelector('input[data-privacy-form="' + id + '"]'); if (input && !input.checked) { input.reportValidity(); return false; } return true; };

window.DTCompliance.calculatorResults = function() {
  var root = document.getElementById('fhaResult');
  if (!root || !root.getClientRects().length) return {};
  var results = { estimateOnly: true };
  ['fhaTotal','fhaBaseLoan','fhaUfmip','fhaTotalLoan','fhaPI','fhaMipRate','fhaMip','fhaTaxOut','fhaInsOut','fhaHoaOut','fhaTotalRow'].forEach(function(id) { var el=document.getElementById(id);if(el)results[id]=el.textContent.trim(); });
  return results;
};
