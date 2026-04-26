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

  const llmsUrl = `https://${shop}/a/llms-txt`;

  return (
    <s-page heading="AEO Optimizer">
      <s-section>
        <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
          Optimize Now
        </h3>
        <s-paragraph>
          Generate an llms.txt file for your storefront.
          <br />
          <br />
          This is an experimental standard and not widely adopted yet, but it may help AI systems better understand and reference your site content in the future.
          <br />
          <br />
          Once published, it will be available at /llms.txt.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href="/app/generate">
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
