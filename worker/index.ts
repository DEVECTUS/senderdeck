/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { Env } from "./env";
import { version } from "../package.json";
import { handleAccountApi } from "./account-api";
import { handleMcp } from "./mcp";
import { handleOAuthRoute } from "./oauth";
import { handleMcpAuthentication } from "./mcp-auth";
import { handleIdentityAuthRoute } from "./identity-auth";
import { authenticatedUser, withAuthenticatedUserHeaders } from "./auth";
import { isPlatformOperator } from "./social/setup";
import { resolveMetaSecrets } from "./social/config";
import { handleSocial } from "./social/api";
import { runHostedMaintenance } from "./social/webhooks";

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
        version,
        storage: "d1",
        retention: "email-provider-on-demand; optional-social-expiring-encrypted-content",
      });
    }

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      if (!env.OPENAI_APPS_CHALLENGE) return new Response("Not configured.", { status: 404 });
      return new Response(env.OPENAI_APPS_CHALLENGE, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const identityResponse = await handleIdentityAuthRoute(request, env);
    if (identityResponse) return identityResponse;

    const mcpAuthResponse = await handleMcpAuthentication(request, env);
    if (mcpAuthResponse) return mcpAuthResponse;

    const mcpResponse = await handleMcp(request, env);
    if (mcpResponse) return mcpResponse;

    const socialResponse = await handleSocial(request, env, promise => ctx.waitUntil(promise));
    if (socialResponse) return socialResponse;

    if (url.pathname === "/operator/social" || url.pathname.startsWith("/operator/social/")) {
      const user = await authenticatedUser(request, env);
      if (!user) return Response.redirect(new URL("/signin?return_to=%2Foperator%2Fsocial", request.url).toString(), 303);
      if (!isPlatformOperator(env, user.userId)) return new Response("Platform administrator access required. Workspace ownership does not grant platform access.", {status:403,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
    }

    const accountApiResponse = await handleAccountApi(request, env);
    if (accountApiResponse) return accountApiResponse;

    const oauthResponse = await handleOAuthRoute(request, env);
    if (oauthResponse) return oauthResponse;

    if (url.pathname === "/_vinext/image") {
      const assets = env.ASSETS;
      const images = env.IMAGES;
      if (!assets || !images) {
        const source = url.searchParams.get("url");
        if (!source || !source.startsWith("/") || source.startsWith("//")) {
          return new Response("Image source is not allowed.", { status: 400 });
        }
        const sourceUrl = new URL(source, url.origin);
        if (sourceUrl.origin !== url.origin || sourceUrl.pathname === "/_vinext/image") {
          return new Response("Image source is not allowed.", { status: 400 });
        }
        return fetch(new Request(sourceUrl));
      }

      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const rendered = await handler.fetch(await withAuthenticatedUserHeaders(request, env), env, ctx);
    if (url.pathname === "/operator/social" || url.pathname.startsWith("/operator/social/")) {
      const headers = new Headers(rendered.headers);
      headers.set("cache-control", "no-store");
      headers.set("referrer-policy", "no-referrer");
      headers.set("content-security-policy", "frame-ancestors 'none'");
      return new Response(rendered.body, {status:rendered.status, headers});
    }
    if (["/", "/accounts", "/settings", "/conversations"].includes(url.pathname)) {
      const headers = new Headers(rendered.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(rendered.body, { status: rendered.status, headers });
    }
    return rendered;
  },
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(resolveMetaSecrets(env).then(configured => runHostedMaintenance(configured,"native_cron")));
  },
};

export default worker;
