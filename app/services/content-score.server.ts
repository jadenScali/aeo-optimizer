import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  avgSentenceLength,
  clamp,
  dominantTitleWord,
  hasBulletPoints,
  hasHeadings,
  isGenericProductTitle,
  keywordExists,
  stripHTML,
} from "../lib/content-score-helpers";

export type ScoreIssue = {
  issue: string;
  recommendation: string;
};

export type CategoryScore = {
  score: number;
  max: number;
  issues: ScoreIssue[];
};

export type ContentScoreReport = {
  ok: boolean;
  error?: string;
  /** Non-fatal notices (e.g. pages skipped when scope missing). */
  warnings?: string[];
  total: number;
  categories: {
    contentClarity: CategoryScore;
    structure: CategoryScore;
    crawlability: CategoryScore;
    entityStrength: CategoryScore;
    completeness: CategoryScore;
  };
  meta: {
    productCount: number;
    pageCount: number;
  };
};

type ProductNode = { title: string | null; descriptionHtml: string | null };
type PageNode = { title: string | null; handle: string | null; body: string | null };

const SECTION_KW = ["features", "specs", "details"];
const FAQ_KW = ["faq", "frequently asked"];
const SPECS_KW = ["spec", "feature", "detail"];
const SHIPPING_KW = ["shipping", "return", "refund", "exchange"];

const PRODUCTS_QUERY = `#graphql
  query ContentScoreProducts($first: Int!) {
    products(first: $first) {
      nodes {
        title
        descriptionHtml
      }
    }
  }
`;

const PAGES_QUERY = `#graphql
  query ContentScorePages($first: Int!) {
    pages(first: $first) {
      nodes {
        title
        handle
        body
      }
    }
  }
`;

type GqlErr = { message: string };

async function graphqlJson<T>(
  admin: AdminApiContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data?: T; errors?: GqlErr[] }> {
  const res = await admin.graphql(query, { variables });
  return (await res.json()) as { data?: T; errors?: GqlErr[] };
}

export async function runContentScoreAudit(
  admin: AdminApiContext,
): Promise<ContentScoreReport> {
  let products: ProductNode[] = [];
  let pages: PageNode[] = [];
  const warnings: string[] = [];

  try {
    const pJson = await graphqlJson<{
      products?: { nodes: ProductNode[] };
    }>(admin, PRODUCTS_QUERY, { first: 25 });

    if (pJson.errors?.length) {
      return {
        ok: false,
        error: pJson.errors.map((e) => e.message).join("; "),
        total: 0,
        categories: emptyCategories(),
        meta: { productCount: 0, pageCount: 0 },
      };
    }
    products = pJson.data?.products?.nodes ?? [];

    const pgJson = await graphqlJson<{ pages?: { nodes: PageNode[] } }>(
      admin,
      PAGES_QUERY,
      { first: 50 },
    );

    if (pgJson.errors?.length) {
      const msg = pgJson.errors.map((e) => e.message).join("; ");
      pages = [];
      warnings.push(
        `Pages were skipped (${msg}). Grant read_online_store_pages or read_content and reinstall the app for full scoring.`,
      );
    } else {
      pages = pgJson.data?.pages?.nodes ?? [];
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      ok: false,
      error: msg,
      total: 0,
      categories: emptyCategories(),
      meta: { productCount: 0, pageCount: 0 },
    };
  }

  const titles = products.map((p) => p.title ?? "").filter(Boolean);
  const htmlChunks = products.map((p) => p.descriptionHtml ?? "");
  const combinedProductHtml = htmlChunks.join("\n");
  const combinedProductText = stripHTML(combinedProductHtml);
  const pageText = pages
    .map((p) => `${p.title ?? ""}\n${stripHTML(p.body ?? "")}`)
    .join("\n");

  const descLengths = htmlChunks.map((h) => stripHTML(h).length);
  const avgDescLen =
    descLengths.length > 0
      ? descLengths.reduce((a, b) => a + b, 0) / descLengths.length
      : 0;
  const avgSent = avgSentenceLength(combinedProductText);

  const contentClarity = scoreContentClarity({
    avgDescLen,
    combinedProductHtml,
    avgSent,
  });
  const structure = scoreStructure({
    products,
    combinedProductHtml,
    pageText,
  });
  const crawlability = scoreCrawlability({ products, descLengths, titles });
  const entityStrength = scoreEntityStrength({ products, pages, titles });
  const completeness = scoreCompleteness({
    combinedProductHtml,
    pageText,
    pages,
  });

  const categories = {
    contentClarity,
    structure,
    crawlability,
    entityStrength,
    completeness,
  };
  const total = Object.values(categories).reduce((s, c) => s + c.score, 0);

  return {
    ok: true,
    ...(warnings.length ? { warnings } : {}),
    total,
    categories,
    meta: { productCount: products.length, pageCount: pages.length },
  };
}

