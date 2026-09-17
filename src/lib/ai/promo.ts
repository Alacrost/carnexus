// AI promotion generation.
// Uses OpenAI when OPENAI_API_KEY is set; otherwise falls back to a deterministic
// template generator so the studio works in demo mode and degrades gracefully.
// SECURITY: only business/offer text is sent to the AI — never customer PII.

export type PromoKind = "seasonal" | "holiday" | "sale" | "finance" | "event" | "other";

export interface PromoInput {
  dealerName: string;
  kind: PromoKind;
  title?: string | null;
  brief: string;
  offerDetails?: string | null;
  starts?: string | null;
  ends?: string | null;
  toneOfVoice?: string | null;
  businessContext?: string | null;
}

export interface PromoIdea {
  headline: string;
  hook: string;
}

export interface PromoTerms {
  terms: string;
  included: string;
  excluded: string;
  generator: "openai" | "mock";
}

export async function generatePromoIdeas(input: PromoInput): Promise<PromoIdea[]> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await ideasWithOpenAI(input);
    } catch {
      // Fall through to mock so the dealer is never blocked.
    }
  }
  return mockIdeas(input);
}

export async function generatePromoTerms(input: PromoInput): Promise<PromoTerms> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await termsWithOpenAI(input);
    } catch {
      // Fall through to mock.
    }
  }
  return mockTerms(input);
}

function promoContext(input: PromoInput): string {
  return [
    `Dealership: ${input.dealerName} (Ireland).`,
    `Promotion type: ${input.kind}.`,
    input.title ? `Working title: ${input.title}.` : "",
    `Brief from the dealer: ${input.brief}.`,
    input.offerDetails ? `Offer details: ${input.offerDetails}.` : "",
    input.starts || input.ends
      ? `Period: ${input.starts ?? "?"} to ${input.ends ?? "?"}.`
      : "",
    input.toneOfVoice ? `Tone of voice: ${input.toneOfVoice}.` : "",
    input.businessContext
      ? `Dealership facts you may use (do not invent beyond these):\n${input.businessContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function ideasWithOpenAI(input: PromoInput): Promise<PromoIdea[]> {
  const prompt = [
    promoContext(input),
    `Propose 3 distinct campaign angles for this promotion. Each is a punchy headline`,
    `(max 8 words) plus a one-sentence hook. Never invent offers beyond the brief.`,
    `Reply in strict JSON: {"angles": [{"headline": string, "hook": string}]}`,
  ].join("\n");

  const parsed = await callOpenAI(prompt);
  const angles = Array.isArray(parsed.angles) ? parsed.angles : [];
  return angles.slice(0, 3).map((a: { headline?: string; hook?: string }) => ({
    headline: String(a.headline ?? ""),
    hook: String(a.hook ?? ""),
  }));
}

async function termsWithOpenAI(input: PromoInput): Promise<PromoTerms> {
  const prompt = [
    promoContext(input),
    `Draft clear, plain-English terms & conditions for this promotion, suitable to share`,
    `publicly. Be precise about the period, and separate what IS included/allowed from what`,
    `is NOT. Do not invent legal guarantees. End the terms with a short note that the offer`,
    `is subject to availability and the dealer's discretion.`,
    `Reply in strict JSON: {"terms": string, "included": string, "excluded": string}`,
  ].join("\n");

  const parsed = await callOpenAI(prompt);
  return {
    terms: String(parsed.terms ?? ""),
    included: String(parsed.included ?? ""),
    excluded: String(parsed.excluded ?? ""),
    generator: "openai",
  };
}

async function callOpenAI(prompt: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

/* ---- Deterministic fallbacks ---- */

const seasonLabel: Record<PromoKind, string> = {
  seasonal: "Seasonal event",
  holiday: "Holiday",
  sale: "Sale",
  finance: "Finance offer",
  event: "Showroom event",
  other: "Promotion",
};

function mockIdeas(input: PromoInput): PromoIdea[] {
  const label = seasonLabel[input.kind];
  const name = input.title?.trim() || `${label} at ${input.dealerName}`;
  return [
    {
      headline: `${name} — limited time`,
      hook: `Make the most of our ${label.toLowerCase()} with ${input.brief}.`,
    },
    {
      headline: `Drive away this ${label.toLowerCase()}`,
      hook: `${input.offerDetails || input.brief} — book a viewing before it ends.`,
    },
    {
      headline: `Your ${label.toLowerCase()}, your deal`,
      hook: `Ask us about ${input.brief} and part-exchange your current car.`,
    },
  ];
}

function mockTerms(input: PromoInput): PromoTerms {
  const period =
    input.starts && input.ends
      ? `from ${input.starts} to ${input.ends}`
      : input.ends
        ? `until ${input.ends}`
        : "for a limited time";
  return {
    terms: [
      `This promotion runs ${period} at ${input.dealerName}.`,
      input.offerDetails ? `Offer: ${input.offerDetails}.` : `Offer: ${input.brief}.`,
      `Cannot be combined with other offers. Subject to availability and to the dealer's`,
      `discretion. The dealer reserves the right to amend or withdraw this promotion at any time.`,
    ].join(" "),
    included: input.offerDetails || input.brief,
    excluded: "Vehicles already under offer or reserved; combination with other promotions.",
    generator: "mock",
  };
}
