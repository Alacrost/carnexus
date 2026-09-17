// AI ad copy generation.
// Uses OpenAI when OPENAI_API_KEY is set; otherwise falls back to a deterministic
// template generator so the product works in demo mode and degrades gracefully.
// SECURITY: only vehicle data + Brand Kit are sent to the AI — never customer PII
// (docs/SECURITY.md §9).

export type AdChannel =
  | "donedeal"
  | "facebook"
  | "instagram_feed"
  | "instagram_story"
  | "whatsapp"
  | "tiktok"
  | "google"
  | "website";

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  km: number;
  fuel: string;
  transmission: string;
  sale_price: number | null;
  nct_expiry?: string | null;
  warranty_months?: number | null;
}

export interface BrandInput {
  dealerName: string;
  toneOfVoice: string;
  websiteUrl?: string | null;
  standardBlocks: string[];
  businessContext?: string | null;
}

export interface AdCopy {
  title: string;
  body: string;
  hashtags: string;
  generator: "openai" | "mock";
}

const channelSpecs: Record<AdChannel, string> = {
  donedeal:
    "DoneDeal listing: professional long-form description, spec highlights as bullet-like lines, no emojis, no hashtags.",
  facebook:
    "Facebook post: friendly, 2 short paragraphs, 1-2 tasteful emojis, call to action to message the page.",
  instagram_feed:
    "Instagram caption: punchy first line, emojis welcome, short lines, strong call to action, end with hashtags.",
  instagram_story:
    "Instagram story: max 3 very short lines + call to action (swipe up / DM).",
  whatsapp:
    "WhatsApp status/broadcast: 1 short friendly line + price + a nudge to reply. 1 emoji max, no hashtags.",
  tiktok:
    "TikTok caption: punchy hook first line, casual and energetic, 3-4 short trending-style hashtags at the end.",
  google:
    "Google ad: headline max 30 chars, description max 90 chars, no emojis.",
  website: "Website listing: clean professional description, SEO-friendly, no emojis.",
};

export async function generateAdCopy(
  vehicle: VehicleInput,
  brand: BrandInput,
  channel: AdChannel,
  script?: string | null
): Promise<AdCopy> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithOpenAI(vehicle, brand, channel, script);
    } catch {
      // Fall through to mock so the dealer is never blocked.
    }
  }
  return mockGenerate(vehicle, brand, channel, script);
}

export type RefineAction = "shorter" | "punchier" | "emojis" | "rephrase";

const refineSpecs: Record<RefineAction, string> = {
  shorter: "Make it noticeably shorter and tighter without losing the key facts.",
  punchier: "Make it punchier and more energetic — stronger hook, confident call to action.",
  emojis: "Add a few tasteful, relevant emojis. Do not overdo it.",
  rephrase: "Rewrite it differently while keeping the exact same facts and meaning.",
};

// Refines a single block of ad copy. Reuses the vehicle-safe rule: never invents
// facts, only reshapes the text it is given. Falls back to deterministic edits.
export async function refineAdCopy(
  text: string,
  action: RefineAction,
  channel: AdChannel
): Promise<{ text: string; generator: "openai" | "mock" }> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const prompt = [
        `You edit car sales ad copy for the ${channel} channel.`,
        refineSpecs[action],
        `Never add features, prices or claims that are not already in the text.`,
        `Reply with ONLY the edited text, no quotes, no preamble.`,
        ``,
        text,
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
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const out = String(data.choices[0].message.content ?? "").trim();
      if (out) return { text: out, generator: "openai" };
    } catch {
      // Fall through to deterministic edit.
    }
  }
  return { text: mockRefine(text, action), generator: "mock" };
}

function mockRefine(text: string, action: RefineAction): string {
  switch (action) {
    case "shorter": {
      const lines = text.split("\n").filter((l) => l.trim());
      return lines.slice(0, Math.max(1, Math.ceil(lines.length / 2))).join("\n");
    }
    case "punchier": {
      const first = text.split("\n")[0] ?? text;
      const rest = text.split("\n").slice(1).join("\n");
      return [`🔥 ${first.replace(/[.!]+$/, "")}!`, rest].filter(Boolean).join("\n");
    }
    case "emojis":
      return text
        .replace(/test drive/gi, "test drive 🚗")
        .replace(/message us/gi, "message us 📩")
        .replace(/price/gi, "price 💶");
    case "rephrase":
      return text
        .split("\n")
        .map((l) => (l.trim() ? l.replace(/^\s*/, "› ") : l))
        .join("\n");
  }
}

async function generateWithOpenAI(
  vehicle: VehicleInput,
  brand: BrandInput,
  channel: AdChannel,
  script?: string | null
): Promise<AdCopy> {
  const prompt = [
    `You write car sales ads for ${brand.dealerName}, a dealership in Ireland.`,
    `Tone of voice: ${brand.toneOfVoice}.`,
    `Channel requirements: ${channelSpecs[channel]}`,
    `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}, ${vehicle.km.toLocaleString("en-IE")} km, ${vehicle.fuel}, ${vehicle.transmission}.`,
    vehicle.sale_price ? `Price: €${vehicle.sale_price.toLocaleString("en-IE")}.` : "",
    vehicle.nct_expiry ? `NCT until ${vehicle.nct_expiry}.` : "",
    vehicle.warranty_months ? `${vehicle.warranty_months} months warranty.` : "",
    brand.businessContext
      ? `Dealership facts you may use where relevant (do not invent beyond these):\n${brand.businessContext}`
      : "",
    script
      ? `Follow this dealer-preferred structure for the body, keeping its order and sections and filling any {placeholders} naturally from the data above. Drop lines whose data is missing:\n${script}`
      : "",
    brand.standardBlocks.length
      ? `Append these dealer standard blocks at the end, verbatim:\n${brand.standardBlocks.join("\n")}`
      : "",
    `Never invent features or condition claims not present in the data above.`,
    `Reply in strict JSON: {"title": string, "body": string, "hashtags": string}`,
  ]
    .filter(Boolean)
    .join("\n");

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
  const parsed = JSON.parse(data.choices[0].message.content);
  return {
    title: String(parsed.title ?? ""),
    body: String(parsed.body ?? ""),
    hashtags: String(parsed.hashtags ?? ""),
    generator: "openai",
  };
}

