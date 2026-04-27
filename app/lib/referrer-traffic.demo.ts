/**
 * Demo time series for the AI referrer chart.
 * TODO: Replace with Shopify Analytics, app telemetry, or persisted metrics.
 */
export type ReferrerDayRow = {
  date: string;
  chatgpt: number;
  claude: number;
  perplexity: number;
  gemini: number;
  searchgpt: number;
};

export type ReferrerDayTotalRow = {
  date: string;
  total: number;
};

export function referrerRowsToTotals(rows: ReferrerDayRow[]): ReferrerDayTotalRow[] {
  return rows.map((r) => ({
    date: r.date,
    total:
      r.chatgpt +
      r.claude +
      r.perplexity +
      r.gemini +
      r.searchgpt,
  }));
}

export function buildDemoReferrerSeries(dayCount = 30): ReferrerDayRow[] {
  const rows: ReferrerDayRow[] = [];
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const t = (dayCount - 1 - i) / Math.max(1, dayCount - 1);

    const wave = (phase: number, amp: number, base: number) => {
      const v =
        base +
        amp * Math.sin(t * Math.PI * 2 + phase) +
        0.35 * amp * Math.sin(t * Math.PI * 4 + phase * 1.3);
      return Math.max(0, Math.round(v));
    };

    rows.push({
      date,
      chatgpt: wave(0, 42, 45),
      claude: wave(0.9, 28, 22),
      perplexity: wave(1.6, 32, 28),
      gemini: wave(2.2, 22, 18),
      searchgpt: wave(2.8, 20, 15),
    });
  }

  return rows;
}