function emptyCategories(): ContentScoreReport["categories"] {
  const z = (max: number): CategoryScore => ({ score: 0, max, issues: [] });
  return {
    contentClarity: z(25),
    structure: z(25),
    crawlability: z(20),
    entityStrength: z(15),
    completeness: z(15),
  };
}

function scoreContentClarity(input: {
  avgDescLen: number;
  combinedProductHtml: string;
  avgSent: number;
}): CategoryScore {
  const issues: ScoreIssue[] = [];
  let score = 0;

  if (input.avgDescLen > 200) {
    score += 10;
  } else {
    issues.push({
      issue: "Product descriptions are short on average",
      recommendation:
        "Aim for richer descriptions (200+ characters) so AI systems can summarize accurately",
    });
  }

  if (hasBulletPoints(input.combinedProductHtml)) {
    score += 10;
  } else {
    issues.push({
      issue: "No bullet-style lists detected in product HTML",
      recommendation:
        "Add <ul>/<li> lists or line breaks with dashes for scannable facts",
    });
  }

  if (hasHeadings(input.combinedProductHtml)) {
    score += 5;
  } else {
    issues.push({
      issue: "No H2/H3 headings found in product descriptions",
      recommendation:
        "Break long descriptions into sections with clear subheadings",
    });
  }

  if (input.avgSent > 30) {
    score -= 10;
    issues.push({
      issue: "Average sentence length is high",
      recommendation:
        "Shorten sentences (under ~30 words) for clarity and AI parsing",
    });
  }

  score = clamp(score, 0, 25);
  return { score, max: 25, issues };
}

function scoreStructure(input: {
  products: ProductNode[];
  combinedProductHtml: string;
  pageText: string;
}): CategoryScore {
  const issues: ScoreIssue[] = [];
  let score = 0;

  const missingTitle = input.products.some(
    (p) => !(p.title && p.title.trim()),
  );
  if (!missingTitle && input.products.length > 0) {
    score += 5;
  } else {
    issues.push({
      issue: "Some products are missing titles",
      recommendation: "Ensure every product has a descriptive title",
    });
  }

  if (keywordExists(input.combinedProductHtml, SECTION_KW)) {
    score += 10;
  } else {
    issues.push({
      issue: 'No clear "features", "specs", or "details" sections detected',
      recommendation:
        "Add labeled sections (Features, Specs, Details) in descriptions",
    });
  }

  const faqHaystack = `${input.combinedProductHtml}\n${input.pageText}`;
  if (keywordExists(faqHaystack, FAQ_KW)) {
    score += 10;
  } else {
    issues.push({
      issue: "No FAQ content detected",
      recommendation: "Add FAQ section to improve AI readability",
    });
  }

  score = clamp(score, 0, 25);
  return { score, max: 25, issues };
}

