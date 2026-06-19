import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: Date;
}

// Atomic rate-limit check backed by Postgres rate_limit_check() RPC.
// Always counts the call against the bucket (even if it ends up rejected),
// so a flood of failing attempts cannot extend or refresh the window.
// `key` should be unique per (user, action): e.g. `user:${user.id}:change-password`.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("rate_limit_check", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error || !data || data.length === 0) {
    // Fail-open: if the limiter itself is broken, do not block legitimate users.
    // Log so the failure is observable, then allow the call through.
    console.error("[rate-limit] check failed:", error?.message ?? "no data");
    return {
      ok: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }

  const row = data[0];
  return {
    ok: row.ok,
    remaining: row.remaining,
    resetAt: new Date(row.reset_at),
  };
}

// Builds the standard 429 JSON response shape with a Retry-After header.
import { NextResponse } from "next/server";

export function rateLimitedResponse(result: RateLimitResult, message = "יותר מדי בקשות, נסה שוב מאוחר יותר"): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: message, retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
