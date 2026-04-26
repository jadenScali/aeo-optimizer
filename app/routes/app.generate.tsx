import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

type Options = {
  includeCollections: boolean;
  includeProducts: boolean;
  includePages: boolean;
  linkRobots: boolean;
  linkSitemap: boolean;
};

type Stage = "options" | "preview" | "published";

const DEFAULT_OPTIONS: Options = {
  includeCollections: true,
  includeProducts: true,
  includePages: true,
  linkRobots: true,
  linkSitemap: true,
};

type Shop = { name: string; myshopifyDomain: string };
type Collection = { handle: string; title: string };
type Money = { amount: string; currencyCode: string };
type Product = {
  handle: string;
  title: string;
  description: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
  variants: { nodes: Array<{ sku: string | null }> };
  priceRangeV2: { minVariantPrice: Money } | null;
};
type Page = { handle: string; title: string; body: string | null };

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (text: string, max = 150) =>
  text.length <= max ? text : text.slice(0, max) + "...";

const ymd = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

function buildLlmsTxt(
  shop: Shop,
  collections: Collection[],
  products: Product[],
  pages: Page[],
  options: Options
): string {
  const base = `https://${shop.myshopifyDomain}`;
  const out: string[] = [`# [${shop.name}](${base})`, ""];

  if (options.includeCollections && collections.length) {
    out.push("## Collections");
    for (const c of collections) {
      out.push(`- [${c.title}](${base}/collections/${c.handle})`);
    }
    out.push("");
  }

  if (options.includeProducts && products.length) {
    out.push("## Products");
    for (const p of products) {
      const meta: string[] = [];
      const description = p.description?.replace(/\s+/g, " ").trim();
      if (description) meta.push(truncate(description));
      const sku = p.variants?.nodes?.[0]?.sku?.trim();
      if (sku) meta.push(`sku ${sku}`);
      const price = p.priceRangeV2?.minVariantPrice;
      if (price) meta.push(`price ${price.amount} ${price.currencyCode}`);
      if (p.tags?.length) meta.push(`tags ${p.tags.join(", ")}`);
      const published = ymd(p.publishedAt);
      if (published) meta.push(`published ${published}`);
      const updated = ymd(p.updatedAt);
      if (updated) meta.push(`updated ${updated}`);
      const suffix = meta.length ? `: ${meta.join(" | ")}` : "";
      out.push(`- [${p.title}](${base}/products/${p.handle})${suffix}`);
    }
    out.push("");
  }

  if (options.includePages && pages.length) {
    out.push("## Pages");
    for (const pg of pages) {
      const text = pg.body ? truncate(stripHtml(pg.body)) : "";
      const suffix = text ? `: ${text}` : "";
      out.push(`- [${pg.title}](${base}/pages/${pg.handle})${suffix}`);
    }
    out.push("");
  }

  if (options.linkRobots || options.linkSitemap) {
    out.push("## Rules");
    if (options.linkRobots) out.push(`- [robots.txt](${base}/robots.txt)`);
    if (options.linkSitemap) out.push(`- [sitemap.xml](${base}/sitemap.xml)`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "generate") {
    const options: Options = {
      includeCollections: formData.get("includeCollections") === "true",
      includeProducts: formData.get("includeProducts") === "true",
      includePages: formData.get("includePages") === "true",
      linkRobots: formData.get("linkRobots") === "true",
      linkSitemap: formData.get("linkSitemap") === "true",
    };

    const res = await admin.graphql(
      `#graphql
      query StoreContent(
        $includeCollections: Boolean!
        $includeProducts: Boolean!
        $includePages: Boolean!
      ) {
        shop { name myshopifyDomain }
        collections(first: 250) @include(if: $includeCollections) {
          nodes { handle title }
        }
        products(first: 250, query: "status:active") @include(if: $includeProducts) {
          nodes {
            handle
            title
            description
            tags
            publishedAt
            updatedAt
            variants(first: 1) { nodes { sku } }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
          }
        }
        pages(first: 250) @include(if: $includePages) {
          nodes { handle title body }
        }
      }`,
      {
        variables: {
          includeCollections: options.includeCollections,
          includeProducts: options.includeProducts,
          includePages: options.includePages,
        },
      }
    );

    const { data } = await res.json();
    const content = buildLlmsTxt(
      data.shop,
      data.collections?.nodes ?? [],
      data.products?.nodes ?? [],
      data.pages?.nodes ?? [],
      options
    );
    return { ok: true as const, intent: "generate" as const, content };
  }

  const content = String(formData.get("content") ?? "");

  const shopRes = await admin.graphql(`#graphql
    query { shop { id } }
  `);
  const { data: shopData } = await shopRes.json();

  const [metafieldRes, redirectRes] = await Promise.all([
    admin.graphql(
      `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              namespace: "aeo_optimizer",
              key: "llms_txt",
              type: "multi_line_text_field",
              value: content,
              ownerId: shopData.shop.id,
            },
          ],
        },
      }
    ),
    admin.graphql(
      `#graphql
      mutation UrlRedirectCreate($urlRedirect: UrlRedirectInput!) {
        urlRedirectCreate(urlRedirect: $urlRedirect) {
          urlRedirect { id }
          userErrors { field message }
        }
      }`,
      { variables: { urlRedirect: { path: "/llms.txt", target: "/a/llms-txt" } } }
    ),
  ]);

  const { data: metafieldData } = await metafieldRes.json();
  const { data: redirectData } = await redirectRes.json();

  const redirectErrors = (redirectData?.urlRedirectCreate?.userErrors ?? []).filter(
    (e: { message: string }) => !e.message.toLowerCase().includes("already")
  );
  const errors = [...(metafieldData?.metafieldsSet?.userErrors ?? []), ...redirectErrors];
  if (errors.length > 0) return { ok: false as const, intent: "publish" as const, errors };
  return { ok: true as const, intent: "publish" as const };
};

export default function Generate() {
  const { shop } = useLoaderData<typeof loader>();
  const llmsUrl = `https://${shop}/a/llms-txt`;

  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [stage, setStage] = useState<Stage>("options");
  const [preview, setPreview] = useState("");

  const fetcher = useFetcher<typeof action>();
  const submittingIntent =
    fetcher.state !== "idle"
      ? (fetcher.formData?.get("intent") as "generate" | "publish" | null)
      : null;
  const generating = submittingIntent === "generate";
  const publishing = submittingIntent === "publish";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    if (fetcher.data.intent === "generate" && fetcher.data.content) {
      setPreview(fetcher.data.content);
      setStage("preview");
    } else if (fetcher.data.intent === "publish") {
      setStage("published");
    }
  }, [fetcher.state, fetcher.data]);

  const toggle = (key: keyof Options) => (event: Event) => {
    const checked = (event.currentTarget as unknown as { checked: boolean }).checked;
    setOptions((prev) => ({ ...prev, [key]: checked }));
  };

  const handleGenerate = () => {
    fetcher.submit(
      {
        intent: "generate",
        includeCollections: String(options.includeCollections),
        includeProducts: String(options.includeProducts),
        includePages: String(options.includePages),
        linkRobots: String(options.linkRobots),
        linkSitemap: String(options.linkSitemap),
      },
      { method: "POST" }
    );
  };

  const handlePublish = () => {
    fetcher.submit({ intent: "publish", content: preview }, { method: "POST" });
  };

  const handleBackToOptions = () => setStage("options");
  const handleEditAgain = () => setStage("preview");

  return (
    <s-page heading="Generate llms.txt">
      {stage === "options" && (
        <s-section>
          <s-stack direction="block" gap="large-200">
            <s-stack direction="block" gap="large">
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                What to include
              </h3>
              <s-paragraph>
                Choose the storefront content you want to expose in your{" "}
                <s-text>llms.txt</s-text>. AI answer engines will use this file
                to discover and cite the pages you select.
              </s-paragraph>
              <s-stack direction="block" gap="base">
                <s-checkbox
                  name="includeCollections"
                  label="Include collections"
                  details="Adds links to your storefront collections."
                  checked={options.includeCollections}
                  onChange={toggle("includeCollections")}
                />
                <s-checkbox
                  name="includeProducts"
                  label="Include products"
                  details="Adds links to your active products."
                  checked={options.includeProducts}
                  onChange={toggle("includeProducts")}
                />
                <s-checkbox
                  name="includePages"
                  label="Include pages"
                  details="Adds links to your storefront pages (about, FAQs, etc.)."
                  checked={options.includePages}
                  onChange={toggle("includePages")}
                />
              </s-stack>
            </s-stack>

            <s-divider />

            <s-stack direction="block" gap="large">
              <s-stack direction="block" gap="small">
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
                  SEO references
                </h3>
                <s-paragraph>
                  Linking to <s-text>robots.txt</s-text> and{" "}
                  <s-text>sitemap.xml</s-text> is recommended — but only if you
                  already have them set up for SEO. Leave these off otherwise.
                </s-paragraph>
              </s-stack>
              <s-stack direction="block" gap="base">
                <s-switch
                  name="linkRobots"
                  label="Link to robots.txt (recommended)"
                  details="Only enable if your storefront already serves a robots.txt."
                  checked={options.linkRobots}
                  onChange={toggle("linkRobots")}
                />
                <s-switch
                  name="linkSitemap"
                  label="Link to sitemap.xml (recommended)"
                  details="Only enable if your storefront already serves a sitemap.xml."
                  checked={options.linkSitemap}
                  onChange={toggle("linkSitemap")}
                />
              </s-stack>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={handleGenerate}
                {...(generating ? { loading: true } : {})}
              >
                Generate
              </s-button>
              <s-button href="/app">Cancel</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {stage === "preview" && (
        <s-section>
          <s-stack direction="block" gap="large">
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
              llms.txt
            </h3>
            <s-paragraph>
              Review and edit the generated <s-text>llms.txt</s-text> below.
              When you&apos;re happy with it, publish to make it live at{" "}
              <s-text>/llms.txt</s-text>.
            </s-paragraph>

            <s-text-area
              label="llms.txt contents"
              name="content"
              rows={20}
              value={preview}
              onChange={(event: Event) =>
                setPreview((event.currentTarget as unknown as { value: string }).value)
              }
            />

            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={handlePublish}
                {...(publishing ? { loading: true } : {})}
              >
                Publish
              </s-button>
              <s-button onClick={handleBackToOptions}>Back to options</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}

      {stage === "published" && (
        <s-section heading="Published">
          <s-stack direction="block" gap="large">
            <s-banner heading="llms.txt published" tone="success">
              Your <s-text>llms.txt</s-text> is now live on your storefront.
            </s-banner>

            <s-stack direction="inline" gap="base">
              <s-button variant="primary" href={llmsUrl} target="_blank">
                View live llms.txt
              </s-button>
              <s-button onClick={handleEditAgain}>Edit again</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
