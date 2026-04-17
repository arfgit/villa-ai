import clsx from "clsx";
import type { Agent, Relationship, RelationshipMetric } from "@/types";
import Tooltip from "@/components/ui/Tooltip";
import { baseCompatibility } from "@/lib/castGenerator";

interface Props {
  cast: Agent[];
  relationships: Relationship[];
  metric: RelationshipMetric;
  onMetricChange: (m: RelationshipMetric) => void;
  eliminatedIds?: string[];
}

const METRIC_LABELS: Record<RelationshipMetric, string> = {
  trust: "TRUST",
  attraction: "ATTRACTION",
  jealousy: "JEALOUSY",
  compatibility: "COMPAT",
};

const METRIC_COLORS: Record<RelationshipMetric, string> = {
  trust: "text-villa-trust",
  attraction: "text-villa-pink",
  jealousy: "text-villa-jealous",
  compatibility: "text-villa-sun",
};

const METRIC_TIPS: Record<RelationshipMetric, string> = {
  trust:
    "How much one islander trusts the other (0-100). Goes up when they confide or back each other up. Drops on betrayal or lies.",
  attraction:
    "Romantic interest one feels toward the other (0-100). Increases through flirting and shared moments. Drops when ignored or rejected.",
  jealousy:
    "How threatened one feels by the other (0-100). Spikes when their crush flirts with someone else. Cools down with reassurance.",
  compatibility:
    "Long-term fit between two islanders (0-100). Changes slowly. Based on archetype pairing and shared experiences. Low compatibility + high attraction = drama waiting to happen.",
};

// Band labels for a metric value. Mirrors the bgIntensity thresholds below so
// users see consistent language between the cell shade and the tooltip.
function bandLabel(value: number, metric: RelationshipMetric): string {
  if (metric === "jealousy") {
    if (value >= 70) return "EXPLOSIVE";
    if (value >= 50) return "simmering";
    if (value >= 25) return "watchful";
    return "unbothered";
  }
  if (value >= 75) return "very strong";
  if (value >= 50) return "solid";
  if (value >= 25) return "thin";
  return "barely there";
}

// Build the tooltip copy for a specific cell — names the pair, puts the
// metric in context, calls out the archetype compatibility baseline, and
// surfaces the other three metric values so a hover answers "why this
// number" without forcing the user to toggle between tabs.
function explainCell(
  from: Agent,
  to: Agent,
  rel: Relationship | undefined,
  reverse: Relationship | undefined,
  metric: RelationshipMetric,
): string {
  if (!rel)
    return `No relationship data yet between ${from.name} and ${to.name}.`;

  const value = rel[metric];
  const band = bandLabel(value, metric);
  const reverseValue = reverse ? reverse[metric] : null;
  const asymmetryNote =
    reverseValue !== null && Math.abs(reverseValue - value) >= 15
      ? ` ${to.name}'s ${metric} toward ${from.name} is ${reverseValue} — noticeably ${reverseValue > value ? "higher" : "lower"}, so the feeling isn't mutual.`
      : "";

  const archetypeBase = baseCompatibility(from.archetype, to.archetype);
  const archetypeNote = `Their archetypes (${from.archetype} × ${to.archetype}) give a baseline compatibility of ${archetypeBase}.`;

  const otherMetrics = `Other metrics ${from.name}→${to.name}: trust ${rel.trust}, attraction ${rel.attraction}, jealousy ${rel.jealousy}, compat ${rel.compatibility}.`;

  const metricSpecific = (() => {
    switch (metric) {
      case "trust":
        return `Trust is ${band} (${value}). It rises when ${from.name} confides in ${to.name} or defends them, and drops on betrayal or lies overheard.`;
      case "attraction":
        return `Attraction is ${band} (${value}). Flirty lines, dates, and physical proximity raise it; being ignored or rejected drops it.`;
      case "jealousy":
        return `Jealousy is ${band} (${value}). Spikes when ${from.name} sees ${to.name} with someone else they care about; cools down with reassurance.`;
      case "compatibility":
        return `Compatibility is ${band} (${value}). ${archetypeNote} It moves slowly — shared experiences and genuine moments nudge it up; long-running friction pushes it down.`;
    }
  })();

  const compatCallout =
    metric !== "compatibility" &&
    rel.attraction >= 55 &&
    rel.compatibility <= 30
      ? ` ⚠️ High attraction (${rel.attraction}) + low compatibility (${rel.compatibility}) = fireworks now, breakup later.`
      : "";

  return `${from.name} → ${to.name}\n${metricSpecific}${asymmetryNote}${compatCallout}\n\n${otherMetrics}`;
}

