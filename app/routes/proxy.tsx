import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const res = await admin.graphql(`#graphql
    query {
      shop {
        metafield(namespace: "aeo_optimizer", key: "llms_txt") {
          value
        }
      }
    }
  `);

  const { data } = await res.json();
  const content: string = data?.shop?.metafield?.value ?? "";

  return new Response(content || "# llms.txt not yet published", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
