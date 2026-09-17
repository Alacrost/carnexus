"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(8).max(128);
const nameSchema = z.string().trim().min(2).max(120);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "dealer"}-${suffix}`;
}

export interface AuthState {
  error?: string;
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) return { error: "Invalid email or password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Generic message — never reveal whether the account exists.
  if (error) return { error: "Invalid email or password." };

  const next = formData.get("next");
  const safeNext =
    typeof next === "string" && /^\/[a-zA-Z0-9/_-]*$/.test(next)
      ? next
      : "/dashboard";
  redirect(safeNext);
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = z
    .object({
      fullName: nameSchema,
      dealerName: nameSchema,
      email: emailSchema,
      password: passwordSchema,
    })
    .safeParse({
      fullName: formData.get("fullName"),
      dealerName: formData.get("dealerName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return {
      error:
        "Check your details: names need 2+ characters and password needs 8+ characters.",
    };
  }

  const supabase = await createClient();
  const { fullName, dealerName, email, password } = parsed.data;

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (signUpError) {
    return { error: "Could not create the account. Try a different email." };
  }

  // Create the dealer + owner membership atomically (security definer RPC).
  const { error: rpcError } = await supabase.rpc("create_dealer_with_owner", {
    p_name: dealerName,
    p_slug: slugify(dealerName),
  });

  if (rpcError) {
    // Email confirmation may be required — no session yet. Dealer is created on onboarding.
    redirect("/login?message=confirm-email");
  }

  redirect("/dashboard");
}

export async function createDealer(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = nameSchema.safeParse(formData.get("dealerName"));
  if (!parsed.success) return { error: "Dealer name needs 2+ characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_dealer_with_owner", {
    p_name: parsed.data,
    p_slug: slugify(parsed.data),
  });

  if (error) return { error: "Could not create the dealership. Try again." };
  redirect("/dashboard");
}

export async function acceptInvite(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const token = z
    .string()
    .regex(/^[a-f0-9]{48}$/)
    .safeParse(formData.get("token"));

  if (!token.success) return { error: "Invalid invitation link." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token.data,
  });

  if (error) return { error: "Invitation is invalid, expired or already used." };
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  ) {
    redirect("/");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
