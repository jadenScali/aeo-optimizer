const AI_BOT_USER_AGENTS: Record<string, string> = {
  GPTBot: "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  ChatGPTUser:
    "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  ClaudeBot:
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://www.anthropic.com)",
  Gemini:
    "Mozilla/5.0 (compatible; GoogleOther/1.0; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)",
  GoogleExtended:
    "Mozilla/5.0 (compatible; Google-Extended/1.0; +https://support.google.com/webmasters/answer/13595614)",
};

type FetchSummary = {
  url: string;
  status: number;
  redirected: boolean;
  finalUrl: string;
  headers: Record<string, string>;
  bodySnippet?: string;
};

type RobotsGroup = {
  userAgents: string[];
  allow: string[];
  disallow: string[];
};

type RobotsParsed = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

export type CrawlabilityAudit = {
  shopDomain: string;
  overallScore: number;
  blockingIssues: string[];
  robots: {
    url: string;
    status: number;
    rawText: string;
    parsed: RobotsParsed;
    aiBotAccess: Record<
      string,
      { matchedGroupUserAgents: string[]; blockedAll: boolean }
    >;
  };
  sitemaps: {
    discovered: { url: string; status: number }[];
  };
  samples: {
    url: string;
    status: number;
    finalUrl: string;
    redirectChainHint?: string;
    isPasswordWall: boolean;
    noindex: boolean;
    structuredDataPresent: boolean;
    headers: Record<string, string>;
  }[];
  uaVariance: {
    url: string;
    byBot: Record<string, { status: number; finalUrl: string }>;
  }[];
};

const DEFAULT_LIMITS = {
  maxSitemaps: 3,
  maxSitemapLocsToSample: 5,
  maxSampleUrls: 10,
  maxUaVarianceUrls: 3,
  timeoutMs: 12_000,
  bodySnippetChars: 50_000,
} as const;

function normalizeShopDomain(input: string): string {
  const trimmed = input.trim();
  const noProto = trimmed.replace(/^https?:\/\//i, "");
  const host = noProto.split("/")[0] || "";
  return host.toLowerCase();
}

function safeStorefrontBaseUrl(shopDomain: string): string {
  const host = normalizeShopDomain(shopDomain);
  if (!host || host.includes("@") || host.includes("\\") || host.includes("..")) {
    throw new Error("Invalid shop domain");
  }
  return `https://${host}`;
}

async function fetchWithTimeout(
  url: string,
  {
    timeoutMs,
    userAgent,
    accept,
  }: { timeoutMs: number; userAgent?: string; accept?: string },
): Promise<FetchSummary> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...(userAgent ? { "User-Agent": userAgent } : {}),
        ...(accept ? { Accept: accept } : {}),
      },
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let bodySnippet: string | undefined;
    const contentType = headers["content-type"] || "";
    if (
      contentType.includes("text") ||
      contentType.includes("xml") ||
      contentType.includes("html")
    ) {
      const text = await res.text();
      bodySnippet = text.slice(0, DEFAULT_LIMITS.bodySnippetChars);
    }

    return {
      url,
      status: res.status,
      redirected: res.redirected,
      finalUrl: res.url,
      headers,
      bodySnippet,
    };
  } finally {
    clearTimeout(t);
  }
}

function parseRobotsTxt(rawText: string): RobotsParsed {
  const lines = rawText
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  const sitemaps: string[] = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || current.allow.length || current.disallow.length) {
        current = { userAgents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.userAgents.push(value);
      continue;
    }

    if (key === "allow") {
      if (!current) {
        current = { userAgents: ["*"], allow: [], disallow: [] };
        groups.push(current);
      }
      current.allow.push(value);
      continue;
    }

    if (key === "disallow") {
      if (!current) {
        current = { userAgents: ["*"], allow: [], disallow: [] };
        groups.push(current);
      }
      current.disallow.push(value);
      continue;
    }

    if (key === "sitemap") {
      sitemaps.push(value);
    }
  }

  return { groups, sitemaps };
}

