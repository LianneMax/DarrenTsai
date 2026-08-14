// Netlify Function: send-rei-guide
//
// Called server-side by the Apps Script webhook (google-apps-script.js) right
// after a Real Estate Investing lead is logged to Sheets + pushed to Bonzo.
// Unlike send-dscr-guide.mts, this PDF is a static case study with no
// per-lead numbers to redraw — the function just fetches the published PDF
// (already at /magnets/real-estate-investing-case-study.pdf) and emails it
// from darren@realdarrentsai.com via Resend.
//
// SETUP:
// 1. Uses the same Resend account/domain as send-dscr-guide.mts — no new
//    signup needed. Netlify → Site settings → Environment variables, add:
//      REI_GUIDE_API_KEY = <any long random string you make up>
// 2. In the Apps Script (Script Properties), add:
//      NETLIFY_REI_PDF_URL = https://realdarrentsai.com/api/send-rei-guide
//      NETLIFY_REI_PDF_KEY = <same random string as REI_GUIDE_API_KEY>
//
// This endpoint requires the x-api-key header to match REI_GUIDE_API_KEY —
// it sends a real email on every call, so it isn't left open to the public.

import type { Config, Context } from "@netlify/functions";

const PDF_URL = "https://realdarrentsai.com/magnets/real-estate-investing-case-study.pdf";
const FROM = "Darren Tsai <darren@realdarrentsai.com>";

// Cache bytes across warm invocations.
let pdfBytes: ArrayBuffer | null = null;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function buildEmailHtml(lead: { firstName?: string }) {
  const firstName = escapeHtml(lead.firstName || "there");
  const FONT = "Arial,Helvetica,sans-serif";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>The real numbers plus my out-of-state BRRRR mistake</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:24px !important;line-height:30px !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f7f9;">
<span style="display:none;font-size:1px;color:#f5f7f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">My first out-of-state BRRRR, purchase to refinance: actual numbers, exact timeline, and what the mistakes cost me.</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6ebf0;border-radius:16px;overflow:hidden;">

  <tr>
    <td style="background-color:#517686;padding:26px 40px 22px 40px;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-family:${FONT};font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#c8e2e8;padding-bottom:8px;">Investor Case Study</td></tr>
        <tr><td style="font-family:${FONT};font-size:21px;line-height:27px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">Darren Tsai</td></tr>
        <tr><td style="font-family:${FONT};font-size:13px;line-height:18px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:4px;">Senior Loan Officer, Saxton Mortgage</td></tr>
      </table>
    </td>
  </tr>
  <tr><td style="background-color:#274654;font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

  <tr>
    <td class="pad" style="padding:36px 40px 8px 40px;font-family:${FONT};">
      <div class="h1" style="font-size:28px;line-height:34px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:-0.02em;color:#223d55;">The real numbers, plus my out-of-state BRRRR mistake</div>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:20px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Hi ${firstName},
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:16px 40px 0 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      Attached is the case study breaking down my first out-of-state BRRRR rental. From purchase to refinance, including the actual numbers, the exact timeline, and the mistakes that cost me money along the way.
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f7f9;border:1px solid #e6ebf0;border-radius:10px;">
        <tr>
          <td style="padding:20px 24px 8px 24px;font-family:${FONT};">
            <div style="font-size:10px;line-height:14px;mso-line-height-rule:exactly;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#517686;padding-bottom:10px;">Where to start</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 6px 24px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="72" valign="top" style="width:72px;font-family:${FONT};font-size:15px;line-height:22px;mso-line-height-rule:exactly;font-weight:600;color:#223d55;">Page 2</td>
                <td valign="top" style="font-family:${FONT};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#6b7280;">Every number, purchase through refinance.</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid #e6ebf0;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table></td></tr>
        <tr>
          <td style="padding:12px 24px 20px 24px;font-family:${FONT};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="72" valign="top" style="width:72px;font-family:${FONT};font-size:15px;line-height:22px;mso-line-height-rule:exactly;font-weight:600;color:#223d55;">Page 9</td>
                <td valign="top" style="font-family:${FONT};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#6b7280;">The mistakes, the ones most investors do not think about.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:28px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#223d55;border-radius:10px;">
        <tr><td style="background-color:#219ebc;font-size:0;line-height:0;height:7px;">&nbsp;</td></tr>
        <tr>
          <td style="padding:24px 28px 26px 28px;font-family:${FONT};">
            <div style="font-size:18px;line-height:26px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;">Quick question</div>
            <div style="font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:8px;">Are you currently looking at out-of-state markets, or just researching the strategy for down the road?</div>
            <div style="font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#c8e2e8;padding-top:12px;">Reply back and let me know. Happy to share what I am seeing in the markets right now.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td class="pad" align="left" style="padding:28px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td bgcolor="#219ebc" style="border-radius:8px;">
            <a href="https://calendly.com/realdarrentsai/15min" style="display:block;padding:14px 30px;font-family:${FONT};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Book a 15-minute call</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="pad" style="padding:12px 40px 0 40px;font-family:${FONT};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;">
      Or use this link: calendly.com/realdarrentsai/15min
    </td>
  </tr>

  <tr>
    <td class="pad" style="padding:28px 40px 36px 40px;font-family:${FONT};font-size:16px;line-height:26px;mso-line-height-rule:exactly;color:#6b7280;">
      All the best,<br>
      <span style="font-weight:600;color:#223d55;">Darren</span>
    </td>
  </tr>

  <tr><td style="border-top:1px solid #e6ebf0;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr>
    <td class="pad" style="padding:24px 40px 30px 40px;font-family:${FONT};">
      <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;">Darren Tsai &middot; Senior Loan Officer, Saxton Mortgage<br>Licensed in AZ &middot; CA &middot; FL &middot; HI &middot; OR &middot; PA &middot; TN &middot; TX</div>
      <div style="font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#6b7280;padding-top:10px;">9191 Towne Centre Drive, Suite 400<br>San Diego, CA 92122<br><a href="tel:+18589252102" style="color:#517686;text-decoration:none;">(858) 925-2102</a> &middot; <a href="mailto:info@saxtonmortgage.com" style="color:#517686;text-decoration:underline;">info@saxtonmortgage.com</a></div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Darren Tsai, DRE #02103705 | NMLS #2438102. Dream Home Development Corporation DBA Saxton Mortgage, NMLS #2525913 | CA DRE #02205650. Equal Housing Opportunity. Past results are one investor's experience. Individual results will vary and final terms are determined by underwriting. Not a commitment to lend.</div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Dream Home Development Corporation is a subsidiary of Saxton Mortgage, LLC (NMLS #1717191), operating only in California. <a href="https://www.nmlsconsumeraccess.org/" style="color:#517686;text-decoration:underline;">NMLS Consumer Access</a></div>
      <div style="font-size:11px;line-height:18px;mso-line-height-rule:exactly;color:#6b7280;padding-top:12px;">Dream Home Development Corporation DBA Saxton Mortgage, 9191 Towne Centre Drive, Suite 400, San Diego, CA 92122<br><a href="mailto:darren@realdarrentsai.com?subject=Unsubscribe" style="color:#517686;text-decoration:underline;">Unsubscribe</a> from these emails.</div>
    </td>
  </tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}