function scoreCrawlability(input: {
  products: ProductNode[];
  descLengths: number[];
  titles: string[];
}): CategoryScore {
  const issues: ScoreIssue[] = [];
  let score = 0;

  const hasHtml =
    input.descLengths.some((n) => n > 0) && input.products.length > 0;
  if (hasHtml) {
    score += 10;
  } else {
    issues.push({
      issue: "Little or no product description HTML",
      recommendation: "Add non-empty HTML descriptions to key products",
    });
  }

  const metaLike = input.products.some((p) => {
    const t = (p.title ?? "").length;
    const d = stripHTML(p.descriptionHtml ?? "").length;
    return t + d > 50;
  });
  if (metaLike && input.products.length > 0) {
    score += 5;
  } else {
    issues.push({
      issue: "Thin title + description content",
      recommendation:
        "Expand titles and blurbs so each product has substantive text",
    });
  }

  const missingTitles = input.products.filter(
    (p) => !(p.title && p.title.trim()),
  );
  if (missingTitles.length === 0 && input.products.length > 0) {
    score += 5;
  } else {
    issues.push({
      issue: "Missing product titles detected",
      recommendation: "Fill in titles for all products",
    });
  }

  score = clamp(score, 0, 20);
  return { score, max: 20, issues };
}

function scoreEntityStrength(input: {
  products: ProductNode[];
  pages: PageNode[];
  titles: string[];
}): CategoryScore {
  const issues: ScoreIssue[] = [];
  let score = 0;

  if (input.titles.length && dominantTitleWord(input.titles)) {
    score += 5;
  } else if (input.titles.length) {
    issues.push({
      issue: "Weak brand signal across product titles",
      recommendation:
        "Use a consistent brand or product line name in most titles",
    });
  } else {
    issues.push({
      issue: "No product titles to analyze",
      recommendation: "Add catalog products with titles",
    });
  }

  const generic = input.products.filter((p) =>
    isGenericProductTitle(p.title ?? ""),
  );
  if (input.products.length && generic.length === 0) {
    score += 5;
  } else if (generic.length) {
    issues.push({
      issue: "Some titles look generic (e.g. Product 1, Untitled)",
      recommendation: "Replace placeholder titles with specific names",
    });
  }

  const about = input.pages.some(
    (p) =>
      (p.title ?? "").toLowerCase().includes("about") ||
      (p.handle ?? "").toLowerCase().includes("about"),
  );
  if (about) {
    score += 5;
  } else {
    issues.push({
      issue: 'No "About" page detected',
      recommendation: "Add an About page so AI can learn who you are",
    });
  }

  score = clamp(score, 0, 15);
  return { score, max: 15, issues };
}

function scoreCompleteness(input: {
  combinedProductHtml: string;
  pageText: string;
  pages: PageNode[];
}): CategoryScore {
  const issues: ScoreIssue[] = [];
  let score = 0;

  const faqPage = input.pages.some(
    (p) =>
      (p.title ?? "").toLowerCase().includes("faq") ||
      (p.handle ?? "").toLowerCase().includes("faq"),
  );
  if (faqPage) {
    score += 5;
  } else {
    issues.push({
      issue: "No dedicated FAQ page found",
      recommendation: "Create a FAQ page for common shopper questions",
    });
  }

  const shipHaystack = `${input.combinedProductHtml}\n${input.pageText}`;
  if (keywordExists(shipHaystack, SHIPPING_KW)) {
    score += 5;
  } else {
    issues.push({
      issue: "Shipping or returns policy not clearly mentioned",
      recommendation:
        "Mention shipping, returns, or refunds in a policy or product copy",
    });
  }

  if (keywordExists(input.combinedProductHtml, SPECS_KW)) {
    score += 5;
  } else {
    issues.push({
      issue: "Specs/features keywords sparse in product copy",
      recommendation:
        "Call out specifications and features explicitly in descriptions",
    });
  }

  score = clamp(score, 0, 15);
  return { score, max: 15, issues };
}
