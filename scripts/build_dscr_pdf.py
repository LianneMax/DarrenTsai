import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas as canvas_mod
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---------------- Brand font (Outfit — matches the site, not a reportlab stock font) ----------------
FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "fonts")
pdfmetrics.registerFont(TTFont("Outfit-Regular", os.path.join(FONT_DIR, "Outfit-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Outfit-Medium", os.path.join(FONT_DIR, "Outfit-Medium.ttf")))
pdfmetrics.registerFont(TTFont("Outfit-SemiBold", os.path.join(FONT_DIR, "Outfit-SemiBold.ttf")))
pdfmetrics.registerFont(TTFont("Outfit-Bold", os.path.join(FONT_DIR, "Outfit-Bold.ttf")))
# Registers "Outfit" as a family so inline <b>...</b> markup in Paragraphs
# resolves to Outfit-Bold automatically (no italic face shipped, so italic
# markup falls back to the regular face rather than erroring).
pdfmetrics.registerFontFamily(
    "Outfit", normal="Outfit-Regular", bold="Outfit-Bold",
    italic="Outfit-Regular", boldItalic="Outfit-Bold",
)

# ---------------- Palette (site brand: navy / teal / CTA blue on light) ----------------
INK = colors.HexColor("#223d55")
INK_SOFT = colors.HexColor("#6B7280")
PAPER = colors.HexColor("#F5F7F9")
BRASS = colors.HexColor("#219ebc")
BRASS_DEEP = colors.HexColor("#517686")
GREEN = colors.HexColor("#274654")
RUST = colors.HexColor("#219ebc")
LINE = colors.HexColor("#E6EBF0")
CREAM_TEXT = colors.HexColor("#C8E2E8")

COMPANY_NAME = "Darren Tsai"
NMLS = "DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #2525913"
PHONE = "714-887-5432"
EMAIL = "darren@realdarrentsai.com"
BOOKING = "https://calendly.com/realdarrentsai/15min"

# Cover-page brand (matches the real site's :root vars in public/dscr/index.html —
# separate from the ink/brass palette the interior lever pages use).
NAVY = colors.HexColor("#223d55")
TEAL = colors.HexColor("#517686")
TEAL_DEEP = colors.HexColor("#274654")
CTA_BLUE = colors.HexColor("#219ebc")
LIGHT_BG = colors.HexColor("#F5F7F9")
LIGHT_LINE = colors.HexColor("#E6EBF0")
TEXT_DARK = colors.HexColor("#1A1A2E")
TEXT_MUTED = colors.HexColor("#6B7280")
HEADER_TEXT = colors.HexColor("#C8E2E8")

PAGE_W, PAGE_H = letter

styles = getSampleStyleSheet()

eyebrow_style = ParagraphStyle(
    "Eyebrow", parent=styles["Normal"], fontName="Outfit-SemiBold", fontSize=9,
    textColor=BRASS_DEEP, tracking=1, leading=12, spaceAfter=6,
)
h1_style = ParagraphStyle(
    "H1", parent=styles["Title"], fontName="Outfit-Bold", fontSize=25,
    leading=29, textColor=INK, alignment=TA_LEFT, spaceAfter=10,
)
h2_style = ParagraphStyle(
    "H2", parent=styles["Heading1"], fontName="Outfit-Bold", fontSize=17,
    leading=21, textColor=INK, spaceBefore=4, spaceAfter=8,
)
h3_style = ParagraphStyle(
    "H3", parent=styles["Heading2"], fontName="Outfit-SemiBold", fontSize=12.5,
    leading=16, textColor=BRASS_DEEP, spaceBefore=2, spaceAfter=4,
)
# fontName must be an actual registered font (not the bare family name —
# ps2tt() only indexes real psnames) for inline <b>...</b> markup used in
# several paragraphs below to resolve to Outfit-Bold via the family mapping
# registered above.
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=10.3,
    leading=15.5, textColor=INK_SOFT, spaceAfter=8,
)
body_tight = ParagraphStyle(
    "BodyTight", parent=body_style, spaceAfter=2,
)
sub_style = ParagraphStyle(
    "Sub", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=11.5,
    leading=17, textColor=INK_SOFT, spaceAfter=14,
)
item_title_style = ParagraphStyle(
    "ItemTitle", parent=styles["Normal"], fontName="Outfit-SemiBold", fontSize=11,
    leading=14, textColor=INK, spaceAfter=2,
)
item_body_style = ParagraphStyle(
    "ItemBody", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=9.8,
    leading=14.5, textColor=INK_SOFT, spaceAfter=12,
)
# No italic face shipped for Outfit, so emphasis leans on weight (Medium)
# instead of an oblique/italic style.
callout_style = ParagraphStyle(
    "Callout", parent=styles["Normal"], fontName="Outfit-Medium", fontSize=10,
    leading=15, textColor=INK, spaceAfter=8,
)
mono_small = ParagraphStyle(
    "MonoSmall", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=8,
    leading=11, textColor=INK_SOFT,
)
disclaimer_style = ParagraphStyle(
    "Disclaimer", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=7.3,
    leading=10.5, textColor=colors.HexColor("#6B7280"),
)
cream_body = ParagraphStyle(
    "CreamBody", parent=styles["Normal"], fontName="Outfit-Regular", fontSize=10.5,
    leading=16, textColor=CREAM_TEXT, spaceAfter=8,
)
cream_h2 = ParagraphStyle(
    "CreamH2", parent=styles["Heading1"], fontName="Outfit-Bold", fontSize=19,
    leading=23, textColor=colors.white, spaceAfter=10,
)


