import { disconnectAccount, enableAccountSignIn, listAccounts, updateAccountLabel } from "./accounts";
import { errorResponse, HttpError, requireUserId } from "./auth";
import type { Env } from "./env";

const ACCOUNT_LIMIT = 10;

export async function handleAccountApi(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/accounts") return null;

  try {
    const userId = await requireUserId(request, env);
    if (request.method !== "GET" && request.headers.get("origin") !== url.origin) {
      throw new HttpError(403, "A same-origin request is required.");
    }

    if (request.method === "POST") {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new HttpError(415, "JSON is required.");
      const body = await readJson(request);
      if (body.enableSignIn !== true || body.confirmed !== true) throw new HttpError(400, "Explicit sign-in approval is required.");
      await enableAccountSignIn(env, userId, requiredString(body.accountId, "accountId"));
      return jsonResponse({ signInEnabled: true });
    }

    if (request.method === "GET") {
      return jsonResponse({
        accounts: await listAccounts(env, userId, true),
        limit: ACCOUNT_LIMIT,
      });
    }

    if (request.method === "PATCH") {
      const body = await readJson(request);
      const accountId = requiredString(body.accountId, "accountId");
      const label = requiredString(body.label, "label");
      return jsonResponse({
        account: await updateAccountLabel(env, userId, accountId, label),
      });
    }

    if (request.method === "DELETE") {
      const body = await readJson(request);
      const accountId = requiredString(body.accountId, "accountId");
      if (body.confirmed !== true) {
        throw new HttpError(400, "Disconnect must be explicitly confirmed.");
      }
      await disconnectAccount(env, userId, accountId);
      return jsonResponse({ disconnected: true, accountId });
    }

    return new Response(null, {
      status: 405,
      headers: {
        allow: "GET, POST, PATCH, DELETE",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value;
}

function jsonResponse(body: unknown): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
  });
}
