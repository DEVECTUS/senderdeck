/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { Env } from "./env";
import { handleAccountApi } from "./account-api";
import { handleMcp } from "./mcp";
import { handleOAuthRoute } from "./oauth";
import { handleMcpAuthentication } from "./mcp-auth";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "senderdeck",
        version: "0.3.1",
        storage: "d1",
        retention: "provider-on-demand",
      });
    }

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      if (!env.OPENAI_APPS_CHALLENGE) return new Response("Not configured.", { status: 404 });
      return new Response(env.OPENAI_APPS_CHALLENGE, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const mcpAuthResponse = await handleMcpAuthentication(request, env);
    if (mcpAuthResponse) return mcpAuthResponse;

    const mcpResponse = await handleMcp(request, env);
    if (mcpResponse) return mcpResponse;

    const accountApiResponse = await handleAccountApi(request, env);
    if (accountApiResponse) return accountApiResponse;

    const oauthResponse = await handleOAuthRoute(request, env);
    if (oauthResponse) return oauthResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
