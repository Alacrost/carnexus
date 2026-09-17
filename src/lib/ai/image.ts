// AI car-image processing for campaigns.
// Uses OpenAI image edits (gpt-image-1) when OPENAI_API_KEY is set; otherwise the
// mock returns the original image unchanged so the free canvas path never breaks.
// SECURITY: enhancement must NOT change the car (docs/SECURITY.md §9). Background
// replacement is opt-in and always labelled as an edited background by the caller.

export type ImageOp = "enhance" | "background";

export interface ImageResult {
  bytes: Buffer;
  contentType: string;
  generator: "openai" | "mock";
}

const prompts: Record<ImageOp, string> = {
  enhance:
    "Improve only the lighting, exposure, sharpness and clarity of this car photo. " +
    "Do NOT change the vehicle in any way — keep its exact colour, shape, panels, wheels, " +
    "badges, number plate, reflections and condition identical. Photographic result only.",
  background:
    "Replace only the background behind this car with a clean, professional neutral studio " +
    "backdrop. Keep the vehicle itself pixel-faithful: identical colour, shape, panels, " +
    "wheels, badges, plate and condition. Do not alter the car.",
};

export async function enhanceCarImage(
  source: Buffer,
  sourceType: string,
  op: ImageOp,
  backgroundPrompt?: string
): Promise<ImageResult> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await editWithOpenAI(source, sourceType, op, backgroundPrompt);
    } catch {
      // Fall through to mock so the dealer is never blocked (credits are only
      // spent by the caller on success — see enhanceCampaignImage).
    }
  }
  return { bytes: source, contentType: sourceType, generator: "mock" };
}

async function editWithOpenAI(
  source: Buffer,
  sourceType: string,
  op: ImageOp,
  backgroundPrompt?: string
): Promise<ImageResult> {
  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append(
    "prompt",
    op === "background" && backgroundPrompt
      ? `${prompts.background} Desired background: ${backgroundPrompt}.`
      : prompts[op]
  );
  form.append("size", "1024x1024");
  const ext = sourceType.includes("png") ? "png" : "jpg";
  form.append("image", new Blob([new Uint8Array(source)], { type: sourceType }), `car.${ext}`);

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image");
  return { bytes: Buffer.from(b64, "base64"), contentType: "image/png", generator: "openai" };
}

// Credit cost per op — keep in sync with the spec.
export const IMAGE_OP_COST: Record<ImageOp, number> = {
  enhance: 1,
  background: 2,
};
