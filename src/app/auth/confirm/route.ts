import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  // This endpoint confirms signups only; recovery and other OTP flows need their own UI.
  if (tokenHash && (type === "email" || type === "signup")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(new URL("/dashboard", request.url), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }

  return NextResponse.redirect(new URL("/login", request.url), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
