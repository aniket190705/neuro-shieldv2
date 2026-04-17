import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BrainCircuit,
  ChartColumnIncreasing,
  CheckCircle2,
  Clock3,
  Gauge,
  HeartPulse,
  Home,
  Keyboard,
  MousePointer2,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  SquareMousePointer,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

const API_ENDPOINTS = [
  "http://localhost:3000/api/telemetry",
  "http://127.0.0.1:3000/api/telemetry",
  "http://[::1]:3000/api/telemetry",
  "http://localhost:5000/api/telemetry",
  "http://127.0.0.1:5000/api/telemetry",
  "http://[::1]:5000/api/telemetry",
];

const modeIcons = {
  Developer: Keyboard,
  Aviation: Gauge,
  Healthcare: Stethoscope,
};

const pageDefinitions = [
  {
    id: "overview",
    label: "Overview",
    description: "Main decision dashboard",
    icon: Home,
  },
  {
    id: "explainability",
    label: "Explainability",
    description: "Why risk is changing",
    icon: BrainCircuit,
  },
  {
    id: "metrics",
    label: "Live Metrics",
    description: "Behavioral telemetry",
    icon: ChartColumnIncreasing,
  },
  {
    id: "trends",
    label: "Trend Analysis",
    description: "History and trajectory",
    icon: TrendingUp,
  },
  {
    id: "recovery",
    label: "Recovery Hub",
    description: "Baseline and actions",
    icon: HeartPulse,
  },
];

const metricCards = [
  {
    key: "typingSpeed",
    label: "Keyboard Activity",
    suffix: "keys/min",
    icon: Keyboard,
    healthy: "900-1800",
    description: "Estimated key throughput from the latest 5-second extension batch",
  },
  {
    key: "modelConfidence",
    label: "Model Confidence",
    suffix: "%",
    icon: BellRing,
    healthy: "Contextual",
    description: "Confidence of the current LOW / MEDIUM / HIGH fatigue classification",
  },
  {
    key: "mouseTravel",
    label: "Mouse Travel",
    suffix: "px",
    icon: MousePointer2,
    healthy: "120-900",
    description: "Pointer distance captured by the extension in the latest batch",
  },
  {
    key: "tabSwitchCount",
    label: "Tab Switch Count",
    suffix: "",
    icon: SquareMousePointer,
    healthy: "0-8",
    description: "Window and tab context switches observed during the batch",
  },
  {
    key: "sessionDuration",
    label: "Session Duration",
    suffix: "min",
    icon: Clock3,
    healthy: "< 90 min",
    description: "Total monitoring time since the first available telemetry event",
  },
];

const riskStyles = {
  LOW: {
    color: "#2dd4bf",
    soft: "rgba(45, 212, 191, 0.14)",
    text: "System stable",
    accent: "Low cognitive strain",
  },
  MEDIUM: {
    color: "#fbbf24",
    soft: "rgba(251, 191, 36, 0.14)",
    text: "Monitor closely",
    accent: "Moderate drift detected",
  },
  HIGH: {
    color: "#fb7185",
    soft: "rgba(251, 113, 133, 0.14)",
    text: "Immediate attention",
    accent: "Intervention recommended",
  },
};