def rule(color=LINE, thickness=0.75, space_before=4, space_after=10):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                       spaceBefore=space_before, spaceAfter=space_after)


def numbered_item(num, title, body):
    t = Table(
        [[Paragraph(num, ParagraphStyle("num", fontName="Outfit-Bold",
                                        fontSize=13, textColor=BRASS_DEEP)),
          Paragraph(f"<b>{title}</b><br/>{body}", ParagraphStyle(
              "combo", fontName="Outfit-Regular", fontSize=9.8, leading=14.5,
              textColor=INK_SOFT))]],
        colWidths=[26, 460],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


# ---------------- Page decoration ----------------
def draw_header_footer(c: canvas_mod.Canvas, doc):
    c.saveState()
    # top rule
    c.setStrokeColor(LINE)
    c.setLineWidth(0.75)
    c.line(0.85 * inch, PAGE_H - 0.7 * inch, PAGE_W - 0.85 * inch, PAGE_H - 0.7 * inch)
    # header eyebrow
    c.setFont("Outfit-SemiBold", 8)
    c.setFillColor(BRASS_DEEP)
    c.drawString(0.85 * inch, PAGE_H - 0.6 * inch, "DSCR RATE & CASH FLOW GUIDE")
    c.setFillColor(INK_SOFT)
    c.drawRightString(PAGE_W - 0.85 * inch, PAGE_H - 0.6 * inch, COMPANY_NAME)
    # footer
    c.setStrokeColor(LINE)
    c.line(0.85 * inch, 0.65 * inch, PAGE_W - 0.85 * inch, 0.65 * inch)
    c.setFont("Outfit-Regular", 7.5)
    c.setFillColor(INK_SOFT)
    c.drawString(0.85 * inch, 0.48 * inch, f"{COMPANY_NAME}  ·  {NMLS}  ·  Equal Housing Opportunity")
    c.drawRightString(PAGE_W - 0.85 * inch, 0.48 * inch, f"Page {doc.page}")
    c.restoreState()


# ---------------- Cover-page geometry ----------------
# Every one of these is load-bearing for netlify/functions/send-dscr-guide.mts,
# which masks + redraws the 6 lead-specific regions (marked DYNAMIC below) on
# top of this static template. If you move something here, update the mirror
# constants in that file too, or the personalized overlay will land in the
# wrong spot / wrong font.
COVER_MARGIN = 40
COVER_HEADER_H = 172  # from PAGE_H down to PAGE_H - COVER_HEADER_H
COVER_EYEBROW_Y = PAGE_H - 45
COVER_TITLE_Y = PAGE_H - 83
COVER_PREPARED_Y = PAGE_H - 113          # DYNAMIC: "Prepared for {fullName}"
COVER_DIVIDER_Y = PAGE_H - COVER_HEADER_H
COVER_GREETING_Y = COVER_DIVIDER_Y - 40  # DYNAMIC: "Hi {firstName},"
COVER_INTRO_Y1 = COVER_GREETING_Y - 26
COVER_INTRO_Y2 = COVER_INTRO_Y1 - 20
COVER_BOX_TOP = COVER_INTRO_Y2 - 24
COVER_BOX_LABEL_Y = COVER_BOX_TOP - 28
COVER_ROW_H = 28
COVER_ROW0_Y = COVER_BOX_LABEL_Y - 24    # DYNAMIC: DSCR ratio value
COVER_ROW1_Y = COVER_ROW0_Y - COVER_ROW_H  # DYNAMIC: Down payment value
COVER_ROW2_Y = COVER_ROW1_Y - COVER_ROW_H  # DYNAMIC: Est. rate value
COVER_ROW3_Y = COVER_ROW2_Y - COVER_ROW_H  # DYNAMIC: Est. loan amount value
COVER_BOX_BOTTOM = COVER_ROW3_Y - 14
COVER_VALUE_X = PAGE_W - COVER_MARGIN     # right-aligned value column
COVER_INSIDE_LABEL_Y = COVER_BOX_BOTTOM - 30
COVER_INSIDE_ITEM_Y = [COVER_INSIDE_LABEL_Y - 22 - i * 24 for i in range(3)]
COVER_CTA_TOP = COVER_INSIDE_ITEM_Y[2] - 30
COVER_CTA_H = 36
COVER_CTA_W = 340
COVER_CTA_BOTTOM = COVER_CTA_TOP - COVER_CTA_H
COVER_CTA_URL_Y = COVER_CTA_BOTTOM - 16
COVER_NOTE_Y = COVER_CTA_URL_Y - 22
COVER_SIG_DIVIDER_Y = COVER_NOTE_Y - 24
COVER_SIG_NAME_Y = COVER_SIG_DIVIDER_Y - 20
COVER_SIG_TITLE_Y = COVER_SIG_NAME_Y - 16
COVER_SIG_CONTACT_Y = COVER_SIG_TITLE_Y - 14

INSIDE_ITEMS = [
    ("01", "The 6 levers that actually move your rate"),
    ("02", "5 ways to raise cash flow on the same property"),
    ("03", "Where your down-payment bracket comes from"),
]


def draw_cover(c: canvas_mod.Canvas, doc):
    c.saveState()

    # Page background (white) + teal header block.
    c.setFillColor(colors.white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, PAGE_H - COVER_HEADER_H, PAGE_W, COVER_HEADER_H, fill=1, stroke=0)

    c.setFont("Outfit-SemiBold", 11)
    c.setFillColor(HEADER_TEXT)
    c.drawString(COVER_MARGIN, COVER_EYEBROW_Y, "DSCR QUALIFICATION FOLLOW-UP")

    c.setFont("Outfit-Bold", 28)
    c.setFillColor(colors.white)
    c.drawString(COVER_MARGIN, COVER_TITLE_Y, "Your Rate & Cash Flow Guide")

    # DYNAMIC — mirrored by send-dscr-guide.mts as "Prepared for {fullName}"
    c.setFont("Outfit-Regular", 14)
    c.setFillColor(HEADER_TEXT)
    c.drawString(COVER_MARGIN, COVER_PREPARED_Y, "Prepared for an investor who already ran the numbers")

    c.setFillColor(TEAL_DEEP)
    c.rect(0, COVER_DIVIDER_Y - 3, PAGE_W, 3, fill=1, stroke=0)

    # DYNAMIC — mirrored by send-dscr-guide.mts as "Hi {firstName},"
    c.setFont("Outfit-SemiBold", 16)
    c.setFillColor(TEAL)
    c.drawString(COVER_MARGIN, COVER_GREETING_Y, "Hi there,")

    c.setFont("Outfit-Regular", 15)
    c.setFillColor(TEXT_MUTED)
    c.drawString(COVER_MARGIN, COVER_INTRO_Y1, "Attached is your DSCR Rate & Cash Flow Guide, personalized to the")
    c.drawString(COVER_MARGIN, COVER_INTRO_Y2, "numbers you just ran.")

    # "Your Scenario" box
    c.setFillColor(LIGHT_BG)
    c.setStrokeColor(LIGHT_LINE)
    c.setLineWidth(1)
    c.rect(COVER_MARGIN, COVER_BOX_BOTTOM, PAGE_W - 2 * COVER_MARGIN,
           COVER_BOX_TOP - COVER_BOX_BOTTOM, fill=1, stroke=1)

    c.setFont("Outfit-SemiBold", 10)
    c.setFillColor(TEAL)
    c.drawString(COVER_MARGIN + 20, COVER_BOX_LABEL_Y, "YOUR SCENARIO")

    rows = [
        ("DSCR ratio", COVER_ROW0_Y),
        ("Down payment", COVER_ROW1_Y),
        ("Est. rate", COVER_ROW2_Y),
        ("Est. loan amount", COVER_ROW3_Y),
    ]
    for i, (label, row_y) in enumerate(rows):
        if i > 0:
            c.setStrokeColor(LIGHT_LINE)
            c.line(COVER_MARGIN + 20, row_y + 14, PAGE_W - COVER_MARGIN - 20, row_y + 14)
        c.setFont("Outfit-Regular", 13)
        c.setFillColor(TEXT_MUTED)
        c.drawString(COVER_MARGIN + 20, row_y, label)
        # DYNAMIC value — send-dscr-guide.mts masks+redraws this cell per row
        c.setFont("Outfit-Bold", 15)
        c.setFillColor(TEAL)
        c.drawRightString(COVER_VALUE_X - 20, row_y, "—")

    # "Inside the guide"
    c.setFont("Outfit-SemiBold", 10)
    c.setFillColor(TEAL)
    c.drawString(COVER_MARGIN, COVER_INSIDE_LABEL_Y, "INSIDE THE GUIDE")

    for (num, text), item_y in zip(INSIDE_ITEMS, COVER_INSIDE_ITEM_Y):
        c.setFont("Outfit-Bold", 12)
        c.setFillColor(TEAL)
        c.drawString(COVER_MARGIN, item_y, num)
        c.setFont("Outfit-Regular", 12)
        c.setFillColor(TEXT_MUTED)
        c.drawString(COVER_MARGIN + 26, item_y, text)

    # CTA button (non-clickable in print — URL spelled out beneath, matches
    # the same convention as the CTA page later in this document)
    c.setFillColor(CTA_BLUE)
    c.rect(COVER_MARGIN, COVER_CTA_BOTTOM, COVER_CTA_W, COVER_CTA_H, fill=1, stroke=0)
    c.setFont("Outfit-SemiBold", 12)
    c.setFillColor(colors.white)
    c.drawCentredString(COVER_MARGIN + COVER_CTA_W / 2, COVER_CTA_BOTTOM + 13,
                         "Book your free 15-min strategy call")
    c.setFont("Outfit-Regular", 9.5)
    c.setFillColor(TEAL)
    c.drawString(COVER_MARGIN, COVER_CTA_URL_Y, BOOKING)

    c.setFont("Outfit-Regular", 11)
    c.setFillColor(TEXT_MUTED)
    c.drawString(COVER_MARGIN, COVER_NOTE_Y,
                 "A loan officer will also reach out shortly to walk through your actual rate and terms.")

    c.setStrokeColor(LIGHT_LINE)
    c.line(COVER_MARGIN, COVER_SIG_DIVIDER_Y, PAGE_W - COVER_MARGIN, COVER_SIG_DIVIDER_Y)

    c.setFont("Outfit-Bold", 13)
    c.setFillColor(TEAL)
    c.drawString(COVER_MARGIN, COVER_SIG_NAME_Y, COMPANY_NAME)
    c.setFont("Outfit-Regular", 10)
    c.setFillColor(TEXT_MUTED)
    c.drawString(COVER_MARGIN, COVER_SIG_TITLE_Y, "Mortgage & Real Estate Broker · Saxton Mortgage")
    c.drawString(COVER_MARGIN, COVER_SIG_CONTACT_Y, f"{PHONE} · {EMAIL}")

    c.restoreState()


# ---------------- Title page (page 2 — full-bleed navy, site brand) ----------------
TITLE_LINES = ["Your Rate Isn't Fixed.", "Here's What Actually", "Moves It."]
TITLE_DISCLAIMER = [
    "This guide is provided for general educational and informational purposes only and does not constitute a loan offer,",
    "pre-qualification, pre-approval, or commitment to lend. Rates, terms, and figures shown are estimates; actual eligibility",
    "and pricing are determined by underwriting. Darren Tsai, DRE #02103705 | NMLS #2438102 | Saxton Mortgage,",
    "NMLS #2525913. Equal Housing Opportunity.",
]
TITLE_SUB = [
    "A quick-reference guide for investors who ran the DSCR",
    "qualification calculator and want to know what happens next.",
]


def draw_title(c: canvas_mod.Canvas, doc):
    c.saveState()

    # Matches the rate PDF's header block color (TEAL) so the guide's opening
    # page ties visually to the rate PDF it's sent alongside.
    c.setFillColor(TEAL)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(CTA_BLUE)
    c.rect(0, PAGE_H - 7, PAGE_W, 7, fill=1, stroke=0)

    c.setFont("Outfit-SemiBold", 11)
    c.setFillColor(HEADER_TEXT)
    c.drawString(COVER_MARGIN, PAGE_H - 118, "DSCR QUALIFICATION FOLLOW-UP")

    c.setFont("Outfit-Bold", 36)
    c.setFillColor(colors.white)
    for i, line in enumerate(TITLE_LINES):
        c.drawString(COVER_MARGIN, PAGE_H - 178 - i * 44, line)

    c.setStrokeColor(CTA_BLUE)
    c.setLineWidth(3)
    c.line(COVER_MARGIN, PAGE_H - 312, COVER_MARGIN + 96, PAGE_H - 312)

    c.setFont("Outfit-Regular", 13)
    c.setFillColor(HEADER_TEXT)
    for i, line in enumerate(TITLE_SUB):
        c.drawString(COVER_MARGIN, PAGE_H - 348 - i * 21, line)

    c.setFont("Outfit-SemiBold", 9.5)
    c.setFillColor(HEADER_TEXT)  # same color as the "DSCR QUALIFICATION FOLLOW-UP" eyebrow above
    c.drawString(COVER_MARGIN, 186, "PREPARED FOR AN INVESTOR WHO ALREADY RAN THE NUMBERS")

    # CTA_BLUE, not literal TEAL — a TEAL stroke would be invisible against the
    # TEAL background; CTA_BLUE matches the other accent rules on this page.
    c.setStrokeColor(CTA_BLUE)
    c.setLineWidth(0.75)
    c.line(COVER_MARGIN, 166, PAGE_W - COVER_MARGIN, 166)

    c.setFont("Outfit-Regular", 12)
    c.setFillColor(colors.white)
    c.drawString(COVER_MARGIN, 142, f"{COMPANY_NAME}  |  {PHONE}  |  {EMAIL}")
    c.setFont("Outfit-Regular", 9)
    c.setFillColor(HEADER_TEXT)
    c.drawString(COVER_MARGIN, 124, NMLS)

    c.setFont("Outfit-Regular", 7.3)
    c.setFillColor(colors.HexColor("#93B3BF"))
    for i, line in enumerate(TITLE_DISCLAIMER):
        c.drawString(COVER_MARGIN, 96 - i * 10.5, line)

    c.restoreState()


# ---------------- Story ----------------
story = []

# ---- Page 2: Where your number comes from ----
story.append(Paragraph("SECTION 01", eyebrow_style))
story.append(Paragraph("Where Your Number Actually Comes From", h1_style))
story.append(rule())
story.append(Paragraph(
    "Your DSCR calculator result compares your property's monthly rent to its estimated "
    "monthly mortgage payment (principal, interest, taxes, insurance, and HOA, often "
    "shortened to PITIA). Most DSCR lenders set their minimum qualifying line at a ratio "
    "of 1.00, meaning the rent covers the payment dollar for dollar. Above that line, you "
    "generally qualify. Below it, you're in territory where the loan needs to be structured "
    "differently, or you need a lender willing to work outside the standard line.",
    body_style))
story.append(Paragraph(
    "The rate used in your estimate was based on which down payment bracket you landed in:",
    body_style))

bracket_data = [
    ["Down Payment", "Estimated Rate Range"],
    ["20%", "7.50%"],
    ["25% – 30%", "7.00%"],
    ["30% – 50%", "6.75%"],
]
bt = Table(bracket_data, colWidths=[220, 220])
bt.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (-1, 0), "Outfit-SemiBold"),
    ("FONTNAME", (0, 1), (-1, -1), "Outfit-Regular"),
    ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("BACKGROUND", (0, 0), (-1, 0), INK),
    ("BACKGROUND", (0, 1), (-1, -1), PAPER),
    ("TEXTCOLOR", (0, 1), (-1, -1), INK_SOFT),
    ("GRID", (0, 0), (-1, -1), 0.5, LINE),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
]))
story.append(Spacer(1, 4))
story.append(bt)
story.append(Spacer(1, 10))
story.append(Paragraph(
    "This is a market-range estimate, not a locked quote, your actual rate still moves "
    "based on the factors below, sometimes by more than the bracket itself does.",
    callout_style))

