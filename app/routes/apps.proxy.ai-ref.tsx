import type { LoaderFunctionArgs } from "react-router";

import { classifyAiReferrerFromSearchParams } from "../lib/ai-referrer-classify.server";
import {
  incrementAiReferrerStat,
  utcDayString,
} from "../lib/ai-referrer-stats.server";
import { authenticate } from "../shopify.server";

const MAX_TIMESTAMP_SKEW_SEC = 300;

/**
 * App proxy ingest: storefront hits `/apps/aeo-ai-ref?...` (see shopify.app.toml).
 * Shopify forwards here as `/apps/proxy/ai-ref` with shop, timestamp, signature.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const ts = searchParams.get("timestamp");
  if (ts) {
    const sec = Number.parseInt(ts, 10);
    if (
      Number.isFinite(sec) &&
      Math.abs(Date.now() / 1000 - sec) > MAX_TIMESTAMP_SKEW_SEC
    ) {
      return new Response("timestamp out of range", { status: 401 });
    }
  }

  const shop = searchParams.get("shop");
  if (!shop) {
    return new Response("missing shop", { status: 400 });
  }

  const platform = classifyAiReferrerFromSearchParams(searchParams);
  if (!platform) {
    return new Response(null, { status: 204 });
  }

  const day = utcDayString(new Date());
  await incrementAiReferrerStat({ shop, day, platform });

  return new Response(null, { status: 204 });
};

/** App proxy may be fetched as navigation; no UI. */
export default function AppProxyAiRef() {
  return null;
}
