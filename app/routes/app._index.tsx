import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();
  const [generating, setGenerating] = useState(false);

  const llmsUrl = `https://${shop}/llms.txt`;

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 800);
  };

  return (
    <s-page heading="AEO Optimizer">
      <s-section heading="llms.txt">
        <s-paragraph>
          Generate an <s-text>llms.txt</s-text> for your storefront so AI
          answer engines can discover and cite your content. Once generated,
          it will be served at <s-text>/llms.txt</s-text>.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            onClick={handleGenerate}
            {...(generating ? { loading: true } : {})}
          >
            Generate llms.txt
          </s-button>
          <s-button href={llmsUrl} target="_blank">
            View llms.txt
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