story.append(Spacer(1, 6))
story.append(rule())
story.append(Paragraph(
    "<b>The part most calculators leave out:</b> your down payment isn't the only lever "
    "connected to your rate, and your rate isn't the only lever connected to your cash flow. "
    "The next two sections name the other levers: how they apply to your specific deal is "
    "the conversation that happens on a call, not on a page.",
    body_style))

story.append(PageBreak())

# ---- Page 3: Rate levers ----
story.append(Paragraph("SECTION 02", eyebrow_style))
story.append(Paragraph("6 Levers That Move Your Rate", h1_style))
story.append(Paragraph(
    "Beyond the down payment bracket, these are the factors that shift where an investor "
    "actually lands within, or below, their estimated range.",
    sub_style))
story.append(rule())

rate_items = [
    ("01", "Discount points / rate buydown",
     "Paying a fee at closing to reduce your rate is common on DSCR loans. Whether it's "
     "worth it depends on how long you plan to hold the property and how the math breaks "
     "even, a calculation that changes deal to deal."),
    ("02", "Interest-only structuring",
     "An interest-only period lowers the monthly payment used in your DSCR math, which can "
     "be the difference between qualifying and not on a tight deal. It also changes how your "
     "equity builds over time, so it's a trade-off worth walking through, not a default choice."),
    ("03", "Prepayment penalty structure",
     "DSCR loans price differently depending on the prepayment penalty term you choose. "
     "Investors planning to refinance or sell within a few years often trade a slightly "
     "different rate for a shorter penalty window. Buy-and-hold investors usually go the "
     "other direction."),
    ("04", "Entity and experience credit",
     "Some lenders price more aggressively for borrowers with a landlord track record or a "
     "specific entity/LLC structure already in place. This isn't universal: it depends on "
     "which lender is looking at the file."),
    ("05", "Portfolio / multi-property pricing",
     "Bundling more than one property, or being a repeat investor with a lender, can unlock "
     "pricing that a single, first-time DSCR loan won't see."),
    ("06", "Credit profile positioning",
     "Two investors at the same down payment bracket can still land in different places "
     "within that range depending on credit profile. Small, fixable things sometimes move "
     "this more than people expect."),
]
for num, title, body in rate_items:
    story.append(numbered_item(num, title, body))