function pickGroupForUserAgent(parsed: RobotsParsed, botUaName: string): RobotsGroup | null {
  const bot = botUaName.toLowerCase();
  for (const g of parsed.groups) {
    if (g.userAgents.some((ua) => ua.toLowerCase() === bot)) return g;
  }
  for (const g of parsed.groups) {
    if (g.userAgents.some((ua) => ua === "*")) return g;
  }
  return null;
}

function groupBlocksAll(g: RobotsGroup | null): boolean {
  if (!g) return false;
  return g.disallow.some((d) => d === "/");
}

function extractXmlLocs(xmlSnippet: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlSnippet))) {
    locs.push(m[1]!);
    if (locs.length >= 50) break;
  }
  return locs;
}

function isLikelyPasswordWall(fetchSummary: FetchSummary): boolean {
  const finalUrl = fetchSummary.finalUrl.toLowerCase();
  if (finalUrl.includes("/password")) return true;
  const snippet = (fetchSummary.bodySnippet || "").toLowerCase();
  if (snippet.includes("enter store using password")) return true;
  if (snippet.includes("this store is password protected")) return true;
  return false;
}

function detectNoindex(fetchSummary: FetchSummary): boolean {
  const xRobots = fetchSummary.headers["x-robots-tag"] || "";
  if (/noindex/i.test(xRobots)) return true;
  const snippet = fetchSummary.bodySnippet || "";
  if (/<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(snippet))
    return true;
  return false;
}

function detectStructuredData(fetchSummary: FetchSummary): boolean {
  const snippet = fetchSummary.bodySnippet || "";
  return /application\/ld\+json/i.test(snippet);
}

function scoreAudit(input: {
  blockingIssues: string[];
  robotsBlocksAllForSomeBot: boolean;
  sitemapOkCount: number;
  sampleOkCount: number;
  sampleNoindexCount: number;
  passwordWall: boolean;
}): number {
  let score = 100;

  if (input.passwordWall) score -= 60;
  if (input.robotsBlocksAllForSomeBot) score -= 25;
  if (input.sitemapOkCount === 0) score -= 15;
  if (input.sampleOkCount === 0) score -= 20;
  score -= Math.min(20, input.sampleNoindexCount * 5);
  score -= input.blockingIssues.length * 5;

  return Math.max(0, Math.min(100, score));
}