async function getPdfBytes() {
  if (!pdfBytes) {
    const res = await fetch(PDF_URL);
    if (!res.ok) throw new Error(`pdf fetch failed: ${res.status}`);
    pdfBytes = await res.arrayBuffer();
  }
  return pdfBytes;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" });

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== Netlify.env.get("REI_GUIDE_API_KEY")) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const resendKey = Netlify.env.get("RESEND_API_KEY");
  if (!resendKey) return jsonResponse(500, { error: "RESEND_API_KEY not configured" });

  let lead: Record<string, string>;
  try {
    lead = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!lead.email) return jsonResponse(400, { error: "email required" });

  try {
    const bytes = await getPdfBytes();
    const base64 = Buffer.from(bytes).toString("base64");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [lead.email],
        subject: "The real numbers + my out-of-state BRRRR mistake",
        html: buildEmailHtml(lead),
        attachments: [
          { filename: "real-estate-investing-case-study.pdf", content: base64 },
        ],
      }),
    });

    if (!emailRes.ok) {
      const detail = await emailRes.text();
      console.error("resend send failed", emailRes.status, detail);
      return jsonResponse(502, { error: "email send failed" });
    }

    return jsonResponse(200, { success: true });
  } catch (err) {
    console.error("send-rei-guide error", err);
    return jsonResponse(500, { error: String(err) });
  }
};

export const config: Config = {
  path: "/api/send-rei-guide",
};
