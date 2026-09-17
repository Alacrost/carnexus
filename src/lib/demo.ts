// DEV-ONLY demo mode: lets you preview the internal UI without Supabase.
// Activated by NEXT_PUBLIC_DEMO_MODE=true in .env.local — NEVER works in production.
// Remove the flag once a real Supabase project is connected.

import type { SessionContext } from "@/lib/auth";

export function isDemoMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  );
}

export const demoSession: SessionContext = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "owner@demomotors.ie",
  role: "owner",
  dealer: {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Demo Motors (Preview)",
    slug: "demo-motors",
    plan: "professional",
    created_at: new Date().toISOString(),
    modules: { sales: true, marketing: true, website: true },
    terms_accepted_at: new Date().toISOString(),
    terms_version: "2026-01",
  },
};

export const demoVehicles = [
  {
    id: "v1",
    make: "Volkswagen",
    model: "Golf 1.6 TDI Highline",
    year: 2019,
    km: 98000,
    registration: "191-D-45210",
    fuel: "diesel",
    transmission: "manual",
    sale_price: 17950,
    status: "ready_for_sale",
  },
  {
    id: "v2",
    make: "BMW",
    model: "320d M Sport",
    year: 2020,
    km: 74500,
    registration: "201-D-88134",
    fuel: "diesel",
    transmission: "automatic",
    sale_price: 28500,
    status: "ready_for_sale",
  },
  {
    id: "v3",
    make: "Toyota",
    model: "Corolla Hybrid Luna",
    year: 2021,
    km: 45200,
    registration: "211-C-30945",
    fuel: "hybrid",
    transmission: "automatic",
    sale_price: 24900,
    status: "reserved",
  },
  {
    id: "v4",
    make: "Nissan",
    model: "Qashqai SV Premium",
    year: 2018,
    km: 121000,
    registration: "181-D-12776",
    fuel: "petrol",
    transmission: "manual",
    sale_price: 15750,
    status: "preparation",
  },
  {
    id: "v5",
    make: "Audi",
    model: "A4 S Line 2.0 TDI",
    year: 2019,
    km: 88300,
    registration: "192-D-67420",
    fuel: "diesel",
    transmission: "automatic",
    sale_price: 26400,
    status: "sold",
  },
  {
    id: "v6",
    make: "Volkswagen",
    model: "Passat 2.0 TDI Comfortline",
    year: 2016,
    km: 142000,
    registration: "161-D-33417",
    fuel: "diesel",
    transmission: "manual",
    sale_price: null,
    status: "bought",
    stock_class: "trade",
  },
];

export const demoLeads = [
  { id: "l1", stage: "new", source: "donedeal", notes: "Asking about the Golf", created_at: "" },
  { id: "l2", stage: "new", source: "facebook", notes: "Wants automatic SUV under €20k", created_at: "" },
  { id: "l3", stage: "contacted", source: "website", notes: "BMW 320d — has €5k deposit", created_at: "" },
  { id: "l4", stage: "test_drive", source: "whatsapp", notes: "Corolla test drive Saturday", created_at: "" },
  { id: "l5", stage: "finance_applied", source: "walk_in", notes: "A4 — finance pending", created_at: "" },
  { id: "l6", stage: "sold", source: "donedeal", notes: "A4 sold", created_at: "" },
];

export const demoBrandKit = {
  primary_color: "#0ea5e9",
  secondary_color: "#0f172a",
  tone_of_voice: "professional and friendly, plain English",
  website_url: "https://demomotors.ie",
  logo_position: "bottom_right",
  logo_size_pct: 12,
  logo_opacity_pct: 90,
  frame_style: "banner_bottom",
};

export const demoBusinessProfile = {
  opening_hours: "Mon–Fri 9am–6pm · Sat 10am–5pm · Sun closed",
  warranty_info:
    "12-month comprehensive warranty on all vehicles; 24-month available on selected cars.",
  whats_included:
    "Full valet, fresh NCT, service history check and 12-month road tax on cars over €12k. No admin or documentation fees.",
  extra_services:
    "Nationwide delivery, part-exchange welcome, extended warranty options, aftercare bookings.",
  phone: "+353 1 555 0100",
  whatsapp: "+353 86 555 0100",
  email: "sales@demomotors.ie",
  website_url: "https://demomotors.ie",
  social_links:
    "facebook.com/demomotors\ninstagram.com/demomotors\ntiktok.com/@demomotors",
  finance_available: true,
  finance_details:
    "Finance from €59/week, all credit situations considered. Requires: over 21, valid Irish licence, proof of income and address. Terms 12–60 months.",
};

export const demoIntegrations = {
  facebook_url: "https://facebook.com/demomotors",
  instagram_url: "https://instagram.com/demomotors",
  website_url: "https://demomotors.ie",
  donedealConfigured: false,
};