export async function runCrawlabilityAudit(opts: {
  shopDomain: string;
  samplePaths?: string[];
  includeUaVariance?: boolean;
}): Promise<CrawlabilityAudit> {
  const shopDomain = normalizeShopDomain(opts.shopDomain);
  const baseUrl = safeStorefrontBaseUrl(shopDomain);
  const timeoutMs = DEFAULT_LIMITS.timeoutMs;

  const robotsUrl = `${baseUrl}/robots.txt`;
  const robotsFetch = await fetchWithTimeout(robotsUrl, {
    timeoutMs,
    userAgent: "Mozilla/5.0 (compatible; CrawlabilityAudit/1.0)",
    accept: "text/plain,*/*",
  });
  const robotsText = robotsFetch.bodySnippet || "";
  const robotsParsed = parseRobotsTxt(robotsText);

  const aiBotAccess: CrawlabilityAudit["robots"]["aiBotAccess"] = {};
  let robotsBlocksAllForSomeBot = false;
  for (const bot of Object.keys(AI_BOT_USER_AGENTS)) {
    const group = pickGroupForUserAgent(robotsParsed, bot);
    const blockedAll = groupBlocksAll(group);
    aiBotAccess[bot] = {
      matchedGroupUserAgents: group?.userAgents ?? [],
      blockedAll,
    };
    if (blockedAll) robotsBlocksAllForSomeBot = true;
  }

  const sitemapCandidates = Array.from(
    new Set([
      ...robotsParsed.sitemaps,
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
    ]),
  ).slice(0, DEFAULT_LIMITS.maxSitemaps);

  const discoveredSitemaps: { url: string; status: number; xmlSnippet?: string }[] = [];
  for (const url of sitemapCandidates) {
    const res = await fetchWithTimeout(url, {
      timeoutMs,
      userAgent: "Mozilla/5.0 (compatible; CrawlabilityAudit/1.0)",
      accept: "application/xml,text/xml,*/*",
    });
    discoveredSitemaps.push({ url, status: res.status, xmlSnippet: res.bodySnippet });
  }

  const okSitemaps = discoveredSitemaps.filter((s) => s.status >= 200 && s.status < 300);
  const sitemapLocs: string[] = [];
  for (const s of okSitemaps) {
    if (!s.xmlSnippet) continue;
    const locs = extractXmlLocs(s.xmlSnippet);
    sitemapLocs.push(...locs);
    if (sitemapLocs.length >= DEFAULT_LIMITS.maxSitemapLocsToSample) break;
  }

  const seedPaths =
    opts.samplePaths && opts.samplePaths.length
      ? opts.samplePaths
      : ["/", "/collections", "/products"];

  const sampleUrls = Array.from(
    new Set([
      ...seedPaths.map((p) => `${baseUrl}${p.startsWith("/") ? p : `/${p}`}`),
      ...sitemapLocs.slice(0, DEFAULT_LIMITS.maxSitemapLocsToSample),
    ]),
  ).slice(0, DEFAULT_LIMITS.maxSampleUrls);

  const samples: CrawlabilityAudit["samples"] = [];
  for (const url of sampleUrls) {
    const res = await fetchWithTimeout(url, {
      timeoutMs,
      userAgent: "Mozilla/5.0 (compatible; CrawlabilityAudit/1.0)",
      accept: "text/html,application/xhtml+xml,*/*",
    });
    const isPasswordWall = isLikelyPasswordWall(res);
    const noindex = detectNoindex(res);
    const structuredDataPresent = detectStructuredData(res);
    samples.push({
      url,
      status: res.status,
      finalUrl: res.finalUrl,
      redirectChainHint: res.redirected ? `${url} -> ${res.finalUrl}` : undefined,
      isPasswordWall,
      noindex,
      structuredDataPresent,
      headers: {
        "content-type": res.headers["content-type"] || "",
        "x-robots-tag": res.headers["x-robots-tag"] || "",
        "cache-control": res.headers["cache-control"] || "",
      },
    });
  }

  const varianceTargets = sampleUrls.slice(0, DEFAULT_LIMITS.maxUaVarianceUrls);
  const uaVariance: CrawlabilityAudit["uaVariance"] = [];
  if (opts.includeUaVariance !== false) {
    for (const url of varianceTargets) {
      const byBot: CrawlabilityAudit["uaVariance"][number]["byBot"] = {};
      for (const [bot, ua] of Object.entries(AI_BOT_USER_AGENTS)) {
        const res = await fetchWithTimeout(url, {
          timeoutMs,
          userAgent: ua,
          accept: "text/html,application/xhtml+xml,*/*",
        });
        byBot[bot] = { status: res.status, finalUrl: res.finalUrl };
      }
      uaVariance.push({ url, byBot });
    }
  }

  const blockingIssues: string[] = [];
  const anyPasswordWall = samples.some((s) => s.isPasswordWall);
  if (anyPasswordWall) blockingIssues.push("Storefront appears password protected.");
  if (robotsFetch.status === 404) blockingIssues.push("robots.txt missing (404).");
  if (robotsFetch.status >= 500) blockingIssues.push(`robots.txt error (${robotsFetch.status}).`);
  if (okSitemaps.length === 0) blockingIssues.push("No accessible sitemap found.");

  const sampleOkCount = samples.filter((s) => s.status >= 200 && s.status < 400).length;
  const sampleNoindexCount = samples.filter((s) => s.noindex).length;

  const overallScore = scoreAudit({
    blockingIssues,
    robotsBlocksAllForSomeBot,
    sitemapOkCount: okSitemaps.length,
    sampleOkCount,
    sampleNoindexCount,
    passwordWall: anyPasswordWall,
  });

  return {
    shopDomain,
    overallScore,
    blockingIssues,
    robots: {
      url: robotsUrl,
      status: robotsFetch.status,
      rawText: robotsText,
      parsed: robotsParsed,
      aiBotAccess,
    },
    sitemaps: {
      discovered: discoveredSitemaps.map(({ url, status }) => ({ url, status })),
    },
    samples,
    uaVariance,
  };
}