story.append(PageBreak())

# ---- Page 4: Cash flow levers ----
story.append(Paragraph("SECTION 03", eyebrow_style))
story.append(Paragraph("5 Ways to Increase Cash Flow on the Same Property", h1_style))
story.append(Paragraph(
    "Your DSCR ratio isn't fixed the moment you run the numbers once. These are the most "
    "common places investors find room: some on the loan side, some on the property side.",
    sub_style))
story.append(rule())

cashflow_items = [
    ("01", "Rent positioning vs. appraised rent",
     "Lenders use a market rent figure that doesn't always match what a property can "
     "actually lease for. Where the gap exists, and whether it can be documented, directly "
     "affects your ratio."),
    ("02", "Insurance shopping",
     "Insurance is one of the few PITIA components that can often be reduced without "
     "changing anything about the loan itself. It's frequently the most overlooked line item."),
    ("03", "Property tax reassessment or appeal",
     "Depending on the county and recent purchase price, a tax appeal can lower the monthly "
     "escrow figure baked into your PITIA, worth checking before you assume the number is fixed."),
    ("04", "Loan structure choice",
     "As covered in Section 02, the same loan amount can carry a different monthly payment "
     "depending on structure (interest-only vs. amortizing, rate vs. points). That payment is "
     "the denominator in your DSCR ratio."),
    ("05", "Reserve strategy",
     "How much you hold in reserves can affect both what you qualify for and what terms are "
     "available to you, sometimes reserves do more work than an extra few points of down payment."),
]
for num, title, body in cashflow_items:
    story.append(numbered_item(num, title, body))

