import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { runCrawlabilityAudit } from "../services/crawlability.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const audit = await runCrawlabilityAudit({
    shopDomain: session.shop,
    includeUaVariance: true,
  });

  return audit;
};

function JsonBox({ value }: { value: unknown }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </s-box>
  );
}

export default function Crawlability() {
  const { shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isRunning = ["loading", "submitting"].includes(fetcher.state);
  const runTest = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Crawlability test (beta)">
      <s-button slot="primary-action" onClick={runTest} disabled={isRunning}>
        {isRunning ? "Running…" : "Run test"}
      </s-button>

      <s-section heading="What this does">
        <s-paragraph>
          Runs a storefront crawlability audit for <s-text>{shop}</s-text>:
          robots.txt checks, sitemap discovery, sample HTML fetches (password
          walls, noindex/X-Robots-Tag, structured data), plus optional user-agent
          variance checks for common AI crawler UAs.
        </s-paragraph>
      </s-section>

      <s-section heading="Overall result">
        {fetcher.data ? (
          <s-stack direction="block" gap="base">
            <s-heading>Score: {fetcher.data.overallScore}/100</s-heading>

            {fetcher.data.blockingIssues?.length ? (
              <s-banner heading="Blocking issues" tone="warning">
                <s-unordered-list>
                  {fetcher.data.blockingIssues.map((issue: string) => (
                    <s-list-item key={issue}>{issue}</s-list-item>
                  ))}
                </s-unordered-list>
              </s-banner>
            ) : (
              <s-banner heading="No blocking issues detected" tone="success" />
            )}
          </s-stack>
        ) : (
          <s-paragraph>Click “Run test” to generate report.</s-paragraph>
        )}
      </s-section>

      {fetcher.data && (
        <>
          <s-section heading="Robots.txt">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>Fetched: </s-text>
                <s-link href={fetcher.data.robots.url} target="_blank">
                  {fetcher.data.robots.url}
                </s-link>
                <s-text> (HTTP {fetcher.data.robots.status})</s-text>
              </s-paragraph>
              <JsonBox value={fetcher.data.robots.aiBotAccess} />
            </s-stack>
          </s-section>

          <s-section heading="Sitemaps (discovered)">
            <JsonBox value={fetcher.data.sitemaps.discovered} />
          </s-section>

          <s-section heading="Sample fetches">
            <JsonBox value={fetcher.data.samples} />
          </s-section>

          <s-section heading="User-agent variance (AI bot UAs)">
            <JsonBox value={fetcher.data.uaVariance} />
          </s-section>
        </>
      )}

      <s-section slot="aside" heading="Notes">
        <s-paragraph>
          These checks indicate accessibility signals only; they do not guarantee
          indexing by any vendor.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