export const demoBackgrounds = [
  { id: "bg1", name: "My forecourt", prompt: "tidy dealership forecourt outdoors on a clear day" },
  { id: "bg2", name: "Grey studio", prompt: "clean grey studio wall with soft even lighting" },
];

export const demoDeals = [
  {
    vehicle_id: "v1",
    purchase_price: 14000,
    purchase_date: "2026-05-10",
    supplier: "Trade-in customer",
    source: "part_exchange",
    vat_scheme: "standard",
    sale_price: 17950,
    deposit_amount: 500,
    deposit_date: "2026-09-05",
    buyer_name: "John Walsh",
    buyer_phone: "+353 87 000 1111",
    payment_method: "finance",
    finance_provider: "Close Brothers",
    part_exchange_value: 0,
    salesperson: "Emma Kelly",
    sale_status: "deposit_paid",
    sold_date: null,
    delivered_date: null,
    notes: "",
  },
  {
    vehicle_id: "v5",
    purchase_price: 21000,
    purchase_date: "2026-04-02",
    supplier: "Dublin Car Auctions",
    source: "auction",
    vat_scheme: "margin",
    sale_price: 26400,
    deposit_amount: 26400,
    deposit_date: "2026-07-20",
    buyer_name: "Mary Ryan",
    buyer_phone: null,
    payment_method: "bank",
    finance_provider: null,
    part_exchange_value: 0,
    salesperson: "Liam Doyle",
    sale_status: "sold",
    sold_date: "2026-07-25",
    delivered_date: "2026-07-28",
    notes: "",
  },
  {
    vehicle_id: "v2",
    purchase_price: 24000,
    purchase_date: "2026-06-15",
    supplier: "Main dealer trade",
    source: "trade",
    vat_scheme: "standard",
    sale_price: 28500,
    deposit_amount: 0,
    deposit_date: null,
    buyer_name: null,
    buyer_phone: null,
    payment_method: null,
    finance_provider: null,
    part_exchange_value: 0,
    salesperson: null,
    sale_status: "none",
    sold_date: null,
    delivered_date: null,
    notes: "",
  },
];

export const demoCosts = [
  { id: "co1", vehicle_id: "v1", kind: "prep", amount: 350, cost_date: "2026-05-20", notes: "Full valet + service" },
  { id: "co2", vehicle_id: "v1", kind: "nct", amount: 55, cost_date: "2026-05-22", notes: null },
  { id: "co3", vehicle_id: "v5", kind: "parts", amount: 900, cost_date: "2026-04-10", notes: "New tyres" },
];

export const demoCustomers = [
  { id: "cu1", name: "John Walsh", type: "individual", phone: "+353 87 000 1111", email: "john@example.ie" },
  { id: "cu2", name: "Ryan Motors Ltd", type: "business", phone: "+353 1 555 2020", email: "sales@ryanmotors.ie" },
];

export const demoSalesDeals = [
  {
    id: "d1",
    deal_no: "20260908-001",
    status: "agreed",
    stage: "closing",
    currency: "EUR",
    customer: { name: "John Walsh", phone: "+353 87 000 1111", email: "john@example.ie" },
    salesperson: "Emma Kelly",
    order: { vehicle_label: "2019 Volkswagen Golf 1.6 TDI Highline", price: 17950, vat_scheme: "standard" },
    retail_price: 17950,
    siv_total: 0,
    required_docs: { dl_front: true, utility_bill: true } as Record<string, boolean>,
    addons: [{ id: "ad1", kind: "warranty", name: "12-month warranty", price: 399, cost: 120 }],
    payments: [{ kind: "deposit", amount: 500, method: "card", paid_on: "2026-09-05" }],
    events: [
      { kind: "created", detail: "Deal created for John Walsh", by: "Emma Kelly", at: "2026-09-05T10:12:00" },
      { kind: "deposit", detail: "Deposit of €500 taken (card)", by: "Emma Kelly", at: "2026-09-05T10:20:00" },
      { kind: "stage_changed", detail: "Moved to Closing", by: "Emma Kelly", at: "2026-09-06T09:00:00" },
    ],
  },
  {
    id: "d2",
    deal_no: "20260910-002",
    status: "quoted",
    stage: "negotiation",
    currency: "EUR",
    customer: { name: "Ryan Motors Ltd", phone: "+353 1 555 2020", email: "sales@ryanmotors.ie" },
    salesperson: "Liam Doyle",
    order: { vehicle_label: "2020 BMW 320d M Sport", price: 28500, vat_scheme: "margin" },
    retail_price: 28500,
    siv_total: 9000,
    tradeIn: { vehicle_label: "2016 Volkswagen Passat 2.0 TDI", reg: "161-D-33417", allowance: 9000, settlement: 0, net_equity: 9000 },
    payments: [],
    events: [
      { kind: "created", detail: "Deal created for Ryan Motors Ltd", by: "Liam Doyle", at: "2026-09-10T14:02:00" },
      { kind: "note", detail: "Trade-in 2016 Passat valued at €9,000", by: "Liam Doyle", at: "2026-09-11T11:30:00" },
    ],
  },
  {
    id: "d3",
    deal_no: "20260912-003",
    status: "draft",
    stage: "vehicle_interest",
    currency: "EUR",
    customer: { name: "Aoife Byrne", phone: "+353 86 111 2020", email: "aoife@example.ie" },
    salesperson: "Emma Kelly",
    order: { vehicle_label: "2021 Toyota Corolla Hybrid Luna", price: 24900, vat_scheme: "standard" },
    retail_price: 24900,
    siv_total: 0,
    payments: [],
    events: [
      { kind: "created", detail: "Lead created from DoneDeal enquiry", by: "Emma Kelly", at: "2026-09-12T16:40:00" },
    ],
  },
];

