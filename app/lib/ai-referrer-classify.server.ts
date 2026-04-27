/**
 * Classifies storefront visits that may come from AI / answer engines.
 *
 * Marketers should tag outbound AI links with UTMs (e.g. utm_source=chatgpt).
 * Organic AI referrers often lack UTMs; the theme embed passes ref_host from
 * document.referrer when the browser exposes it — still not guaranteed (privacy,
 * stripped referrer, in-app browsers).
 */
import type { ReferrerDayRow } from "./referrer-traffic.demo";

export type AiReferrerPlatform = keyof Pick<
  ReferrerDayRow,
  "chatgpt" | "claude" | "perplexity" | "gemini" | "searchgpt"
>;

type Rule = { platform: AiReferrerPlatform; needles: string[] };

/** Order matters: first match wins (more specific rules first). */
const RULES: Rule[] = [
  {
    platform: "chatgpt",
    needles: [
      "chatgpt",
      "chat.openai",
      "openai",
      "gpt-4",
      "gpt4",
      "oai",
    ],
  },
  {
    platform: "claude",
    needles: [
      "claude",
      "anthropic",
      "claude.ai",
    ],
  },
  {
    platform: "perplexity",
    needles: ["perplexity", "pplx.ai"],
  },
  {
    platform: "gemini",
    needles: [
      "gemini",
      "bard",
      "google-bard",
      "google_bard",
      "generativeai.google",
    ],
  },
  {
    platform: "searchgpt",
    needles: [
      "searchgpt",
      "bing chat",
      "bing-chat",
      "bingchat",
      "copilot.microsoft",
      "microsoft copilot",
      "edge copilot",
    ],
  },
];

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchRules(haystack: string): AiReferrerPlatform | null {
  const h = normalize(haystack);
  if (!h) return null;
  for (const rule of RULES) {
    for (const needle of rule.needles) {
      if (h.includes(needle)) return rule.platform;
    }
  }
  return null;
}

/**
 * Returns a chart platform key if any UTM field or ref_host matches known AI patterns.
 */
export function classifyAiReferrerFromSearchParams(
  searchParams: URLSearchParams,
): AiReferrerPlatform | null {
  const utmParts: string[] = [];
  for (const key of UTM_KEYS) {
    const v = searchParams.get(key);
    if (v) utmParts.push(v);
  }
  const combinedUtm = utmParts.join(" ");
  const fromUtm = matchRules(combinedUtm);
  if (fromUtm) return fromUtm;

  const refHost = searchParams.get("ref_host");
  if (refHost) {
    const fromRef = matchRules(refHost.replace(/^www\./, ""));
    if (fromRef) return fromRef;
  }

  return null;
}
