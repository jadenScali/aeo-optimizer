import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { CallbackEvent } from "@shopify/polaris-types";

import { AiReferrerTrafficChart } from "../components/AiReferrerTrafficChart";
import { buildDemoReferrerSeries } from "../lib/referrer-traffic.demo";
import {
  getReferrerSeriesForShop,
  seriesHasAnyVisits,
} from "../lib/referrer-traffic.query.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const live = await getReferrerSeriesForShop(session.shop, 30);
  const hasLive = seriesHasAnyVisits(live);
  return {
    series: hasLive ? live : buildDemoReferrerSeries(30),
    dataSource: hasLive ? ("live" as const) : ("demo" as const),
  };
};

export default function AdditionalPage() {
  const { series, dataSource } = useLoaderData<typeof loader>();
  const [mounted, setMounted] = useState(false);
  const [showTotalOnly, setShowTotalOnly] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onTotalToggle = (event: CallbackEvent<"s-switch">): void => {
    const target = event?.target as unknown as { checked?: boolean } | null;
    setShowTotalOnly(!!target?.checked);
  };

  return (
    <s-page heading="AI Referrer Traffic over time">
      <s-section heading="Overview">
        <s-paragraph>
          Daily human visitors arriving from AI platforms (last 30 days).{" "}
          {dataSource === "live" ? (
            <>
              Showing <s-text>live</s-text> counts from your storefront (app
              embed + app proxy). Add UTMs to AI links for best accuracy.
            </>
          ) : (
            <>
              <s-text>Sample data</s-text> is shown until the theme app embed
              records matching visits. Enable{" "}
              <s-text>AEO AI referrer tracking</s-text> under{" "}
              <s-text>Online Store → Themes → Customize → App embeds</s-text>, and
              approve the <s-text>write_app_proxy</s-text> scope (reinstall the
              app if prompted).
            </>
          )}
        </s-paragraph>
        <div style={{ marginTop: 8 }}>
          <s-switch
            name="showTotalReferrers"
            label="Show total AI referrals only"
            details="Combine every platform into one line per day."
            checked={showTotalOnly}
            onChange={onTotalToggle}
          />
        </div>
        <div style={{ width: "100%", height: 400, marginTop: 8 }}>
          {mounted ? (
            <AiReferrerTrafficChart
              data={series}
              height={400}
              showTotalOnly={showTotalOnly}
            />
          ) : (
            <div style={{ height: 400 }} aria-hidden />
          )}
        </div>
        <s-paragraph>
          <strong>How tracking works:</strong> the app embed sends the current
          page&apos;s UTM parameters and referrer hostname to{" "}
          <s-text>/apps/aeo-ai-ref</s-text> (Shopify app proxy). Only visits that
          match known AI patterns are counted. Tag AI campaigns with obvious{" "}
          <s-text>utm_source</s-text> values (e.g. <s-text>chatgpt</s-text>,{" "}
          <s-text>perplexity</s-text>). You can still supplement with{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyqlQuery"
            target="_blank"
          >
            Admin analytics
          </s-link>{" "}
          or external tools.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
