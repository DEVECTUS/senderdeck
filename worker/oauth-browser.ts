import { cookieValue, HttpError } from "./auth";
import { sha256Base64Url } from "./crypto";

// A separate host-only cookie permits parallel flows without sharing browser proof.
export async function oauthBrowserCookie(state: string, clear = false): Promise<string> {
  const name = `__Host-senderdeck-oauth-${await sha256Base64Url(state)}`;
  return `${name}=${clear ? "" : state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : 600}`;
}

export async function requireOAuthBrowser(request: Request, state: string): Promise<void> {
  const name = `__Host-senderdeck-oauth-${await sha256Base64Url(state)}`;
  if (request.method !== "GET" || cookieValue(request.headers.get("cookie"), name) !== state) {
    throw new HttpError(403, "This authorization must finish in the browser that started it. Start again in this browser.");
  }
}

export async function oauthBrowserRedirect(location: string, state: string): Promise<Response> {
  return new Response(null, { status: 302, headers: {
    location, "cache-control": "no-store", "set-cookie": await oauthBrowserCookie(state),
  } });
}
