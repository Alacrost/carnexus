# Autonexus — Product Vision

> **AI Sales & Marketing Assistant for car dealers in Ireland.**
> We don't sell "AI". We sell: **more cars sold, less time wasted, fewer leads lost.**

## The problem

Independent dealers and small dealer groups in Ireland:

- Lose leads at night and on weekends because nobody replies fast enough.
- Spend hours writing DoneDeal/Carzone ads by hand.
- Have cars sitting in stock too long without noticing.
- Have no idea which ad or channel actually sells cars.
- Waste salespeople's time on unqualified leads.

## The product

A single web platform (SaaS, multi-tenant) whose **core is AI-powered marketing
management**: the dealer uploads real photos, the AI turns them into professional,
on-brand ads and social content, and our in-office marketing team can be granted
access to run Instagram/Facebook/Google campaigns for them. Inventory and CRM
support that core — built specifically for the Irish market (DoneDeal, Carzone,
NCT, Irish finance flows).

---

## Core module: Marketing & AI Studio ⭐

This is the focus of the app. Everything else supports it.

### A. Ad Creator (photo → finished ad)
- Dealer uploads the photos taken on the forecourt.
- **AI enhances quality WITHOUT changing reality**: lighting, sharpness, color
  correction, background cleanup — never altering the car's condition, body, wheels
  or hiding damage. (Legal/trust requirement: the ad must match the real car.)
- **Automatic logo/branding insertion** based on the dealer's Brand Kit:
  standard fields (logo position, size, opacity, frame/banner style) plus
  custom fields defined by the dealer.
- Output: ready-to-publish creative sets per channel (DoneDeal, Facebook,
  Instagram feed/story, Google).

### B. Social Content Generator
- Creates posts and content **optimized per platform**, based on the dealer's
  website, page and visual identity (Brand Kit: colors, fonts, logo, tone of voice).
- Formats: Instagram post/story/reel script, Facebook post, Google Business post.
- Content calendar suggestions (new arrival, price drop, sold/testimonial, promo).

### C. Description Generator + Standard Descriptions
- AI generates the vehicle description from specs + photos.
- **Standard description blocks** per dealer (warranty text, finance options,
  opening hours, trade-in message) automatically appended to every ad.
- Per-channel variants: DoneDeal long-form, Instagram caption, Facebook, website.

### D. Managed Ads Assistance (Instagram / Facebook Ads / Google)
- Personalized campaign assistance for each dealer.
- **One-click agency access**: the dealer grants our in-office marketing team
  access to their marketing module (scoped `agency` role — no customer PII, no
  buy prices, no billing; fully audited and revocable anytime).
- Campaign dashboard: leads generated, cost per lead, cost per sale, best
  campaign, best-performing car.

---

## Supporting modules

### 1. Inventory Management
The base of the system. Vehicle data model inspired by the DoneDeal API.

- Vehicle registration: make, model, year, km, fuel, transmission.
- Buy price, sale price, automatic margin calculation.
- Status pipeline: `Bought → Preparation → Ready for Sale → Reserved → Sold`.
- Vehicle history: photos, services done, NCT expiry, warranty, documents.
- Alerts: car in stock for X days, priced above market, low views, needs promotion.

### 2. AI Vehicle Assistant
- **Ad generator** — see Core module A/C above (photo enhancement, descriptions,
  standard blocks, per-channel formats).
- **Market comparison** — "This BMW 320d is €1,500 above the market average." Shows
  recommended price, similar cars, average time to sell.

### 3. CRM / Sales Pipeline
Funnel: `New Lead → Contacted → Appointment → Test Drive → Finance Applied → Sold → After Sales`.

- Customer records, conversation history, interests, vehicles viewed.
- Automatic follow-up.

### 4. AI Sales Agent
An assistant that works **for** the salesperson. Receives leads from website, Facebook Ads,
Instagram, WhatsApp. Answers questions, asks budget / trade-in / finance, books test drives.
Hands the salesperson a summary:

> "Customer interested in Audi A4. Has €5k deposit. Wants finance. Test drive Saturday."

### 5. Marketing Hub (expanded by the Core module above)
- Integrations: Meta Ads, Google Ads, website, DoneDeal.
- Managed by the dealer or — via agency access — by our marketing team.

### 6. Website Integration
"Chat with us" widget on the dealer's site. Customer asks
*"Do you have automatic SUVs under €20k?"* — the AI answers from the dealer's real inventory.

### 7. Lead Intelligence
Scores every lead: 🔥 Hot / 🟡 Warm / ❄️ Cold. Detects who hasn't replied and who needs follow-up.

### 8. Finance Assistant
Pre-qualifies before the salesperson wastes time: employment status, income, PPS, deposit,
desired monthly payment. **Highly sensitive data — see [SECURITY.md](./SECURITY.md).**

### 9. After Sales
Automatic thank-you message, Google review request, service reminders, warranty tracking.

### 10. Analytics / Business Intelligence
Owner dashboard: cars sold per month, average profit, time in stock, salespeople performance,
leads, conversion rate.

> "You received 342 leads this month. 29 cars sold. Conversion: 8.4%."

### 11. Future integrations
DoneDeal API, Carzone, CarsIreland, Facebook Marketplace, WhatsApp Business API,
Google Business Profile, finance providers.

---

## Pricing

| Plan | Price | Target |
|---|---|---|
| Starter | €99/month | Small independent dealer |
| Professional | €199/month | Established dealer, multiple salespeople |
| Dealer Group | €499+/month | Multi-location groups |

## Positioning

The message a dealer owner in Ireland understands is not "we have AI".
It is: **"More cars sold, less time wasted, fewer leads wasted."**

See [ROADMAP.md](./ROADMAP.md) for the staged build plan and
[DATA_MODEL.md](./DATA_MODEL.md) for the database design.
