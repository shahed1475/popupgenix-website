import { supabase } from "@/integrations/supabase/client";

export interface SubscribeResult {
  ok: boolean;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value.trim());
}

/**
 * Stores a subscriber in Supabase through a security-definer function, so the
 * public never reads the list and repeat sign-ups do not reveal who is subscribed.
 */
export async function subscribeToNewsletter(email: string, source = "website"): Promise<SubscribeResult> {
  const clean = email.trim().toLowerCase();
  if (!isValidEmail(clean)) return { ok: false, message: "Please enter a valid email address." };
  try {
    // The generated types do not know this function yet; it is defined in the 2026-11 migration.
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("subscribe_newsletter", {
      p_email: clean,
      p_source: source,
    });
    if (error) return { ok: false, message: "Could not subscribe right now. Please try again." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}