export default function RelationshipMatrix({
  cast,
  relationships,
  metric,
  onMetricChange,
  eliminatedIds = [],
}: Props) {
  const activeCast = cast.filter((c) => !eliminatedIds.includes(c.id));
  const displayCast = activeCast;
  function getRel(fromId: string, toId: string): Relationship | undefined {
    return relationships.find((r) => r.fromId === fromId && r.toId === toId);
  }

  function bgIntensity(value: number): string {
    if (value >= 75) return "bg-villa-pink/40";
    if (value >= 60) return "bg-villa-pink/25";
    if (value >= 40) return "bg-villa-pink/10";
    if (value >= 20) return "bg-villa-dim/20";
    return "";
  }

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 h-full flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2 flex items-center justify-between">
        <span>░ relationships ░</span>
        <Tooltip
          content="Each cell shows how the row islander feels about the column islander on the selected metric. Hover a cell for the full breakdown."
          side="bottom"
        >
          <span className="text-villa-dim hover:text-villa-pink cursor-help text-[9px]">
            [?]
          </span>
        </Tooltip>
      </div>

      <div className="flex gap-1 mb-3">
        {(Object.keys(METRIC_LABELS) as RelationshipMetric[]).map((m) => (
          <Tooltip key={m} content={METRIC_TIPS[m]} side="bottom">
            <button
              onClick={() => onMetricChange(m)}
              className={clsx(
                "w-full px-1 py-1 text-[9px] uppercase border cursor-pointer",
                metric === m
                  ? `border-villa-pink ${METRIC_COLORS[m]}`
                  : "border-villa-dim/40 text-villa-dim hover:border-villa-dim",
              )}
            >
              {METRIC_LABELS[m]}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="overflow-auto scrollbar-thin flex-1">
        {displayCast.length < 2 ? (
          <div className="text-villa-dim text-xs italic text-center py-6">
            not enough islanders left to compare
          </div>
        ) : (
          <table className="text-[9px] w-full">
            <thead>
              <tr>
                <th className="p-1"></th>
                {displayCast.map((c) => (
                  <th
                    key={c.id}
                    className={clsx(
                      "p-1 text-center font-normal",
                      c.colorClass,
                    )}
                  >
                    {c.name.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayCast.map((from) => (
                <tr key={from.id}>
                  <td className={clsx("p-1 text-left", from.colorClass)}>
                    {from.name.slice(0, 3)}
                  </td>
                  {displayCast.map((to) => {
                    if (from.id === to.id) {
                      return (
                        <td
                          key={to.id}
                          className="p-1 text-center text-villa-dim"
                        >
                          ·
                        </td>
                      );
                    }
                    const rel = getRel(from.id, to.id);
                    const reverse = getRel(to.id, from.id);
                    const value = rel?.[metric] ?? 0;
                    const explanation = explainCell(
                      from,
                      to,
                      rel,
                      reverse,
                      metric,
                    );
                    return (
                      <Tooltip key={to.id} content={explanation} side="top">
                        <td
                          className={clsx(
                            "p-1 text-center text-villa-ink/80 tabular-nums cursor-help",
                            bgIntensity(value),
                          )}
                        >
                          {value}
                        </td>
                      </Tooltip>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-2 text-[8px] text-villa-dim text-center">
        rows = from, columns = to · hover a cell for why
      </div>
    </div>
  );
}
