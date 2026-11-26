import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { siteVersion, siteVersionHeader, siteVersionPath } from "../lib/site-version";
import { addDays, today, weekId } from "../lib/club";
import { purgeExpiredDutyPhotos } from "../lib/duty-photo-storage";
import { maintainEventPhotos } from "../lib/event-photo-storage";
import { deleteQueuedPhotos } from "../lib/photo-deletion";

let nextPhotoCleanup = 0;
let eventPhotosCompleteUntil = 0;
let eventPhotosRetryAfter = 0;
let eventPhotosRun: Promise<boolean> | undefined;
let nextQueuedPhotoCheck = 0;

function checkEventPhotoRetention(env: Cloudflare.Env, now: number) {
  if (!env.BUCKET || !env.DB) return Promise.resolve(false);
  if (now < eventPhotosCompleteUntil) return Promise.resolve(true);
  if (eventPhotosRun) return eventPhotosRun;
  if (now < eventPhotosRetryAfter) return Promise.resolve(false);
  eventPhotosRetryAfter = now + 30_000;
  eventPhotosRun = maintainEventPhotos(env.BUCKET, env.DB, now).then(ok => {
    if (ok) eventPhotosCompleteUntil = Date.parse(addDays(today(new Date(now)), 1) + "T00:00:00+07:00");
    return ok;
  }).catch(error => {
    console.error("worker:event-evidence-cleanup", error);
    return false;
  }).finally(() => {
    eventPhotosRun = undefined;
  });
  return eventPhotosRun;
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "GET" && path === siteVersionPath) {
      if (url.searchParams.get("check") === "event-photo-retention") {
        // This health check wakes the same clock-based retention as a signed-in visit.
        const ok = await checkEventPhotoRetention(env, Date.now()) && !!env.BUCKET && !!env.DB &&
          await deleteQueuedPhotos(env.BUCKET, env.DB).catch(error => {
            console.error("worker:queued-photo-cleanup", error);
            return false;
          });
        return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
      }
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store", [siteVersionHeader]: siteVersion },
      });
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    // Catch a missed scheduled run on the next authenticated workspace load.
    const now = Date.now();
    if (request.method === "GET" && path === "/api/workspace" && response.ok && env.BUCKET && env.DB) {
      ctx.waitUntil(checkEventPhotoRetention(env, now));
      if (now >= nextQueuedPhotoCheck) {
        nextQueuedPhotoCheck = now + 60_000;
        ctx.waitUntil(deleteQueuedPhotos(env.BUCKET, env.DB)
          .catch(error => console.error("worker:queued-photo-cleanup", error)));
      }
      if (now >= nextPhotoCleanup) {
        const week = weekId(today(new Date(now)));
        nextPhotoCleanup = now + 60_000;
        ctx.waitUntil(purgeExpiredDutyPhotos(env.BUCKET, env.DB, new Date(now)).then(cleaned => {
          if (cleaned) nextPhotoCleanup = Date.parse(week + "T00:00:00+07:00") + 7 * 86400000;
        }).catch(error => console.error("worker:duty-evidence-cleanup", error)));
      }
    }
    if (!response.headers.get("Content-Type")?.startsWith("text/html")) return response;
    // A new navigation should load the current document and its hashed assets.
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    if (siteVersion) headers.set(siteVersionHeader, siteVersion);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
