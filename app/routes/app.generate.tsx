import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
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

function generateLlmsTxt(options: Options): string {
  return [
    `includeCollections: ${options.includeCollections}`,
    `includeProducts: ${options.includeProducts}`,
    `includePages: ${options.includePages}`,
    `linkRobots: ${options.linkRobots}`,
    `linkSitemap: ${options.linkSitemap}`,
  ].join("\n");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Generate() {
  const { shop } = useLoaderData<typeof loader>();
  const llmsUrl = `https://${shop}/llms.txt`;

  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [stage, setStage] = useState<Stage>("options");
  const [preview, setPreview] = useState("");
  const [publishing, setPublishing] = useState(false);

  const toggle = (key: keyof Options) => (event: Event) => {
    const checked = (event.currentTarget as unknown as { checked: boolean }).checked;
    setOptions((prev) => ({ ...prev, [key]: checked }));
  };

  const handleGenerate = () => {
    setPreview(generateLlmsTxt(options));
    setStage("preview");
  };

  const handlePublish = () => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      setStage("published");
    }, 600);
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
              <s-button variant="primary" onClick={handleGenerate}>
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
