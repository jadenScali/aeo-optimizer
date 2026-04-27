import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useEffect } from "react";
import { useFetcher, useLoaderData, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import type { ContentScoreReport } from "../services/content-score.server";
import { runContentScoreAudit } from "../services/content-score.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return runContentScoreAudit(admin);
};

function CategoryBlock({
  category,
}: {
  category: ContentScoreReport["categories"]["contentClarity"];
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        <s-text>
          Score: {category.score}/{category.max}
        </s-text>
      </s-paragraph>
      {category.issues.length > 0 ? (
        <s-unordered-list>
          {category.issues.map((item) => (
            <s-list-item key={item.issue}>
              <strong>{item.issue}</strong>
              <s-paragraph>{item.recommendation}</s-paragraph>
            </s-list-item>
          ))}
        </s-unordered-list>
      ) : (
        <s-paragraph>No major gaps flagged in this category.</s-paragraph>
      )}
    </s-stack>
  );
}

export default function ContentScorePage() {
  useLoaderData<typeof loader>();
  const location = useLocation();
  const fetcher = useFetcher<typeof action>();

  const isRunning = ["loading", "submitting"].includes(fetcher.state);
  const runScore = () => fetcher.submit({}, { method: "POST" });

  const data = fetcher.data;
  const autorun = new URLSearchParams(location.search).get("autorun") === "1";

  // If navigated from the home "Run score" card, kick off the audit automatically.
  // Guarded to avoid loops while `fetcher` is already running.
  useEffect(() => {
    if (!autorun) return;
    if (data) return;
    if (fetcher.state !== "idle") return;
    runScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorun]);

  return (
    <s-page heading="Content score">
      <s-section heading="What this does">
        <s-paragraph>
        Analyzes your product descriptions and store pages, scoring them on clarity and structure. Higher scores mean your content is more understandable to readers and AI systems alike.
        </s-paragraph>
      </s-section>

      <s-section heading="Overall">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <s-button variant="primary" onClick={runScore} disabled={isRunning}>
            {isRunning ? "Scoring…" : "Run score"}
          </s-button>
        </div>
        {!data ? (
          <s-paragraph>Click “Run score” to analyze your catalog.</s-paragraph>
        ) : !data.ok ? (
          <s-banner heading="Could not load data" tone="critical">
            {data.error ?? "Unknown error"}
            <s-paragraph>
              Ensure the app has <s-text>read_products</s-text> and page access
              (<s-text>read_online_store_pages</s-text> or{" "}
              <s-text>read_content</s-text>), then reinstall so the token
              includes new scopes.
            </s-paragraph>
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">
            <s-heading>
              Total: {data.total}/100
            </s-heading>
            {data.warnings?.length ? (
              <s-banner heading="Partial data" tone="warning">
                {data.warnings.map((w) => (
                  <s-paragraph key={w}>{w}</s-paragraph>
                ))}
              </s-banner>
            ) : null}
            <s-paragraph>
              Based on {data.meta.productCount} product(s) and{" "}
              {data.meta.pageCount} page(s) from the Admin API.
            </s-paragraph>
          </s-stack>
        )}
      </s-section>

      {data?.ok && (
        <>
          <s-section heading="Content clarity (0–25)">
            <CategoryBlock category={data.categories.contentClarity} />
          </s-section>
          <s-section heading="Structure (0–25)">
            <CategoryBlock category={data.categories.structure} />
          </s-section>
          <s-section heading="Crawlability (0–20)">
            <CategoryBlock category={data.categories.crawlability} />
          </s-section>
          <s-section heading="Entity strength (0–15)">
            <CategoryBlock category={data.categories.entityStrength} />
          </s-section>
          <s-section heading="Completeness (0–15)">
            <CategoryBlock category={data.categories.completeness} />
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
