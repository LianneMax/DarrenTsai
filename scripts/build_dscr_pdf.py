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

# ---------------- Palette (matches the calculator) ----------------
INK = colors.HexColor("#161D27")
INK_SOFT = colors.HexColor("#3A4451")
PAPER = colors.HexColor("#F1F3EF")
BRASS = colors.HexColor("#B8893D")
BRASS_DEEP = colors.HexColor("#8F6A2E")
GREEN = colors.HexColor("#33604A")
RUST = colors.HexColor("#9C4A34")
LINE = colors.HexColor("#D8DCD3")
CREAM_TEXT = colors.HexColor("#EAE5D8")

COMPANY_NAME = "Darren Tsai"
NMLS = "DRE #02103705 | NMLS #2438102 | Saxton Mortgage, NMLS #2525913"
PHONE = "714-887-5432"
EMAIL = "darren@realdarrentsai.com"
BOOKING = "https://calendly.com/realdarrentsai/15min"

PAGE_W, PAGE_H = letter

styles = getSampleStyleSheet()

eyebrow_style = ParagraphStyle(
    "Eyebrow", parent=styles["Normal"], fontName="Courier-Bold", fontSize=9,
    textColor=BRASS_DEEP, tracking=1, leading=12, spaceAfter=6,
)
h1_style = ParagraphStyle(
    "H1", parent=styles["Title"], fontName="Times-Bold", fontSize=25,
    leading=29, textColor=INK, alignment=TA_LEFT, spaceAfter=10,
)
h2_style = ParagraphStyle(
    "H2", parent=styles["Heading1"], fontName="Times-Bold", fontSize=17,
    leading=21, textColor=INK, spaceBefore=4, spaceAfter=8,
)
h3_style = ParagraphStyle(
    "H3", parent=styles["Heading2"], fontName="Times-Bold", fontSize=12.5,
    leading=16, textColor=BRASS_DEEP, spaceBefore=2, spaceAfter=4,
)
body_style = ParagraphStyle(
    "Body", parent=styles["Normal"], fontName="Helvetica", fontSize=10.3,
    leading=15.5, textColor=INK_SOFT, spaceAfter=8,
)
body_tight = ParagraphStyle(
    "BodyTight", parent=body_style, spaceAfter=2,
)
sub_style = ParagraphStyle(
    "Sub", parent=styles["Normal"], fontName="Helvetica", fontSize=11.5,
    leading=17, textColor=INK_SOFT, spaceAfter=14,
)
item_title_style = ParagraphStyle(
    "ItemTitle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=11,
    leading=14, textColor=INK, spaceAfter=2,
)
item_body_style = ParagraphStyle(
    "ItemBody", parent=styles["Normal"], fontName="Helvetica", fontSize=9.8,
    leading=14.5, textColor=INK_SOFT, spaceAfter=12,
)
callout_style = ParagraphStyle(
    "Callout", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=10,
    leading=15, textColor=INK, spaceAfter=8,
)
mono_small = ParagraphStyle(
    "MonoSmall", parent=styles["Normal"], fontName="Courier", fontSize=8,
    leading=11, textColor=INK_SOFT,
)
disclaimer_style = ParagraphStyle(
    "Disclaimer", parent=styles["Normal"], fontName="Helvetica", fontSize=7.3,
    leading=10.5, textColor=colors.HexColor("#7C8574"),
)
cream_body = ParagraphStyle(
    "CreamBody", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
    leading=16, textColor=CREAM_TEXT, spaceAfter=8,
)
cream_h2 = ParagraphStyle(
    "CreamH2", parent=styles["Heading1"], fontName="Times-Bold", fontSize=19,
    leading=23, textColor=colors.white, spaceAfter=10,
)


def rule(color=LINE, thickness=0.75, space_before=4, space_after=10):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                       spaceBefore=space_before, spaceAfter=space_after)


