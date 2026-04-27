/** MVP text/HTML helpers for AEO content scoring */

export function stripHTML(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function avgSentenceLength(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return 0;
  const lengths = sentences.map(
    (s) => s.split(/\s+/).filter(Boolean).length,
  );
  return lengths.reduce((a, b) => a + b, 0) / lengths.length;
}

export function hasBulletPoints(html: string): boolean {
  if (/<ul\b/i.test(html) || /<ol\b/i.test(html) || /<li\b/i.test(html)) {
    return true;
  }
  const plain = stripHTML(html);
  return /(^|\n)\s*[-•*]\s+\S/m.test(plain);
}

export function hasHeadings(html: string): boolean {
  return /<(h2|h3)\b/i.test(html);
}

export function keywordExists(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "our",
  "this",
  "that",
]);

/**
 * Returns a word that appears in at least `ratio` of titles, or null.
 */
export function dominantTitleWord(
  titles: string[],
  ratio = 0.5,
): string | null {
  if (titles.length === 0) return null;
  const counts = new Map<string, number>();
  for (const t of titles) {
    const words = stripHTML(t)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    const seen = new Set(words);
    for (const w of seen) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const need = Math.ceil(titles.length * ratio);
  let best: string | null = null;
  let bestN = 0;
  for (const [w, n] of counts) {
    if (n >= need && n > bestN) {
      best = w;
      bestN = n;
    }
  }
  return best;
}

const GENERIC_TITLE = /^(\s*(product|item)\s*[#:]?\s*\d+\s*|untitled|test\s+product|new\s+product|sample\s+product|default\s+title|placeholder)\s*$/i;

export function isGenericProductTitle(title: string): boolean {
  return GENERIC_TITLE.test(title.trim());
}
