// AI social-post generation for Facebook / Instagram.
// Uses OpenAI when OPENAI_API_KEY is set; otherwise a deterministic template so the
// product works in demo mode. Marketing best-practice, NON-clickbait, platform-safe:
// no false scarcity, no banned claims, tasteful emojis, clear honest call to action.
// SECURITY: never invents car facts beyond what's passed (docs/SECURITY.md §9).

export type SocialChannel = "facebook" | "instagram";
export type SocialKind = "tip" | "info" | "car_of_week" | "promo" | "custom";

export interface SocialVehicle {
  year: number;
  make: string;
  model: string;
  price: number | null;
}

export interface SocialInput {
  channel: SocialChannel;
  kind: SocialKind;
  dealerName: string;
  toneOfVoice: string;
  businessContext?: string | null;
  vehicle?: SocialVehicle | null;
  promo?: { title: string; offer: string | null } | null;
  topic?: string | null;
}

export interface SocialPost {
  body: string;
  hashtags: string;
  generator: "openai" | "mock";
}

const kindBrief: Record<SocialKind, string> = {
  tip: "a short, genuinely useful car ownership or buying tip (maintenance, NCT, winter driving, finance basics).",
  info: "an informative, trust-building post about the dealership, its service or how buying works.",
  car_of_week: "a 'car of the week' spotlight that makes the featured vehicle appealing using only the given facts.",
  promo: "a post announcing the current promotion, honest and clear about the offer.",
  custom: "a post on the requested topic.",
};

export async function generateSocialPost(input: SocialInput): Promise<SocialPost> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await withOpenAI(input);
    } catch {
      // Fall back so the dealer is never blocked.
    }
  }
  return mock(input);
}

function priceStr(v?: SocialVehicle | null): string {
  return v?.price ? `€${Number(v.price).toLocaleString()}` : "great value";
}

async function withOpenAI(input: SocialInput): Promise<SocialPost> {
  const facts: string[] = [`Dealership: ${input.dealerName}`, `Tone: ${input.toneOfVoice}`];
  if (input.vehicle) {
    const v = input.vehicle;
    facts.push(`Vehicle: ${v.year} ${v.make} ${v.model} — ${priceStr(v)}`);
  }
  if (input.promo) {
    facts.push(`Promotion: ${input.promo.title}${input.promo.offer ? ` — ${input.promo.offer}` : ""}`);
  }
  if (input.topic) facts.push(`Topic: ${input.topic}`);
  if (input.businessContext) facts.push(`Business facts:\n${input.businessContext}`);

  const guide =
    input.channel === "instagram"
      ? "Instagram: punchy first line, short lines, tasteful emojis, end with 5-8 relevant hashtags."
      : "Facebook: warm and clear, 1-2 short paragraphs, at most 1-2 emojis, no hashtags.";

  const prompt = [
    `You are a car dealership's social media manager. Write ${kindBrief[input.kind]}`,
    guide,
    "Rules: follow Facebook/Instagram content guidelines. NO clickbait, NO fake urgency,",
    "NO guarantees or claims not in the facts. Never invent vehicle specs, prices or offers.",
    "End with a friendly, honest call to action.",
    "",
    "Facts you may use:",
    facts.join("\n"),
    "",
    'Reply as JSON: {"body": "...", "hashtags": "#a #b"} (hashtags empty for Facebook).',
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content ?? "{}");
  const body = String(parsed.body ?? "").trim();
  if (!body) throw new Error("empty");
  return {
    body,
    hashtags: input.channel === "instagram" ? String(parsed.hashtags ?? "").trim() : "",
    generator: "openai",
  };
}

// Deterministic fallback — safe, platform-appropriate, no invented facts.
function mock(input: SocialInput): SocialPost {
  const ig = input.channel === "instagram";
  const dealer = input.dealerName;
  let body: string;
  let hashtags = "";

  switch (input.kind) {
    case "tip":
      body = ig
        ? `Quick tip from ${dealer} 🔧\nKeep your tyres at the right pressure — it saves fuel and keeps you safe.\nPop in anytime for a free check.`
        : `A quick tip from the team at ${dealer}: checking your tyre pressure monthly saves fuel and keeps you safer on the road. Call in anytime for a free check.`;
      hashtags = ig ? "#carcare #drivesafe #irishmotoring #cartips #dealership" : "";
      break;
    case "info":
      body = ig
        ? `Buying with ${dealer} 🚗\nEvery car is prepared, checked and backed by our warranty.\nAsk us anything — we're happy to help.`
        : `At ${dealer}, every car is fully prepared, checked and backed by our warranty. We're always happy to walk you through your options — no pressure, just honest advice.`;
      hashtags = ig ? "#usedcars #cardealer #irishcars #warranty #carbuying" : "";
      break;
    case "car_of_week": {
      const v = input.vehicle;
      const line = v ? `${v.year} ${v.make} ${v.model} — ${priceStr(v)}` : "our car of the week";
      body = ig
        ? `Car of the week ⭐\n${line}\nPrepared and ready to drive away. Message us to book a viewing!`
        : `Our car of the week: ${line}. Fully prepared and ready to drive away — message us to arrange a viewing or test drive.`;
      hashtags = ig ? "#caroftheweek #usedcars #irishmotoring #forsale #dealership" : "";
      break;
    }
    case "promo": {
      const p = input.promo;
      const line = p ? `${p.title}${p.offer ? ` — ${p.offer}` : ""}` : "our current offer";
      body = ig
        ? `On now at ${dealer} 🎉\n${line}\nDrop us a message for the details.`
        : `On now at ${dealer}: ${line}. Message us for the full details — we're happy to help.`;
      hashtags = ig ? "#caroffer #dealership #irishcars #finance #newarrival" : "";
      break;
    }
    default:
      body = input.topic
        ? `${input.topic}\n\nFrom the team at ${dealer}.`
        : `A quick update from ${dealer} — call in or message us anytime.`;
      hashtags = ig ? "#dealership #irishcars #motoring" : "";
  }

  return { body, hashtags, generator: "mock" };
}