story.append(rule())
story.append(Paragraph(
    "<b>What this guide can't tell you:</b> which of these levers apply to your deal, how "
    "much they'd move your specific number, or which ones stack well together. That depends "
    "on your property, your lender options, and your goals, which is exactly what a "
    "strategy call is for.",
    body_style))

story.append(PageBreak())

# ---- Final page: CTA (dark, matches cover) ----
cta_story = []
cta_story.append(Paragraph("SECTION 04", eyebrow_style))
cta_story.append(Paragraph(
    "The Investors Who Get the Best Terms Aren't the Ones With the Most Cash Down.",
    h2_style))
cta_story.append(Paragraph(
    "They're the ones who know which levers apply to their deal before they apply for the "
    "loan, not after they've already been quoted a rate.",
    body_style))
cta_story.append(Spacer(1, 6))
cta_story.append(Paragraph(
    "Bring your calculator result to a free 15-minute DSCR strategy call. We'll go through "
    "which of the levers in this guide actually apply to your property, what your real rate "
    "range looks like once they're factored in, and whether restructuring the loan gets you "
    "to a stronger number.",
    body_style))
cta_story.append(Spacer(1, 14))

cta_table = Table(
    [[Paragraph(f"<b>Book your free strategy call</b><br/>{BOOKING}",
                ParagraphStyle("ctaline", parent=body_style, textColor=colors.white,
                                fontSize=11, leading=16))]],
    colWidths=[460],
)
cta_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), BRASS),
    ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
    ("TOPPADDING", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("LEFTPADDING", (0, 0), (-1, -1), 16),
]))
cta_story.append(cta_table)
cta_story.append(Spacer(1, 18))
cta_story.append(Paragraph(f"{PHONE}   ·   {EMAIL}", ParagraphStyle(
    "ctacontact", parent=body_style, fontName="Outfit-Regular", fontSize=9.5, textColor=INK_SOFT)))

