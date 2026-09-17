// Built-in "Starter" presets shown in each marketing tool's picker.
// Pure app constants (no DB): the dealer applies one with a click, tweaks it,
// then saves it as their own. Content is tuned for Irish used-car dealers.

export interface StarterScript {
  name: string;
  channel: string; // "" = any channel
  body: string;
}

export const starterScripts: StarterScript[] = [
  {
    name: "Showroom detail — full listing",
    channel: "donedeal",
    body: [
      "{year} {make} {model} — {price}",
      "",
      "Presented in excellent condition here at {dealer}.",
      "",
      "• {specs}",
      "• {km}",
      "• NCT: {nct}",
      "• Warranty: {warranty}",
      "",
      "Fully serviced and ready to drive away. Trade-ins welcome and finance can be arranged. Call or message us today to book a viewing or test drive.",
    ].join("\n"),
  },
  {
    name: "Punchy social post",
    channel: "facebook",
    body: [
      "🚗 JUST IN — {year} {make} {model}",
      "",
      "{specs} • {km}",
      "Now {price}",
      "",
      "📩 DM us to book a test drive before it's gone!",
    ].join("\n"),
  },
  {
    name: "Finance-first",
    channel: "",
    body: [
      "Drive away the {year} {make} {model} from {dealer}.",
      "",
      "{specs}",
      "{price} — flexible finance available, low-deposit options.",
      "",
      "Every car NCT'd and backed by {warranty}. Message us to check your eligibility today.",
    ].join("\n"),
  },
];

export interface StarterRecipe {
  name: string;
  config: { push?: string; audience?: string; promotionId?: string; angle?: string };
}

export const starterRecipes: StarterRecipe[] = [
  {
    name: "Weekend showcase",
    config: { push: "soft", audience: "local weekend browsers", angle: "" },
  },
  {
    name: "Price-drop urgency",
    config: {
      push: "hard",
      audience: "deal hunters watching for a bargain",
      angle: "Limited-time price — act now",
    },
  },
  {
    name: "Family-ready",
    config: {
      push: "balanced",
      audience: "families needing space and safety",
      angle: "Room, comfort and safety for the whole family",
    },
  },
];

export interface StarterPromotion {
  title: string;
  kind: string;
  brief: string;
  offer_details: string;
  included: string;
  excluded: string;
  terms: string;
}

export const starterPromotions: StarterPromotion[] = [
  {
    title: "Summer Runaround Sale",
    kind: "seasonal",
    brief: "Bright, sunny push on affordable small cars for summer commutes and holidays.",
    offer_details:
      "Selected small cars with a free first service and a full tank of fuel on collection.",
    included: [
      "Free first service (up to 12 months / 10,000 km)",
      "Full tank of fuel on collection",
      "Complimentary valet",
    ].join("\n"),
    excluded: [
      "Commercial vehicles",
      "Cars already marked as reduced",
      "Cannot be combined with other offers",
    ].join("\n"),
    terms:
      "Offer valid on selected vehicles while stocks last. The free first service applies within 12 months or 10,000 km, whichever comes first. Full tank and valet are provided on collection only. Subject to availability and dealer discretion. Terms may change without notice.",
  },
  {
    title: "Low-Deposit Finance Weekend",
    kind: "finance",
    brief: "Two-day finance event highlighting low-deposit PCP and HP options.",
    offer_details:
      "Low-deposit finance from as little as €0–€500 down on approved applications, plus a €200 fuel voucher on completed deals.",
    included: [
      "Low-deposit finance on approved applications",
      "€200 fuel voucher on completed finance deals",
      "Free finance eligibility check",
    ].join("\n"),
    excluded: [
      "Cash purchases",
      "Applicants who do not meet lender criteria",
      "Vouchers have no cash value",
    ].join("\n"),
    terms:
      "Finance is subject to lender approval and status. The deposit amount depends on the vehicle and applicant profile. The €200 fuel voucher applies to completed finance purchases only and has no cash alternative. Offer available during the advertised weekend only. The dealership acts as a credit intermediary, not a lender. Lending criteria, terms and conditions apply.",
  },
  {
    title: "Trade-In Appraisal Day",
    kind: "event",
    brief: "One-day showroom event inviting customers for a free trade-in valuation and upgrade.",
    offer_details:
      "Free same-day trade-in appraisal, with an extra €500 trade-in bonus when you upgrade to a newer car on the day.",
    included: [
      "Free same-day trade-in valuation",
      "€500 additional trade-in bonus on an upgrade purchase",
      "Refreshments on the day",
    ].join("\n"),
    excluded: [
      "Vehicles with outstanding finance exceeding their value",
      "Category write-off vehicles",
      "Bonus applies to upgrades completed on the event day only",
    ].join("\n"),
    terms:
      "Trade-in valuations are provided free and without obligation. The €500 bonus applies only to upgrade purchases completed on the day of the event and cannot be exchanged for cash. The final trade-in value is subject to inspection. The dealership reserves the right to decline any vehicle. Terms and conditions apply.",
  },
];

export interface StarterBlock {
  name: string;
  kind: string; // warranty | finance | hours | trade_in | custom
  body: string;
}

export const starterBlocks: StarterBlock[] = [
  {
    name: "Standard warranty",
    kind: "warranty",
    body: "Every car is sold with a comprehensive warranty and a full service history where available. Extended warranty options are available on request.",
  },
  {
    name: "Finance available",
    kind: "finance",
    body: "Flexible finance available with low-deposit options, subject to lender approval. Get a quick, no-obligation quote — trade-ins welcome against your deposit.",
  },
  {
    name: "Opening hours & viewings",
    kind: "hours",
    body: "Open Mon–Fri 9am–6pm and Sat 10am–4pm. Viewings and test drives by appointment — call or message us to arrange a time that suits you.",
  },
];

