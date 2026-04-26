import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReferrerDayRow } from "../lib/referrer-traffic.demo";

const SERIES = [
  { key: "chatgpt", label: "ChatGPT", color: "#14b8a6" },
  { key: "claude", label: "Claude", color: "#a855f7" },
  { key: "perplexity", label: "Perplexity", color: "#3b82f6" },
  { key: "gemini", label: "Gemini", color: "#f59e0b" },
  { key: "searchgpt", label: "SearchGPT", color: "#166534" },
] as const;

const axisTickFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatAxisDate(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return axisTickFormatter.format(d);
}

function formatTooltipTitle(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toISOString().slice(0, 10);
}

type TooltipEntry = {
  name?: string;
  value?: number;
  color?: string;
};

function ReferrerTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || label == null) {
    return null;
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
        padding: "12px 14px",
        fontSize: 13,
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, color: "#202223" }}>
        {formatTooltipTitle(label)}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            color: entry.color ?? "#202223",
            lineHeight: 1.5,
          }}
        >
          {entry.name}: {entry.value ?? 0}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_CHART_HEIGHT = 400;

/** Use a fixed height: percentage height inside `ResponsiveContainer` stays 0 when the parent only has `min-height`. */
export function AiReferrerTrafficChart({
  data,
  height = DEFAULT_CHART_HEIGHT,
}: {
  data: ReferrerDayRow[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
      >
        <CartesianGrid
          stroke="#e3e3e3"
          strokeDasharray="3 3"
          vertical
          horizontal={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#6d7175" }}
          tickLine={false}
          axisLine={{ stroke: "#e3e3e3" }}
          tickFormatter={formatAxisDate}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#6d7175" }}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip content={<ReferrerTooltip />} />
        <Legend
          align="center"
          verticalAlign="bottom"
          wrapperStyle={{ paddingTop: 16 }}
          formatter={(value) => (
            <span style={{ color: "#202223", fontSize: 12 }}>{value}</span>
          )}
        />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: "#fff",
              stroke: s.color,
              strokeWidth: 2,
            }}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