cta_story.append(Spacer(1, 40))
cta_story.append(Paragraph(
    "This guide is provided for general educational and informational purposes only and does "
    "not constitute a loan offer, pre-qualification, pre-approval, or commitment to lend. "
    "Rates, terms, and strategies described are general in nature and may not apply to every "
    "borrower or property; actual eligibility, pricing, and terms are determined by "
    "underwriting and may vary based on credit profile, property type, loan amount, reserves, "
    "and other factors. This is not a guarantee of financing or of any specific rate reduction "
    "or cash flow outcome. " + f"{COMPANY_NAME}, {NMLS}. Equal Housing Opportunity.",
    disclaimer_style
))

story.append(KeepTogether(cta_story))


from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame
from reportlab.platypus.doctemplate import NextPageTemplate


def on_cover_page(c, doc):
    draw_cover(c, doc)


def on_title_page(c, doc):
    draw_title(c, doc)


def on_later_pages(c, doc):
    draw_header_footer(c, doc)


OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "public", "magnets", "dscr-rate-cashflow-guide.pdf")

doc = BaseDocTemplate(
    OUT_PATH,
    pagesize=letter,
    title="DSCR Rate & Cash Flow Guide",
)

# Tiny 1x1 frame just to satisfy the flowable requirement on the cover page;
# all real cover content is drawn straight onto the canvas in on_cover_page.
cover_frame = Frame(PAGE_W / 2, PAGE_H / 2, 1, 1, id="coverFrame",
                     leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

# Same dummy-frame trick for the canvas-drawn title page.
title_frame = Frame(PAGE_W / 2, PAGE_H / 2, 1, 1, id="titleFrame",
                     leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

content_frame = Frame(
    0.85 * inch, 0.9 * inch,
    PAGE_W - 1.7 * inch, PAGE_H - 1.9 * inch,
    id="contentFrame",
)

doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover_page),
    PageTemplate(id="Title", frames=[title_frame], onPage=on_title_page),
    PageTemplate(id="Later", frames=[content_frame], onPage=on_later_pages),
])

full_story = [
    Spacer(1, 0.1), NextPageTemplate("Title"), PageBreak(),
    Spacer(1, 0.1), NextPageTemplate("Later"), PageBreak(),
] + story

doc.build(full_story)
print("done ->", OUT_PATH)
