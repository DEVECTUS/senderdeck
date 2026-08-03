import type { Env } from "./env";

const AUTH_USER_ID_HEADER = "oai-authenticated-user-id";
const AUTH_EMAIL_HEADER = "oai-authenticated-user-email";

export function requireUserId(request: Request, env: Env): string {
  const stableUserId = request.headers.get(AUTH_USER_ID_HEADER)?.trim();
  if (stableUserId) return stableUserId;

  // Email fallback preserves local development and existing private-preview data.
  const email = request.headers.get(AUTH_EMAIL_HEADER)?.trim().toLowerCase();
  if (email) return email;

  if (env.ALLOW_DEV_AUTH === "true") {
    const devEmail = request.headers.get("x-dev-user-email")?.trim().toLowerCase();
    if (devEmail) return devEmail;
  }

  throw new HttpError(401, "Authentication required.");
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