const EMPTY_STATE = {
  riskLevel: "LOW",
  fatigueScore: 0,
  typingSpeed: 0,
  modelConfidence: 0,
  mouseTravel: 0,
  tabSwitchCount: 0,
  sessionDuration: 0,
  quietStreak: 0,
  baselineTypingDelta: 0,
  baselineSwitchDelta: 0,
  suggestion: "Start the extension and backend to begin live monitoring.",
  status: "Waiting",
  trend: [0, 0, 0, 0, 0, 0, 0],
  factors: [
    {
      label: "Keyboard activity",
      icon: Keyboard,
      trend: "down",
      tone: "good",
      value: "0%",
      detail: "Live extension telemetry has not arrived yet.",
    },
    {
      label: "Mouse travel",
      icon: MousePointer2,
      trend: "down",
      tone: "good",
      value: "0%",
      detail: "This card will explain pointer movement once data starts flowing.",
    },
    {
      label: "Tab switching",
      icon: RefreshCw,
      trend: "down",
      tone: "good",
      value: "0%",
      detail: "Tab context changes will be summarized here from the extension service worker.",
    },
    {
      label: "Model confidence",
      icon: BrainCircuit,
      trend: "down",
      tone: "good",
      value: "0%",
      detail: "The trained fatigue model will populate this explanation after the first prediction.",
    },
  ],
  latestTimestamp: null,
  source: "waiting",
  sampleCount: 0,
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatClock(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function buildChartData(values) {
  return values.map((value, index) => ({
    time: `${index * 5}s`,
    fatigue: value,
  }));
}

function buildPath(values, width, height, padding) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1 || 1)) * innerWidth;
      const y = padding + ((100 - value) / 100) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildArea(values, width, height, padding) {
  const line = buildPath(values, width, height, padding);
  const endX = width - padding;
  const baseY = height - padding;
  const startX = padding;
  return `${line} L ${endX} ${baseY} L ${startX} ${baseY} Z`;
}

function parseTimestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function computeFatigueScore(riskLevel, confidence) {
  const boundedConfidence = clamp(Number(confidence) || 0, 0, 1);

  if (riskLevel === "HIGH") {
    return Math.round(72 + boundedConfidence * 24);
  }

  if (riskLevel === "MEDIUM") {
    return Math.round(46 + boundedConfidence * 22);
  }

  return Math.round(14 + boundedConfidence * 24);
}

function getRiskSummaryText(riskLevel) {
  if (riskLevel === "HIGH") {
    return "Your operator is likely fatigued and needs immediate recovery support.";
  }

  if (riskLevel === "MEDIUM") {
    return "Fatigue signals are building. This is a good time to intervene gently.";
  }

  return "Current behavior is stable and operating within a safe range.";
}

function getRecommendation(riskLevel, confidence) {
  if (riskLevel === "HIGH") {
    return confidence >= 85
      ? "Take a 5-minute recovery break now and reduce cognitively heavy tasks."
      : "High fatigue is emerging. Pause soon and simplify the next task block.";
  }

  if (riskLevel === "MEDIUM") {
    return "Consider a short break or lighter task switch before fatigue escalates.";
  }

  return "Keep going. Performance is stable and the current workload looks sustainable.";
}

function getStatusLabel(riskLevel) {
  if (riskLevel === "HIGH") {
    return "Fatigued";
  }

  if (riskLevel === "MEDIUM") {
    return "Moderate";
  }

  return "Fresh";
}

