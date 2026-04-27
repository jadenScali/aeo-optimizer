import prisma from "../db.server";

import type { AiReferrerPlatform } from "./ai-referrer-classify.server";
import type { ReferrerDayRow } from "./referrer-traffic.demo";

const PLATFORMS: AiReferrerPlatform[] = [
  "chatgpt",
  "claude",
  "perplexity",
  "gemini",
  "searchgpt",
];

export function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function incrementAiReferrerStat(input: {
  shop: string;
  day: string;
  platform: AiReferrerPlatform;
}): Promise<void> {
  await prisma.aiReferrerDailyStat.upsert({
    where: {
      shop_day_platform: {
        shop: input.shop,
        day: input.day,
        platform: input.platform,
      },
    },
    create: {
      shop: input.shop,
      day: input.day,
      platform: input.platform,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });
}

/**
 * Last `dayCount` UTC days (including today) as ReferrerDayRow for the chart.
 */
export async function getReferrerSeriesForShop(
  shop: string,
  dayCount = 30,
): Promise<ReferrerDayRow[]> {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (dayCount - 1));
  const startDay = utcDayString(start);
  const endDay = utcDayString(end);

  const rows = await prisma.aiReferrerDailyStat.findMany({
    where: {
      shop,
      day: { gte: startDay, lte: endDay },
    },
  });

  const byDay = new Map<string, ReferrerDayRow>();

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const day = utcDayString(d);
    byDay.set(day, {
      date: day,
      chatgpt: 0,
      claude: 0,
      perplexity: 0,
      gemini: 0,
      searchgpt: 0,
    });
  }

  for (const r of rows) {
    const row = byDay.get(r.day);
    if (!row || !isPlatformKey(r.platform)) continue;
    row[r.platform] = r.count;
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function isPlatformKey(k: string): k is AiReferrerPlatform {
  return (PLATFORMS as string[]).includes(k);
}

export function seriesHasAnyVisits(series: ReferrerDayRow[]): boolean {
  return series.some(
    (r) =>
      r.chatgpt +
        r.claude +
        r.perplexity +
        r.gemini +
        r.searchgpt >
      0,
  );
}
