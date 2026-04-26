import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AiReferrerTrafficChart } from "../components/AiReferrerTrafficChart";
import { buildDemoReferrerSeries } from "../lib/referrer-traffic.demo";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { series: buildDemoReferrerSeries(30) };
};

export default function AdditionalPage() {
  const { series } = useLoaderData<typeof loader>();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <s-page heading="AI Referrer Traffic over time">
      <s-section heading="Overview">
        <s-paragraph>
          Daily human visitors arriving from AI platforms (last 30 days).
          The lines below are <s-text>example data</s-text> so you can see the
          chart; replace the loader with your own query when you wire analytics.
        </s-paragraph>
        <div style={{ width: "100%", height: 400, marginTop: 8 }}>
          {mounted ? (
            <AiReferrerTrafficChart data={series} height={400} />
          ) : (
            <div style={{ height: 400 }} aria-hidden />
          )}
        </div>
        <s-paragraph>
          <strong>Connecting real analytics:</strong> there is no single “AI
          referrer” field in core Shopify. Typical paths:{" "}
          (1) pull sessions or marketing reports from the{" "}
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/objects/ShopifyqlQuery"
            target="_blank"
          >
            Admin API / ShopifyQL
          </s-link>{" "}
          where your plan exposes them and map referrer or UTM to AI domains;{" "}
          (2) track{" "}
          <s-text>document.referrer</s-text> / UTM on the storefront (theme app
          extension or web pixel) and POST daily aggregates to your app backend
          (e.g. store in Prisma); (3) export from Google Analytics / Plausible /
          similar if you already tag AI traffic there.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