function formatDelta(delta) {
  const rounded = Math.round(delta);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function percentDelta(current, baseline) {
  if (!baseline) {
    return current === 0 ? 0 : 100;
  }

  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function computeQuietStreak(logs) {
  let streak = 0;

  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const telemetry = logs[index]?.telemetry || {};
    const keys = Number(telemetry.keys) || 0;
    const mouseDistance = Number(telemetry.mouse_distance) || 0;
    const tabSwitches = Number(telemetry.tab_switches) || 0;

    if (keys <= 1 && mouseDistance < 80 && tabSwitches === 0) {
      streak += 5;
      continue;
    }

    break;
  }

  return streak;
}

function buildFactor({
  label,
  icon,
  current,
  baseline,
  higherIsRisky,
  detail,
}) {
  const delta = percentDelta(current, baseline);
  const isBad = higherIsRisky ? delta > 8 : delta < -8;

  return {
    label,
    icon,
    trend: delta >= 0 ? "up" : "down",
    tone: isBad ? "bad" : "good",
    value: formatDelta(delta),
    detail,
  };
}

function deriveStateFromLogs(logs) {
  if (!logs.length) {
    return EMPTY_STATE;
  }

  const latest = logs.at(-1);
  const recentLogs = logs.slice(-12);
  const chartLogs = logs.slice(-7);
  const firstTimestamp = parseTimestamp(logs[0]?.timestamp || logs[0]?.telemetry?.timestamp);
  const latestTimestamp = parseTimestamp(latest?.timestamp || latest?.telemetry?.timestamp);
  const telemetry = latest?.telemetry || {};

  const typingSpeed = Math.round((Number(telemetry.keys) || 0) * 12);
  const mouseTravel = Math.round(Number(telemetry.mouse_distance) || 0);
  const tabSwitchCount = Math.round(Number(telemetry.tab_switches) || 0);
  const modelConfidence = Math.round(clamp(Number(latest?.score) || 0, 0, 1) * 100);
  const riskLevel = latest?.risk || "LOW";
  const fatigueScore = computeFatigueScore(riskLevel, Number(latest?.score) || 0);
  const sessionDuration = firstTimestamp && latestTimestamp
    ? Math.max(1, Math.round((latestTimestamp - firstTimestamp) / 60000))
    : Math.max(1, Math.round((logs.length * 5) / 60));

  const typingBaseline = average(
    recentLogs.map((entry) => (Number(entry?.telemetry?.keys) || 0) * 12)
  );
  const switchBaseline = average(
    recentLogs.map((entry) => Number(entry?.telemetry?.tab_switches) || 0)
  );
  const mouseBaseline = average(
    recentLogs.map((entry) => Number(entry?.telemetry?.mouse_distance) || 0)
  );
  const scoreBaseline = average(
    recentLogs.map((entry) =>
      computeFatigueScore(entry?.risk || "LOW", Number(entry?.score) || 0)
    )
  );

  const baselineTypingDelta = Math.round(percentDelta(typingSpeed, typingBaseline));
  const baselineSwitchDelta = Math.round(percentDelta(tabSwitchCount, switchBaseline));
  const quietStreak = computeQuietStreak(logs);
  const trend = chartLogs.map((entry) =>
    computeFatigueScore(entry?.risk || "LOW", Number(entry?.score) || 0)
  );

  while (trend.length < 7) {
    trend.unshift(trend[0] ?? 0);
  }

  const factors = [
    buildFactor({
      label: "Keyboard activity",
      icon: Keyboard,
      current: typingSpeed,
      baseline: typingBaseline,
      higherIsRisky: false,
      detail: `Current throughput is ${typingSpeed} keys/min versus a recent baseline of ${Math.round(typingBaseline)} keys/min.`,
    }),
    buildFactor({
      label: "Mouse travel",
      icon: MousePointer2,
      current: mouseTravel,
      baseline: mouseBaseline,
      higherIsRisky: false,
      detail: `Pointer motion is ${mouseTravel} px this batch versus ${Math.round(mouseBaseline)} px across recent batches.`,
    }),
    buildFactor({
      label: "Tab switching",
      icon: RefreshCw,
      current: tabSwitchCount,
      baseline: switchBaseline,
      higherIsRisky: true,
      detail: `The extension observed ${tabSwitchCount} tab switches this batch against a recent baseline of ${switchBaseline.toFixed(1)}.`,
    }),
    {
      label: "Predicted confidence",
      icon: BrainCircuit,
      trend: fatigueScore >= scoreBaseline ? "up" : "down",
      tone: riskLevel === "HIGH" ? "bad" : "good",
      value: `${modelConfidence}%`,
      detail: `The model is ${modelConfidence}% confident in the current ${riskLevel} fatigue classification.`,
    },
  ];

  return {
    riskLevel,
    fatigueScore,
    typingSpeed,
    modelConfidence,
    mouseTravel,
    tabSwitchCount,
    sessionDuration,
    quietStreak,
    baselineTypingDelta,
    baselineSwitchDelta,
    suggestion: getRecommendation(riskLevel, modelConfidence),
    status: getStatusLabel(riskLevel),
    trend,
    factors,
    latestTimestamp,
    source: latest?.source || "model",
    sampleCount: logs.length,
  };
}

async function fetchTelemetryFeed() {
  let lastError = null;

  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const logs = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      return {
        endpoint,
        logs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Unable to reach telemetry backend.");
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
  trendUp,
  description,
  healthy,
}) {
  return (
    <div className="glass-card metric-shine rounded-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6 text-slate-100">
          <Icon size={20} />
        </div>
        <div
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: tone.soft, color: tone.color }}
        >
          {trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {trendUp ? "Rising" : "Dropping"}
        </div>
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <div className="mt-2 flex items-end gap-1.5">
        <span className="font-display text-3xl font-bold text-white">{value}</span>
        <span className="pb-1 text-sm text-slate-400">{suffix}</span>
      </div>
      {description ? (
        <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
      ) : null}
      {healthy ? (
        <p className="mt-2 text-xs uppercase tracking-[0.25em] text-slate-500">
          Healthy range: {healthy}
        </p>
      ) : null}
    </div>
  );
}

