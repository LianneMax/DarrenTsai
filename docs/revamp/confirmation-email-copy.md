# Contextual confirmation emails: copy for sign-off (draft, 8 Oct 2026)

Status: **draft, not wired up.** Nothing sends any of this. The only confirmation email live today is the contact modal's ("Got your details, here is my calendar"), and it is unchanged, byte for byte.

**See them rendered:** open `docs/revamp/emails/index.html` in a browser. Each preview is produced by the real template (`netlify/functions/send-contact-confirmation.mts`), so the layout, colours, greeting, signature, licence footer and unsubscribe line are the live email's. After a copy change, run `npm run emails` to regenerate them.

Source: brief section 11.1 (the four funnels, the proposed subjects, the rules) and the live template in `netlify/functions/send-contact-confirmation.mts`.

## What needs your decision

1. The four emails below: subject, headline and body. Edit freely.
2. Whether Saxton compliance needs to see them before they go out. They are sent to borrowers and they talk about loans.
3. Whether debt leads should get an email at all before Home Equity and ADU ship. Today a debt lead gets nothing; this would be the first.

Decided (Max, 9 Oct): the emails keep "I will be in touch.", since Darren signs them; the site says "Darren will be in touch."

## Rules every version follows

- Says the request **was received**. Never that Darren has read it, reviewed it or approved anything.
- No response time is promised. The only statement about what happens next is "I will be in touch."
- No dollar figure, rate or payment from the calculator is repeated. The estimate is called a starting point.
- No attachment, and no mention of one.
- Only what the visitor typed is echoed, and only free text they wrote (the Mortgage Calculator and contact forms' message). Dropdown answers are named in a sentence, never as a table.
- Same design as the live email: teal header, "Darren Tsai, Senior Loan Officer, Saxton Mortgage", the licence footer with NMLS #2438102 and Saxton Mortgage, LLC NMLS #1717191, the address, and the unsubscribe line.
- One button, "Pick a time", then "Or call me directly: (714) 887-5432".
- No em-dashes.

## Shared parts (identical in all four)

| Part | Copy |
| --- | --- |
| Header label | Your request |
| Greeting | Hi {first name}, |
| Button | Pick a time |
| Under the button | Or call me directly: (714) 887-5432 |
| Sign-off | Talk soon, Darren |
| Footer | Unchanged from the live email |

If there is no first name: "Hi there,".

## 1. Debt Consolidation

Sent to: a lead from the debt calculator (`DebtConsolidation`), on `/` or `/debt-consolidation/`.

| Part | Copy |
| --- | --- |
| Subject | Got your debt comparison request, here is my calendar |
| Preview line | Your request has been received. The comparison you ran is a starting point. |
| Headline | Your request has been received |
| Paragraph 1 | Thanks for running the comparison and sending it over. Your numbers came through with your request, so you will not need to enter them again. |
| Paragraph 2 | What you saw is an estimate. It shows how the monthly payment could change, which is not the same as what each option costs in total. Lower monthly payments do not necessarily mean lower total borrowing costs. |
| Paragraph 3 | On a call we can go through the actual rates, the fees, how long each option takes to pay off, and what it means to give up the rate on your current mortgage. |
| Before the button | I will be in touch. If you would like to pick a time yourself, choose any 15 minutes that suits you. No credit pull, no obligation. |

Paragraph 2 ends with the exact line the calculator shows under its cards, so the two stay identical.

## 2. Home Equity

Sent to: a lead from `/home-equity/` (`home-equity`). The page does not exist yet.

| Part | Copy |
| --- | --- |
| Subject | Got your home equity request, here is my calendar |
| Preview line | Your request has been received. Here is what happens next. |
| Headline | Your request has been received |
| Paragraph 1 | Thanks for sending your home equity request. {If a goal was chosen: You told me this is for {goal in lower case}.} |
| Paragraph 2 | The equity figure you saw is an estimate: your home's value less what you owe on it. It is not an amount you have been approved to borrow. Lenders also look at credit, income, the property and how much of the value has to stay in the home. |
| Paragraph 3 | On a call we can look at which ways of using your equity could fit, what you may be eligible for, and the actual terms from lenders. |
| Before the button | I will be in touch. If you would like to pick a time yourself, choose any 15 minutes that suits you. No credit pull, no obligation. |

Goal wording, from the form's five options: "paying off debt", "a renovation or ADU", "an investment", "a major expense". For "Something Else" the sentence is left out.

## 3. Renovation / ADU

Sent to: a lead from `/adu/` (`adu`). The page does not exist yet.

| Part | Copy |
| --- | --- |
| Subject | Got your project funding request, here is my calendar |
| Preview line | Your request has been received. Funding and the project itself are two separate checks. |
| Headline | Your request has been received |
| Paragraph 1 | Thanks for sending the details of your project. {If a purpose was chosen: You told me it is {purpose}.} |
| Paragraph 2 | There are two separate questions here. The first is funding: what you could borrow, how, and on what terms. That is the part I can help with. The second is the project: zoning, permits, site conditions, cost and timing. Your local planning department and your builder answer that one, and funding does not confirm that the project can be built. |
| Paragraph 3 | On a call we can go through your budget, how much of it you want to finance, and which funding paths are worth looking at. |
| Before the button | I will be in touch. If you would like to pick a time yourself, choose any 15 minutes that suits you. No credit pull, no obligation. |

Purpose wording: "an ADU for family", "a rental ADU", "a renovation". For "Other" the sentence is left out.

## 4. Mortgage Calculator review

Sent to: a lead who asks for a review from `/mortgage-calculator/` (`mortgage-calculator-contact`). Today this person gets the general contact email; this would replace it for this page only.

| Part | Copy |
| --- | --- |
| Subject | Got your mortgage review request, here is my calendar |
| Preview line | Your request has been received. Your calculator numbers came with it. |
| Headline | Your request has been received |
| Paragraph 1 | Thanks for sending your numbers from the mortgage calculator. They came through with your request. |
| "What you told me" box | The message they typed, exactly as the live email shows it. Left out when they typed nothing. |
| Paragraph 2 | The calculator shows principal and interest on the figures you entered. It does not include taxes, insurance or other costs, and the rate you typed is not a quote. |
| Paragraph 3 | On a call we can look at the payment you are aiming for and what financing would actually be available to you. |
| Before the button | I will be in touch. If you would like to pick a time yourself, choose any 15 minutes that suits you. No credit pull, no obligation. |

## Not changing

- **The general contact email** (homepage, DSCR, FHA, REI and debt-page contact modals) keeps its live copy. One thing in it you may want to change for consistency: it says "I will look at your numbers myself", on forms that mostly carry no numbers. Suggested: "Your details reached me. This email is so you know they arrived rather than wondering."
- **The three guide emails** (FHA, DSCR, REI) are untouched. A guide lead gets its guide and no second email.

## Booking link tracking

Each button carries `utm_source=email`, `utm_medium=confirmation` and a campaign that names the funnel, so a booking that starts in an email can be told apart by funnel. The original ad or YouTube attribution stays on the lead's row and is not overwritten.

| Email | `utm_campaign` |
| --- | --- |
| Contact (live) | `contact-modal` |
| Debt Consolidation | `debt-consolidation` |
| Home Equity | `home-equity` |
| Renovation / ADU | `adu` |
| Mortgage Calculator review | `mortgage-calculator-review` |

## When it is wired up (for reference, not part of the sign-off)

- One sender, the existing `send-contact-confirmation`, with a `context` value choosing the copy. No second email system. The template side of this is done so the previews could be rendered; what is not done is anything sending a `context`.
- It sends only after the lead is saved, from the follow-up queue, with the retries the guide emails already have. A failed email never loses the lead and never asks the visitor to submit again.
- The contact email is live, so anything added to it starts sending on deploy. The new contexts will sit behind their own switch until you say go.
- The success screens on the site must not promise an email until this is live.