function mockGenerate(
  vehicle: VehicleInput,
  brand: BrandInput,
  channel: AdChannel,
  script?: string | null
): AdCopy {
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const km = `${vehicle.km.toLocaleString("en-IE")} km`;
  const price = vehicle.sale_price
    ? `€${vehicle.sale_price.toLocaleString("en-IE")}`
    : "POA";
  const specs = `${cap(vehicle.fuel)} · ${cap(vehicle.transmission)} · ${km}`;
  const extras = [
    vehicle.nct_expiry ? `NCT until ${vehicle.nct_expiry}` : null,
    vehicle.warranty_months ? `${vehicle.warranty_months} months warranty` : null,
  ].filter(Boolean) as string[];
  const blocks = brand.standardBlocks.join("\n\n");
  const tags = `#${vehicle.make.replace(/\s/g, "")} #${vehicle.model.split(" ")[0]} #UsedCarsIreland #${brand.dealerName.replace(/\s/g, "")}`;

  // A saved script drives the body verbatim (placeholders filled), overriding
  // the per-channel default layout below.
  if (script) {
    return {
      title: `${name} — ${price}`,
      body: [fillScript(script, vehicle, brand), blocks].filter(Boolean).join("\n\n"),
      hashtags: channel === "donedeal" || channel === "website" || channel === "google" ? "" : tags,
      generator: "mock",
    };
  }

  switch (channel) {
    case "donedeal":
    case "website":
      return {
        title: `${name} ${cap(vehicle.transmission)} — ${price}`,
        body: [
          `${name} presented in excellent order.`,
          ``,
          `• ${specs}`,
          ...extras.map((e) => `• ${e}`),
          `• Price: ${price}`,
          ``,
          `Viewings welcome at ${brand.dealerName}.`,
          blocks,
        ]
          .filter(Boolean)
          .join("\n"),
        hashtags: "",
        generator: "mock",
      };
    case "facebook":
      return {
        title: `${name} just arrived at ${brand.dealerName} 🚗`,
        body: [
          `Just in: ${name}, ${specs}. ${extras.join(", ")}.`,
          ``,
          `${price} — message us to book a test drive! 📩`,
          blocks,
        ]
          .filter(Boolean)
          .join("\n"),
        hashtags: tags,
        generator: "mock",
      };
    case "instagram_feed":
      return {
        title: `NEW ARRIVAL 🔥 ${name}`,
        body: [
          `NEW ARRIVAL 🔥`,
          name,
          specs,
          ...extras,
          `${price}`,
          ``,
          `DM us to book your test drive 📲`,
          blocks,
        ]
          .filter(Boolean)
          .join("\n"),
        hashtags: tags,
        generator: "mock",
      };
    case "instagram_story":
      return {
        title: name,
        body: `${name}\n${specs} — ${price}\nDM to book a test drive 📲`,
        hashtags: "",
        generator: "mock",
      };
    case "whatsapp":
      return {
        title: name,
        body: `${name} now at ${brand.dealerName} — ${price}. Reply to book a viewing 👍`,
        hashtags: "",
        generator: "mock",
      };
    case "tiktok":
      return {
        title: `${name} 🔥`,
        body: [`${name} just landed 🔥`, `${specs}`, `${price}`, `Come see it 👀`].join("\n"),
        hashtags: `#cars #carsoftiktok #${vehicle.make.replace(/\s/g, "")} #UsedCarsIreland`,
        generator: "mock",
      };
    case "google":
      return {
        title: `${name} — ${price}`.slice(0, 30),
        body: `${specs}. ${extras[0] ?? ""} at ${brand.dealerName}.`.slice(0, 90),
        hashtags: "",
        generator: "mock",
      };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Fill {placeholders} in a saved script from vehicle + brand data, then drop any
// line left empty (e.g. a bullet whose value was missing).
export function fillScript(
  script: string,
  vehicle: VehicleInput,
  brand: BrandInput
): string {
  const km = `${vehicle.km.toLocaleString("en-IE")} km`;
  const values: Record<string, string> = {
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    km,
    fuel: cap(vehicle.fuel),
    transmission: cap(vehicle.transmission),
    price: vehicle.sale_price
      ? `€${vehicle.sale_price.toLocaleString("en-IE")}`
      : "POA",
    specs: `${cap(vehicle.fuel)} · ${cap(vehicle.transmission)} · ${km}`,
    nct: vehicle.nct_expiry ? `NCT until ${vehicle.nct_expiry}` : "",
    warranty: vehicle.warranty_months ? `${vehicle.warranty_months} months warranty` : "",
    dealer: brand.dealerName,
  };
  return script
    .replace(/\{(\w+)\}/g, (m, key: string) =>
      key in values ? values[key] : m
    )
    .split("\n")
    .filter((line) => line.replace(/[•\-·\s]/g, "").length > 0 || line.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