function TrendChart({ data, color }) {
  const width = 760;
  const height = 300;
  const padding = 28;
  const values = data.map((item) => item.fatigue);
  const path = buildPath(values, width, height, padding);
  const area = buildArea(values, width, height, padding);
  const upward = values.at(-1) > values[0];

  return (
    <div className="h-80 rounded-[28px] border border-white/8 bg-[#07111f]/80 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + ((100 - tick) / 100) * (height - padding * 2);
          return (
            <g key={tick}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="rgba(148, 163, 184, 0.12)"
                strokeDasharray="5 6"
              />
              <text x={4} y={y + 4} fill="#8ea3bd" fontSize="11">
                {tick}
              </text>
            </g>
          );
        })}
        {data.map((point, index) => {
          const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2);
          return (
            <text key={point.time} x={x - 8} y={height - 6} fill="#8ea3bd" fontSize="11">
              {point.time}
            </text>
          );
        })}
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={upward ? "#fb7185" : color}
              stopOpacity="0.34"
            />
            <stop
              offset="100%"
              stopColor={upward ? "#fb7185" : color}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <path d={area} className="trend-area" fill="url(#trendFill)" />
        <path
          d={path}
          className="trend-line"
          fill="none"
          stroke={upward ? "#fb7185" : color}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {data.map((point, index) => {
          const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2);
          const y = padding + ((100 - point.fatigue) / 100) * (height - padding * 2);
          return (
            <circle
              key={`${point.time}-dot`}
              cx={x}
              cy={y}
              r="4.5"
              fill={upward ? "#fb7185" : color}
            />
          );
        })}
      </svg>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-white">{title}</h2>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function OverviewPage({
  state,
  risk,
  gaugeStyle,
  lastUpdated,
  metricCards,
  setActivePage,
  connection,
}) {
  return (
    <div className="space-y-6">
      {state.riskLevel === "HIGH" ? (
        <div className="pulse-critical glass-card rounded-[28px] border border-rose-400/25 bg-rose-500/10 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-rose-300" size={22} />
              <div>
                <p className="font-display text-lg font-semibold text-rose-100">
                  High fatigue detected
                </p>
                <p className="text-sm text-rose-100/80">
                  Take a 5-minute break to reduce error risk.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActivePage("recovery")}
              className="rounded-full bg-rose-200/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-200/15"
            >
              Open recovery plan
            </button>
          </div>
        </div>
      ) : null}

      {!connection.connected ? (
        <div className="glass-card rounded-[28px] border border-amber-300/20 bg-amber-300/8 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-semibold text-amber-100">
                Waiting for live telemetry
              </p>
              <p className="text-sm text-amber-100/80">
                Start the backend and use the Chrome extension so the dashboard can receive model predictions.
              </p>
            </div>
            {connection.error ? (
              <span className="rounded-full border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100/80">
                {connection.error}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <div className="glass-card hero-grid overflow-hidden rounded-[34px] p-6 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.35em] text-sky-300/75">
                Main Dashboard
              </p>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span
                  className="rounded-full px-4 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: risk.soft, color: risk.color }}
                >
                  {state.riskLevel} RISK
                </span>
                <span className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-slate-300">
                  {risk.accent}
                </span>
              </div>
              <h2 className="max-w-lg font-display text-4xl font-bold leading-tight lg:text-5xl">
                One clear fatigue score. One clear next step.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
                {getRiskSummaryText(state.riskLevel)}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <div className="rounded-3xl border border-white/10 bg-white/6 px-5 py-4">
                  <p className="text-sm text-slate-400">Fatigue Score</p>
                  <div className="font-display text-4xl font-bold">
                    {Math.round(state.fatigueScore)}%
                  </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/6 px-5 py-4">
                  <p className="text-sm text-slate-400">Status</p>
                  <div className="font-display text-4xl font-bold">{state.status}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-5">
              <div
                className="gauge-ring soft-spin relative flex h-72 w-72 items-center justify-center rounded-full"
                style={gaugeStyle}
              >
                <div className="relative z-10 text-center">
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-400">
                    Live Score
                  </p>
                  <div className="mt-3 font-display text-6xl font-bold">
                    {Math.round(state.fatigueScore)}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Last updated: {lastUpdated} seconds ago
                  </p>
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Source</p>
                  <p className="mt-2 font-medium text-white">
                    {String(connection.source || "waiting").toUpperCase()}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Batches</p>
                  <p className="mt-2 font-medium text-white">{connection.sampleCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Backend</p>
                  <p className="mt-2 font-medium text-white">{connection.endpointLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Navigation"
            title="Explore Each Feature"
            description="Use these focused pages to explain the system quickly to judges, teammates, or users."
          />
          <div className="space-y-3">
            {pageDefinitions
              .filter((page) => page.id !== "overview")
              .map((page) => {
                const Icon = page.icon;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setActivePage(page.id)}
                    className="flex w-full items-center justify-between rounded-3xl border border-white/8 bg-white/4 px-4 py-4 text-left transition hover:border-sky-300/25 hover:bg-sky-400/8"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
                        <Icon size={20} />
                      </div>
                      <div>
                        <p className="font-medium text-white">{page.label}</p>
                        <p className="text-sm text-slate-400">{page.description}</p>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-slate-400" />
                  </button>
                );
              })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((metric) => {
          const value = state[metric.key];
          const trendUp = metric.key === "tabSwitchCount"
            ? state.riskLevel === "HIGH"
            : metric.key === "typingSpeed" || metric.key === "mouseTravel"
              ? state.riskLevel !== "HIGH"
              : true;

          return (
            <MetricCard
              key={metric.key}
              icon={metric.icon}
              label={metric.label}
              value={value}
              suffix={metric.suffix}
              trendUp={trendUp}
              tone={risk}
            />
          );
        })}
      </section>
    </div>
  );
}

function ExplainabilityPage({ state, risk, setActivePage }) {
  return (
    <div className="glass-card rounded-[34px] p-6">
      <SectionHeader
        eyebrow="Explainability"
        title="Why Is Fatigue Changing?"
        description="This page isolates the top model signals so non-technical viewers can understand what drove the score."
        action={
          <button
            type="button"
            onClick={() => setActivePage("metrics")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Open live metrics
          </button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {state.factors.map((factor, index) => {
          const bad = factor.tone === "bad";
          const toneColor = bad ? "text-rose-300" : "text-emerald-300";
          const bgTone = bad ? "bg-rose-400/10" : "bg-emerald-400/10";
          const TrendIcon = factor.trend === "up" ? TrendingUp : TrendingDown;
          return (
            <div key={factor.label} className="rounded-3xl border border-white/8 bg-white/4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgTone} ${toneColor}`}
                  >
                    <factor.icon size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-white">{factor.label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{factor.detail}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${bgTone} ${toneColor}`}>
                  <TrendIcon size={16} />
                  {factor.value}
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Signal rank #{index + 1}
                </span>
                <span style={{ color: risk.color }} className="text-sm font-medium">
                  {bad ? "Driving fatigue upward" : "Improving fatigue outlook"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricsPage({ state, risk }) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-[34px] p-6">
        <SectionHeader
          eyebrow="Live Metrics"
          title="Behavioral Telemetry"
          description="These are the raw signals coming from the Chrome extension and feeding the fatigue model."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((metric) => {
            const value = state[metric.key];
            const trendUp = metric.key === "tabSwitchCount"
              ? state.riskLevel === "HIGH"
              : metric.key === "typingSpeed" || metric.key === "mouseTravel"
                ? state.riskLevel !== "HIGH"
                : true;

            return (
              <MetricCard
                key={metric.key}
                icon={metric.icon}
                label={metric.label}
                value={value}
                suffix={metric.suffix}
                trendUp={trendUp}
                tone={risk}
                description={metric.description}
                healthy={metric.healthy}
              />
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Session Awareness"
            title="Operator State"
            description="A plain-language summary of the current session."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">Session Duration</p>
              <div className="mt-2 font-display text-4xl font-bold text-white">
                {state.sessionDuration} mins
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Continuous monitoring time from the first telemetry window currently retained by the backend.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm text-slate-400">Quiet Streak</p>
              <div className="mt-2 font-display text-4xl font-bold text-white">
                {state.quietStreak}s
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Consecutive low-activity time derived from recent extension batches.
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Interpretation"
            title="What The Signals Suggest"
            description="Simple guidance to explain the telemetry in human terms."
          />
          <div className="space-y-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Keyboard throughput</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Lower keys per minute can signal slowed cognition, hesitation, or reduced mental stamina.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Mouse travel</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Reduced cursor movement can indicate lower task engagement or sluggish interaction patterns.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Context switching</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Frequent tab switching may indicate loss of focus, uncertainty, or overload.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendsPage({ chartData, risk, state, lastUpdated }) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-[34px] p-6">
        <SectionHeader
          eyebrow="Trend Analysis"
          title="Fatigue Score Over Time"
          description="A rising red trend means strain is accelerating. A falling trend suggests recovery is working."
          action={
            <div className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300">
              Updates every 5s
            </div>
          }
        />
        <TrendChart data={chartData} color={risk.color} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Snapshot"
            title="Current Session State"
            description="A compact operational summary for team leads and judges."
          />
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400">Session Time</p>
              <div className="mt-1 font-display text-3xl font-bold">
                {state.sessionDuration} mins
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400">Risk Level</p>
              <div className="mt-1 font-display text-3xl font-bold" style={{ color: risk.color }}>
                {state.riskLevel}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-slate-400">Last update</p>
              <div className="mt-1 font-display text-3xl font-bold">{lastUpdated}s ago</div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Narrative"
            title="How To Read This Trend"
            description="This helps a presenter explain the graph in a few seconds."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Stable</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Scores hold in a narrow band. The user is performing consistently without major cognitive drift.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Rising risk</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Scores climb over consecutive windows, signaling fatigue escalation before visible failure occurs.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">Recovery</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Scores move downward after intervention, showing that rest is improving performance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecoveryPage({
  state,
  risk,
  breakTakenAt,
  alertAcknowledged,
  setAlertAcknowledged,
  setBreakTakenAt,
  refreshFeed,
}) {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-[34px] p-6">
        <SectionHeader
          eyebrow="Recovery Hub"
          title="Actions, Baseline, And Readiness"
          description="This page turns fatigue prediction into something operational: acknowledge, recover, and compare against recent norms."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => setAlertAcknowledged(true)}
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
          >
            <CheckCircle2 size={22} className="text-emerald-300" />
            <p className="mt-4 font-medium text-white">Acknowledge alert</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {alertAcknowledged
                ? "Alert already acknowledged for this monitoring session."
                : "Mark the warning as seen by the operator or supervisor."}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setBreakTakenAt(new Date().toLocaleTimeString())}
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
          >
            <PauseCircle size={22} className="text-amber-300" />
            <p className="mt-4 font-medium text-white">Start recovery break</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Records a local break timestamp so the intervention panel remains useful during demos.
            </p>
          </button>
          <button
            type="button"
            onClick={refreshFeed}
            className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/8"
          >
            <Sparkles size={22} className="text-sky-300" />
            <p className="mt-4 font-medium text-white">Refresh live data</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Pulls the latest model predictions and telemetry batches from the backend.
            </p>
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-card rounded-[34px] p-6">
          <SectionHeader
            eyebrow="Adaptive Personal Baseline"
            title="Deviation From Recent Behavior"
            description="The system compares the latest telemetry batch to recent behavior instead of relying on a generic average."
          />
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-slate-300">Keyboard Activity</span>
                <span className="font-semibold text-rose-300">
                  {state.baselineTypingDelta >= 0 ? "Up" : "Down"} {Math.abs(state.baselineTypingDelta)}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-300 transition-[width] duration-700"
                  style={{ width: `${clamp(50 + state.baselineTypingDelta, 8, 100)}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-400">
                Current keyboard activity is being compared against the recent moving baseline.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-slate-300">Tab Switching</span>
                <span className="font-semibold text-amber-300">
                  {state.baselineSwitchDelta >= 0 ? "Up" : "Down"} {Math.abs(state.baselineSwitchDelta)}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400 transition-[width] duration-700"
                  style={{ width: `${clamp(45 + state.baselineSwitchDelta, 8, 100)}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-slate-400">
                A spike here usually means focus is fragmenting and the fatigue score may keep climbing.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="glass-card rounded-[34px] p-6">
            <SectionHeader
              eyebrow="Recommended Action"
              title="Recovery Recommendation"
              description="The UI translates the latest prediction into action."
            />
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start gap-3">
                <div
                  className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: risk.soft, color: risk.color }}
                >
                  <HeartPulse size={20} />
                </div>
                <div>
                  <p className="text-lg font-medium text-white">{state.suggestion}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Advice adapts automatically to the current fatigue state.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-[34px] p-6">
            <SectionHeader
              eyebrow="Recovery Status"
              title="Session Intervention Log"
              description="Simple local actions to make the live dashboard feel operational during demos."
            />
            <div className="space-y-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Alert acknowledged</p>
                <p className="mt-1 font-medium text-white">
                  {alertAcknowledged ? "Yes" : "No"}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Break started</p>
                <p className="mt-1 font-medium text-white">
                  {breakTakenAt || "Not started yet"}
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-400">Current mode</p>
                <p className="mt-1 font-medium text-white">{state.status}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [mode, setMode] = useState("Developer");
  const [now, setNow] = useState(Date.now());
  const [alertAcknowledged, setAlertAcknowledged] = useState(false);
  const [breakTakenAt, setBreakTakenAt] = useState("");
  const [feed, setFeed] = useState({
    logs: [],
    endpoint: null,
    error: null,
    connected: false,
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFeed = async () => {
      try {
        const result = await fetchTelemetryFeed();

        if (cancelled) {
          return;
        }

        setFeed({
          logs: result.logs,
          endpoint: result.endpoint,
          error: null,
          connected: true,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setFeed((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          connected: false,
        }));
      }
    };

    loadFeed();
    const interval = window.setInterval(loadFeed, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const refreshFeed = async () => {
    try {
      const result = await fetchTelemetryFeed();
      setFeed({
        logs: result.logs,
        endpoint: result.endpoint,
        error: null,
        connected: true,
      });
    } catch (error) {
      setFeed((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
        connected: false,
      }));
    }
  };

  const state = useMemo(() => deriveStateFromLogs(feed.logs), [feed.logs]);
  const risk = riskStyles[state.riskLevel];
  const ModeIcon = modeIcons[mode];
  const chartData = useMemo(() => buildChartData(state.trend), [state.trend]);
  const gaugeStyle = {
    background: `conic-gradient(${risk.color} ${state.fatigueScore * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
  };
  const activePageMeta =
    pageDefinitions.find((page) => page.id === activePage) || pageDefinitions[0];
  const lastUpdated = state.latestTimestamp
    ? Math.max(0, Math.floor((now - state.latestTimestamp) / 1000))
    : 0;
  const firstLogTimestamp = parseTimestamp(feed.logs[0]?.timestamp || feed.logs[0]?.telemetry?.timestamp);
  const sessionTimer = firstLogTimestamp
    ? Math.max(0, Math.floor((now - firstLogTimestamp) / 1000))
    : 0;
  const endpointLabel = feed.endpoint ? new URL(feed.endpoint).host : "Offline";

  let pageContent = null;

  if (activePage === "overview") {
    pageContent = (
      <OverviewPage
        state={state}
        risk={risk}
        gaugeStyle={gaugeStyle}
        lastUpdated={lastUpdated}
        metricCards={metricCards}
        setActivePage={setActivePage}
        connection={{
          connected: feed.connected && state.sampleCount > 0,
          error: feed.error,
          source: state.source,
          sampleCount: state.sampleCount,
          endpointLabel,
        }}
      />
    );
  } else if (activePage === "explainability") {
    pageContent = (
      <ExplainabilityPage state={state} risk={risk} setActivePage={setActivePage} />
    );
  } else if (activePage === "metrics") {
    pageContent = <MetricsPage state={state} risk={risk} />;
  } else if (activePage === "trends") {
    pageContent = (
      <TrendsPage
        chartData={chartData}
        risk={risk}
        state={state}
        lastUpdated={lastUpdated}
      />
    );
  } else if (activePage === "recovery") {
    pageContent = (
      <RecoveryPage
        state={state}
        risk={risk}
        breakTakenAt={breakTakenAt}
        alertAcknowledged={alertAcknowledged}
        setAlertAcknowledged={setAlertAcknowledged}
        setBreakTakenAt={setBreakTakenAt}
        refreshFeed={refreshFeed}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <nav className="glass-card float-in flex flex-col gap-4 rounded-[28px] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">
              Human Fatigue & Error Predictor
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              NeuroShield
            </h1>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Session Timer
              </p>
              <div className="mt-1 flex items-center gap-2 font-display text-xl font-semibold">
                <Clock3 size={18} className="text-sky-300" />
                {formatClock(sessionTimer)}
              </div>
            </div>
            <label className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <span className="mb-1 block text-xs uppercase tracking-[0.25em] text-slate-400">
                Mode
              </span>
              <div className="flex items-center gap-2">
                <ModeIcon size={17} className="text-sky-300" />
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className="bg-transparent text-white outline-none"
                >
                  {Object.keys(modeIcons).map((item) => (
                    <option key={item} value={item} className="bg-slate-900">
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
        </nav>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="glass-card float-in rounded-[34px] p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              Feature Pages
            </p>
            <div className="mt-4 space-y-3">
              {pageDefinitions.map((page) => {
                const Icon = page.icon;
                const active = activePage === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setActivePage(page.id)}
                    className={`flex w-full items-center gap-3 rounded-3xl border px-4 py-4 text-left transition ${
                      active
                        ? "border-sky-300/35 bg-sky-400/12"
                        : "border-white/8 bg-white/4 hover:border-white/15 hover:bg-white/7"
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                        active
                          ? "bg-sky-400/20 text-sky-300"
                          : "bg-white/6 text-slate-300"
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-white">{page.label}</p>
                      <p className="text-sm text-slate-400">{page.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-3xl border border-white/8 bg-white/4 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Current Page
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-white">
                {activePageMeta.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {activePageMeta.description}
              </p>
            </div>
          </aside>

          <main className="min-w-0">{pageContent}</main>
        </div>

        <footer className="glass-card float-in rounded-[28px] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-display text-xl font-semibold text-white">
                NeuroShield Live Dashboard
              </p>
              <p className="text-sm text-slate-400">
                Connected to the Chrome extension telemetry stream and the trained fatigue prediction backend.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Mode: {mode}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Source: {String(state.source).toUpperCase()}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Live updates: every 5s
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