export const demoPurchases = [
  {
    id: "po1",
    po_no: "PO0001",
    status: "to_be_paid",
    vat_scheme: "none",
    inv_ref: "212C4187",
    vendor: { name: "John Doheny", phone: "+353 83 067 7913", email: null },
    car: "2021 Citroen Berlingo ENT", reg: "212C4187",
    lines: [{ description: "2021 Citroen Berlingo ENT Reg: 212C4187", nominal_code: "111", qty: 1, net: 11500, vat: 0, gross: 11500 }],
    payments: [] as { amount: number; method: string; paid_on: string }[],
  },
  {
    id: "po2",
    po_no: "PO0002",
    status: "paid",
    vat_scheme: "none",
    inv_ref: "INV-8842",
    vendor: { name: "Wilsons Auctions", phone: "+44 28 9034 2626", email: "sales@wilsonsauctions.com" },
    car: "2019 Audi A4 S Line", reg: "192-D-67420",
    lines: [{ description: "2019 Audi A4 S Line 2.0 TDI Reg: 192-D-67420", nominal_code: "111", qty: 1, net: 20500, vat: 0, gross: 20500 }],
    payments: [{ amount: 20500, method: "bank", paid_on: "2026-08-02" }],
  },
];

export const demoWebsiteSettings = {
  enabled: true,
  headline: "Quality used cars in Dublin",
  subheadline: "Hand-picked, fully checked, ready to drive away.",
  about: "Demo Motors is a family-run dealership with over 20 years serving Irish drivers. Every car is NCT-checked, serviced and comes with a warranty.",
  phone: "+353 1 555 0100",
  whatsapp: "+353 86 555 0100",
  email: "sales@demomotors.ie",
  theme_color: "#0ea5e9",
  donedeal_seller_url: "https://donedeal.ie/dealer/demo-motors",
  last_synced_at: "2026-09-14T09:00:00",
};

export const demoScheduledContent = [
  {
    id: "sc1",
    channel: "facebook",
    kind: "tip",
    status: "scheduled",
    scheduled_for: "2026-08-17",
    body: "A quick tip from the team at Demo Motors: check your tyre pressure monthly — it saves fuel and keeps you safer. Call in anytime for a free check.",
    hashtags: "",
    vehicle_id: null,
    promotion_id: null,
  },
  {
    id: "sc2",
    channel: "instagram",
    kind: "car_of_week",
    status: "draft",
    scheduled_for: "2026-08-19",
    body: "Car of the week ⭐\n2020 BMW 320d M Sport — €28,500\nPrepared and ready to drive away. Message us to book a viewing!",
    hashtags: "#caroftheweek #usedcars #irishmotoring #forsale #dealership",
    vehicle_id: "v2",
    promotion_id: null,
  },
];

export const demoStaff = [
  { name: "Seán (You)", role: "owner" },
  { name: "Emma Kelly", role: "sales" },
  { name: "Liam Doyle", role: "sales" },
];

export const demoViewings = [
  { id: "vw1", lead_name: "Aoife Byrne", phone: "+353 86 111 2020", vehicle_id: "v2", vehicle_label: "2020 BMW 320d M Sport", scheduled_for: "2026-09-09T14:30:00", status: "booked", notes: null, responsible: "Emma Kelly" },
  { id: "vw2", lead_name: "Cian Murphy", phone: "+353 87 333 4040", vehicle_id: "v3", vehicle_label: "2021 Toyota Corolla Hybrid Luna", scheduled_for: "2026-09-10T11:00:00", status: "booked", notes: null, responsible: "Liam Doyle" },
  { id: "vw3", lead_name: "Niamh O'Sullivan", phone: null, vehicle_id: null, vehicle_label: null, scheduled_for: "2026-09-11T16:00:00", status: "booked", notes: null, responsible: "Emma Kelly" },
];

