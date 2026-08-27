import type { Env } from "./env";
import { sha256Base64Url } from "./crypto";

const AUTH_USER_ID_HEADER = "oai-authenticated-user-id";
const AUTH_EMAIL_HEADER = "oai-authenticated-user-email";
export const SENDERDECK_USER_ID_HEADER = "x-senderdeck-user-id";
export const SENDERDECK_USER_EMAIL_HEADER = "x-senderdeck-user-email";
export const SESSION_COOKIE = "senderdeck_session";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  source: "senderdeck" | "openai" | "development";
}

export async function authenticatedUser(
  request: Request,
  env: Env,
): Promise<AuthenticatedUser | null> {
  const sessionToken = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (sessionToken) {
    const now = Date.now();
    const session = await env.DB.prepare(
      `SELECT user_id, email FROM senderdeck_sessions
       WHERE token_hash = ? AND expires_at > ?`,
    )
      .bind(await sha256Base64Url(sessionToken), now)
      .first<{ user_id: string; email: string }>();
    if (session) {
      return {
        userId: session.user_id,
        email: session.email,
        source: "senderdeck",
      };
    }
  }

  const stableUserId = request.headers.get(AUTH_USER_ID_HEADER)?.trim();
  const email = request.headers.get(AUTH_EMAIL_HEADER)?.trim().toLowerCase();
  if (stableUserId || email) {
    return {
      userId: stableUserId || email!,
      email: email || "OpenAI user",
      source: "openai",
    };
  }

  if (env.ALLOW_DEV_AUTH === "true") {
    const devEmail = request.headers.get("x-dev-user-email")?.trim().toLowerCase();
    if (devEmail) {
      return { userId: devEmail, email: devEmail, source: "development" };
    }
  }

  return null;
}

export async function requireUserId(request: Request, env: Env): Promise<string> {
  const user = await authenticatedUser(request, env);
  if (user) return user.userId;

  throw new HttpError(401, "Authentication required.");
}

export async function withAuthenticatedUserHeaders(
  request: Request,
  env: Env,
): Promise<Request> {
  const user = await authenticatedUser(request, env);
  const headers = new Headers(request.headers);
  headers.delete(SENDERDECK_USER_ID_HEADER);
  headers.delete(SENDERDECK_USER_EMAIL_HEADER);
  if (!user) return new Request(request, { headers });
  headers.set(SENDERDECK_USER_ID_HEADER, user.userId);
  headers.set(SENDERDECK_USER_EMAIL_HEADER, user.email);
  return new Request(request, { headers });
}

export function platformUserId(request: Request): string | null {
  return request.headers.get(AUTH_USER_ID_HEADER)?.trim()
    || request.headers.get(AUTH_EMAIL_HEADER)?.trim().toLowerCase()
    || null;
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return Response.json({ error: message }, { status });
}