def numbered_item(num, title, body):
    t = Table(
        [[Paragraph(num, ParagraphStyle("num", fontName="Courier-Bold",
                                        fontSize=13, textColor=BRASS_DEEP)),
          Paragraph(f"<b>{title}</b><br/>{body}", ParagraphStyle(
              "combo", fontName="Helvetica", fontSize=9.8, leading=14.5,
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
    c.setFont("Courier-Bold", 8)
    c.setFillColor(BRASS_DEEP)
    c.drawString(0.85 * inch, PAGE_H - 0.6 * inch, "DSCR RATE & CASH FLOW GUIDE")
    c.setFillColor(INK_SOFT)
    c.drawRightString(PAGE_W - 0.85 * inch, PAGE_H - 0.6 * inch, COMPANY_NAME)
    # footer
    c.setStrokeColor(LINE)
    c.line(0.85 * inch, 0.65 * inch, PAGE_W - 0.85 * inch, 0.65 * inch)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(INK_SOFT)
    c.drawString(0.85 * inch, 0.48 * inch, f"{COMPANY_NAME}  ·  {NMLS}  ·  Equal Housing Opportunity")
    c.drawRightString(PAGE_W - 0.85 * inch, 0.48 * inch, f"Page {doc.page}")
    c.restoreState()


def draw_cover(c: canvas_mod.Canvas, doc):
    c.saveState()
    # full ink background
    c.setFillColor(INK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # thin brass rule near top
    c.setStrokeColor(BRASS)
    c.setLineWidth(1)
    c.line(0.9 * inch, PAGE_H - 1.5 * inch, 2.4 * inch, PAGE_H - 1.5 * inch)

    c.setFont("Courier-Bold", 10)
    c.setFillColor(BRASS)
    c.drawString(0.9 * inch, PAGE_H - 1.75 * inch, "DSCR QUALIFICATION FOLLOW-UP")

    c.setFont("Times-Bold", 30)
    c.setFillColor(colors.white)
    c.drawString(0.9 * inch, PAGE_H - 2.6 * inch, "Your Rate Isn't Fixed.")
    c.drawString(0.9 * inch, PAGE_H - 3.05 * inch, "Here's What Actually")
    c.drawString(0.9 * inch, PAGE_H - 3.5 * inch, "Moves It.")

    c.setFont("Helvetica", 11.5)
    c.setFillColor(CREAM_TEXT)
    lines = [
        "A quick-reference guide for investors who ran the DSCR",
        "qualification calculator and want to know what happens next.",
    ]
    y = PAGE_H - 4.05 * inch
    for line in lines:
        c.drawString(0.9 * inch, y, line)
        y -= 0.22 * inch

    # bottom info block
    c.setStrokeColor(colors.HexColor("#3A4451"))
    c.setLineWidth(0.75)
    c.line(0.9 * inch, 1.55 * inch, PAGE_W - 0.9 * inch, 1.55 * inch)

    c.setFont("Courier", 8.5)
    c.setFillColor(colors.HexColor("#9099A6"))
    c.drawString(0.9 * inch, 1.3 * inch, "PREPARED FOR AN INVESTOR WHO ALREADY RAN THE NUMBERS")
    c.setFont("Helvetica", 9)
    c.setFillColor(CREAM_TEXT)
    c.drawString(0.9 * inch, 1.0 * inch, f"{COMPANY_NAME}   |   {PHONE}   |   {EMAIL}")
    c.drawString(0.9 * inch, 0.8 * inch, NMLS)

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
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -1), "Courier"),
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
                ParagraphStyle("ctaline", parent=body_style, textColor=INK,
                                fontSize=11, leading=16))]],
    colWidths=[460],
)
cta_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), BRASS),
    ("TEXTCOLOR", (0, 0), (-1, -1), INK),
    ("TOPPADDING", (0, 0), (-1, -1), 14),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ("LEFTPADDING", (0, 0), (-1, -1), 16),
]))
cta_story.append(cta_table)
cta_story.append(Spacer(1, 18))
cta_story.append(Paragraph(f"{PHONE}   ·   {EMAIL}", ParagraphStyle(
    "ctacontact", parent=body_style, fontName="Courier", fontSize=9.5, textColor=INK_SOFT)))

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


def on_later_pages(c, doc):
    draw_header_footer(c, doc)


doc = BaseDocTemplate(
    "/home/claude/dscr-rate-cashflow-guide.pdf",
    pagesize=letter,
    title="DSCR Rate & Cash Flow Guide",
)

# Tiny 1x1 frame just to satisfy the flowable requirement on the cover page;
# all real cover content is drawn straight onto the canvas in on_cover_page.
cover_frame = Frame(PAGE_W / 2, PAGE_H / 2, 1, 1, id="coverFrame",
                     leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

content_frame = Frame(
    0.85 * inch, 0.9 * inch,
    PAGE_W - 1.7 * inch, PAGE_H - 1.9 * inch,
    id="contentFrame",
)

doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover_page),
    PageTemplate(id="Later", frames=[content_frame], onPage=on_later_pages),
])

full_story = [Spacer(1, 0.1), NextPageTemplate("Later"), PageBreak()] + story

doc.build(full_story)
print("done")