export const demoTemplates = [
  {
    id: "t1",
    name: "Warranty",
    kind: "warranty",
    body: "✅ 12-month comprehensive warranty included on all vehicles.",
    is_default: true,
  },
  {
    id: "t2",
    name: "Finance",
    kind: "finance",
    body: "💶 Finance arranged from €59/week — all credit situations considered.",
    is_default: true,
  },
  {
    id: "t3",
    name: "Opening hours",
    kind: "hours",
    body: "🕘 Open Mon–Sat 9am–6pm. Demo Motors, Dublin Road.",
    is_default: true,
  },
];

export const demoCampaigns = [
  {
    id: "c1",
    vehicle_id: "v2",
    promotion_id: null,
    status: "draft",
    assets: { angle: "Just landed", channels: {} },
    created_at: "",
  },
];

export const demoCampaignTemplates = [
  {
    id: "ct1",
    name: "Weekend push",
    config: { push: "hard", audience: "weekend browsers", promotionId: "", angle: "" },
  },
  {
    id: "ct2",
    name: "Just landed",
    config: { push: "soft", audience: "", promotionId: "", angle: "" },
  },
];

export const demoPromotions = [
  {
    id: "p1",
    title: "Christmas Drive-Away Event",
    kind: "holiday",
    brief: "€500 off any car plus a free full tank for December",
    offer_details: "€500 off the ticket price and a full tank of fuel on collection.",
    included: "All cars in stock over €8,000. Free full tank on collection.",
    excluded: "Cars already reserved or under a separate offer.",
    starts_on: "2026-12-01",
    ends_on: "2026-12-24",
    terms:
      "This promotion runs from 2026-12-01 to 2026-12-24 at Demo Motors. Offer: €500 off the ticket price and a full tank of fuel on collection. Cannot be combined with other offers. Subject to availability and to the dealer's discretion.",
    status: "active",
    submitted_for_approval: false,
    approved_by: "Seán O'Brien",
    approved_role: "Owner",
    approved_at: "2026-11-28T10:00:00Z",
    created_at: "",
  },
  {
    id: "p2",
    title: "Back-to-School Runabouts",
    kind: "seasonal",
    brief: "Low-mileage small cars under €12k with free first service",
    offer_details: "Free first service on all cars under €12,000.",
    included: "Cars under €12,000. Free first service voucher.",
    excluded: "Cars over €12,000; combination with finance promotions.",
    starts_on: "2026-08-15",
    ends_on: "2026-09-15",
    terms:
      "This promotion runs from 2026-08-15 to 2026-09-15 at Demo Motors. Free first service on all cars under €12,000. Subject to availability.",
    status: "draft",
    submitted_for_approval: true,
    created_at: "",
  },
  {
    id: "p3",
    title: "Autumn Service Special",
    kind: "seasonal",
    brief: "Free winter check with any car bought in October",
    offer_details: "Complimentary winter safety check on collection.",
    included: "All cars bought in October.",
    excluded: "—",
    starts_on: "2026-10-01",
    ends_on: "2026-10-31",
    terms: "",
    status: "draft",
    submitted_for_approval: false,
    created_at: "",
  },
  {
    id: "p4",
    title: "Summer Runaround Sale",
    kind: "sale",
    brief: "€300 off small cars for the summer",
    offer_details: "€300 off any car under €10,000.",
    included: "Cars under €10,000.",
    excluded: "Cars already on offer.",
    starts_on: "2026-06-01",
    ends_on: "2026-07-15",
    terms: "This promotion ran from 2026-06-01 to 2026-07-15 at Demo Motors.",
    status: "ended",
    submitted_for_approval: false,
    approved_by: "Seán O'Brien",
    approved_role: "Owner",
    approved_at: "2026-05-28T10:00:00Z",
    created_at: "",
  },
];

export const demoAdScripts = [
  {
    id: "s1",
    name: "Generic — DoneDeal listing",
    channel: "donedeal",
    is_default: true,
    body: [
      "{year} {make} {model} — {price}",
      "",
      "Presented in excellent condition here at {dealer}.",
      "",
      "Key details:",
      "• {specs}",
      "• {nct}",
      "• {warranty}",
      "",
      "Trade-ins welcome. Finance available. Contact us today to arrange a viewing or test drive.",
    ].join("\n"),
  },
  {
    id: "s2",
    name: "Short & punchy — social",
    channel: null,
    is_default: false,
    body: [
      "Just in at {dealer}: {year} {make} {model} 🚗",
      "{specs}",
      "{warranty}",
      "Only {price} — message us to book a test drive!",
    ].join("\n"),
  },
];
