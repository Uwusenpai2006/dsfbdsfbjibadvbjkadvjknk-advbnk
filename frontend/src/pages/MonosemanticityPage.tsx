import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Sparkles,
  Plus,
  X,
  Loader2,
  Layers,
  Zap,
  Eye,
  BarChart3,
  GitCompare,
  Network,
<<<<<<< Updated upstream
  Search,
  Star,
  ArrowRight,
=======
  Star,
  Search,
  Info,
>>>>>>> Stashed changes
} from "lucide-react";
import * as d3 from "d3";
import { analysis } from "../utils/api";

/* ================================================================== */
/*  Types (matched to backend + precomputed JSON)                      */
/* ================================================================== */
interface TopNeuron {
  idx: number;
  val: number;
}
interface HeadData {
  head: number;
  x_ds: number[];
  x_active: number;
  top_neurons: TopNeuron[];
}
interface LayerData {
  layer: number;
  heads: HeadData[];
}
interface WordFingerprint {
  word: string;
  layers: LayerData[];
}
interface SharedNeuron {
  layer: number;
  head: number;
  neuron: number;
  mean_activation: number;
  active_in: number;
  per_word: number[];
}
<<<<<<< Updated upstream
=======
interface MonosemanticNeuron {
  layer: number;
  head: number;
  neuron: number;
  selectivity: number;
  mean_in: number;
  mean_out: number;
  in_active_count: number;
  per_word: number[];
}
>>>>>>> Stashed changes
interface FingerprintResult {
  concept: string;
  words: WordFingerprint[];
  similarity: Record<string, number[][]>;
  shared_neurons: SharedNeuron[];
<<<<<<< Updated upstream
=======
  monosemantic_neurons?: MonosemanticNeuron[];
>>>>>>> Stashed changes
  model_info: { n_layers: number; n_heads: number; n_neurons: number };
}
interface CrossConceptEntry {
  primary: string;
  secondary: string;
  distinctness_per_layer: number[];
  secondary_result: FingerprintResult;
}
interface PrecomputedData {
  model_info: { n_layers: number; n_heads: number; n_neurons: number };
  best_layer: number;
  concepts: Record<string, FingerprintResult>;
  cross_concept: CrossConceptEntry[];
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */
const PRESETS: {
  id: string;
  name: string;
  icon: string;
  color: string;
  words: string[];
}[] = [
  {
    id: "currencies",
    name: "Currencies",
    icon: "💰",
    color: "from-yellow-500 to-orange-500",
    words: ["dollar", "euro", "franc", "yen"],
  },
  {
    id: "countries",
    name: "Countries",
    icon: "🌍",
    color: "from-blue-500 to-cyan-500",
    words: ["france", "germany", "spain", "italy"],
  },
  {
    id: "languages",
    name: "Languages",
    icon: "🗣️",
    color: "from-purple-500 to-pink-500",
    words: ["anglais", "français", "espagnol", "allemand"],
  },
  {
    id: "politics",
    name: "Politics",
    icon: "⚖️",
    color: "from-green-500 to-emerald-500",
    words: ["parlement", "commission", "conseil", "vote"],
  },
];

const WORD_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const CONCEPT_COLORS: Record<string, string> = {
  currencies: "#f59e0b",
  countries: "#3b82f6",
  languages: "#a855f7",
  politics: "#10b981",
};

<<<<<<< Updated upstream
/* ================================================================== */
/*  Color helpers                                                      */
/* ================================================================== */
function intensityColor(v: number, maxV: number): string {
  if (maxV === 0) return "transparent";
  const t = Math.min(v / maxV, 1);
  if (t < 0.08) return "transparent";
  const s = Math.sqrt(t);
  const a = 0.25 + s * 0.75;
  return `rgba(139,92,246,${a.toFixed(2)})`;
}

/** Multi-stop scientific colorscale: black → indigo → violet → cyan → white */
function sciColor(t: number): string {
  if (t < 0.01) return "transparent";
  if (t < 0.25) {
    const s = t / 0.25;
    return `rgba(${Math.round(30 + s * 50)},${Math.round(10 + s * 20)},${Math.round(60 + s * 120)},${(0.4 + s * 0.3).toFixed(2)})`;
  }
  if (t < 0.55) {
    const s = (t - 0.25) / 0.3;
    return `rgba(${Math.round(80 + s * 59)},${Math.round(30 + s * 62)},${Math.round(180 + s * 66)},${(0.7 + s * 0.2).toFixed(2)})`;
  }
  if (t < 0.8) {
    const s = (t - 0.55) / 0.25;
    return `rgba(${Math.round(139 - s * 100)},${Math.round(92 + s * 128)},${Math.round(246 - s * 10)},${(0.85 + s * 0.1).toFixed(2)})`;
  }
  const s = (t - 0.8) / 0.2;
  return `rgba(${Math.round(39 + s * 200)},${Math.round(220 + s * 35)},${Math.round(236 + s * 19)},${(0.92 + s * 0.08).toFixed(2)})`;
}

function simColor(v: number): string {
  if (v < 0.3) return `rgba(100,100,120,${(0.1 + v).toFixed(2)})`;
  if (v < 0.6) {
    const t = (v - 0.3) / 0.3;
    return `rgba(139,92,246,${(0.2 + t * 0.5).toFixed(2)})`;
  }
  const t = (v - 0.6) / 0.4;
  const r = Math.round(16 + t * 0);
  const g = Math.round(130 + t * 55);
  const b = Math.round(180 - t * 51);
  return `rgba(${r},${g},${b},${(0.6 + t * 0.4).toFixed(2)})`;
}

/* ================================================================== */
/*  View tabs (reordered: Similarity → Cross-Concept → Intersection → Graph) */
=======
const presetOf = (id: string) => PRESETS.find((p) => p.id === id);

/* ================================================================== */
/*  Color helpers                                                      */
/* ================================================================== */

/** Similarity cell color: deep navy → indigo → teal → emerald → bright lime
 *  Takes `t` in 0..1 (pre-normalized by caller for contrast). */
function simColor(t: number): string {
  if (t < 0.01) return "rgba(15,20,40,0.6)";
  if (t < 0.25) {
    const u = t / 0.25;
    return `rgba(${Math.round(25 + u * 25)},${Math.round(20 + u * 35)},${Math.round(70 + u * 90)},${(0.5 + u * 0.2).toFixed(2)})`;
  }
  if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    return `rgba(${Math.round(50 - u * 20)},${Math.round(55 + u * 80)},${Math.round(160 + u * 40)},${(0.7 + u * 0.1).toFixed(2)})`;
  }
  if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    return `rgba(${Math.round(30 + u * 20)},${Math.round(135 + u * 60)},${Math.round(200 - u * 70)},${(0.8 + u * 0.1).toFixed(2)})`;
  }
  const u = (t - 0.75) / 0.25;
  return `rgba(${Math.round(50 + u * 120)},${Math.round(195 + u * 50)},${Math.round(130 - u * 40)},${(0.9 + u * 0.1).toFixed(2)})`;
}

function simTextColor(v: number): string {
  return v > 0.55 ? "rgba(255,255,255,0.95)" : "rgba(180,180,200,0.5)";
}

/** Multi-stop scientific colorscale: black → purple → blue → teal → green → yellow */
function sciColor(t: number): string {
  if (t < 0.2) {
    const u = t / 0.2;
    return `rgba(${Math.round(40 + u * 50)}, ${Math.round(10 + u * 20)}, ${Math.round(80 + u * 80)}, ${(0.4 + u * 0.2).toFixed(2)})`;
  }
  if (t < 0.4) {
    const u = (t - 0.2) / 0.2;
    return `rgba(${Math.round(90 - u * 40)}, ${Math.round(30 + u * 60)}, ${Math.round(160 + u * 40)}, ${(0.6 + u * 0.1).toFixed(2)})`;
  }
  if (t < 0.6) {
    const u = (t - 0.4) / 0.2;
    return `rgba(${Math.round(50 - u * 20)}, ${Math.round(90 + u * 80)}, ${Math.round(200 - u * 50)}, ${(0.7 + u * 0.1).toFixed(2)})`;
  }
  if (t < 0.8) {
    const u = (t - 0.6) / 0.2;
    return `rgba(${Math.round(30 + u * 80)}, ${Math.round(170 + u * 50)}, ${Math.round(150 - u * 80)}, ${(0.8 + u * 0.1).toFixed(2)})`;
  }
  const u = (t - 0.8) / 0.2;
  return `rgba(${Math.round(110 + u * 145)}, ${Math.round(220 + u * 35)}, ${Math.round(70 + u * 30)}, ${(0.9 + u * 0.1).toFixed(2)})`;
}

/* ================================================================== */
/*  View tabs                                                          */
>>>>>>> Stashed changes
/* ================================================================== */
type ViewTab = "similarity" | "crossConcept" | "intersection" | "neuronGraph";

const VIEW_TABS: {
  id: ViewTab;
  label: string;
  icon: React.ReactNode;
  blurb: string;
<<<<<<< Updated upstream
}[] = [
  {
    id: "similarity",
    label: "Similarity",
    icon: <BarChart3 size={14} />,
    blurb: "Same concept → same neurons",
=======
  narrative: string;
}[] = [
  {
    id: "similarity",
    label: "Similarity Matrix",
    icon: <BarChart3 size={14} />,
    blurb: "Same concept → same neurons",
    narrative:
      "Words belonging to the same concept activate overlapping neuron populations. The cosine similarity between their x_sparse vectors proves it.",
>>>>>>> Stashed changes
  },
  {
    id: "crossConcept",
    label: "Cross-Concept",
    icon: <GitCompare size={14} />,
    blurb: "Different concepts → different neurons",
<<<<<<< Updated upstream
  },
  {
    id: "intersection",
    label: "Intersection",
    icon: <Eye size={14} />,
    blurb: "Which neurons are shared?",
=======
    narrative:
      "This is the negative control. Words from different categories activate completely different neurons — near-zero cross-concept similarity.",
  },
  {
    id: "intersection",
    label: "Shared Neurons",
    icon: <Eye size={14} />,
    blurb: "Which exact neurons overlap?",
    narrative:
      "Pick a reference word. See exactly which neurons it shares with other same-concept words (green) vs. neurons unique to each word (dim).",
>>>>>>> Stashed changes
  },
  {
    id: "neuronGraph",
    label: "Neuron Graph",
    icon: <Network size={14} />,
<<<<<<< Updated upstream
    blurb: "Explore the connectivity",
=======
    blurb: "Visualize the connectivity",
    narrative:
      'A force-directed graph where word nodes connect to their top-K active neurons. Shared neurons glow green — you can literally say "neuron #4521 is the currency neuron."',
>>>>>>> Stashed changes
  },
];

/* ================================================================== */
/*  LAYER SELECTOR — with narrative marker for best layer              */
/* ================================================================== */
function LayerSelector({
  nLayers,
  selected,
  onChange,
  bestLayer,
}: {
  nLayers: number;
  selected: number;
  onChange: (l: number) => void;
  bestLayer: number;
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-900/60 rounded-xl p-1 border border-gray-800/50">
      <Layers size={14} className="text-gray-500 ml-2 mr-1" />
      {Array.from({ length: nLayers }, (_, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`relative px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
            selected === i
              ? "bg-bdh-accent text-white shadow-lg shadow-bdh-accent/30"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
          }`}
        >
          L{i}
          {i === bestLayer && (
            <Star
              size={8}
              className="absolute -top-1 -right-1 text-yellow-400 fill-yellow-400"
            />
          )}
        </button>
      ))}
      <span className="text-[9px] text-gray-600 ml-2 hidden sm:inline">
        <Star
          size={7}
          className="inline text-yellow-400 fill-yellow-400 mr-0.5"
        />
        = peak monosemanticity
      </span>
    </div>
  );
}

/* ================================================================== */
<<<<<<< Updated upstream
/*  HEATMAP ROW — scientific gradient strip                            */
/* ================================================================== */
function HeatmapRow({
  bins,
  maxVal,
  label,
  delay = 0,
  highlightBins,
  accentColor,
}: {
  bins: number[];
  maxVal: number;
  label: string;
  delay?: number;
  highlightBins?: Set<number>;
  accentColor?: string;
}) {
  // Downsample to 32 bins for a cleaner look
  const ds = useMemo(() => {
    const out: number[] = [];
    const stride = Math.max(1, Math.floor(bins.length / 32));
    for (let b = 0; b < 32; b++) {
      const start = b * stride;
      const end = Math.min(start + stride, bins.length);
      let mx = 0;
      for (let k = start; k < end; k++) {
        if (bins[k] > mx) mx = bins[k];
      }
      out.push(mx);
    }
    return out;
  }, [bins]);

  // Downsample highlightBins
  const dsHighlight = useMemo(() => {
    if (!highlightBins) return null;
    const stride = Math.max(1, Math.floor(bins.length / 32));
    const s = new Set<number>();
    highlightBins.forEach((hi) => {
      s.add(Math.floor(hi / stride));
    });
    return s;
  }, [highlightBins, bins.length]);

  return (
    <motion.div
      className="flex items-center gap-2"
=======
/*  NEURON STRIP — renders actual neuron positions                     */
/* ================================================================== */
function NeuronStrip({
  neurons,
  label,
  delay = 0,
  highlightNeurons,
  color,
}: {
  neurons: TopNeuron[];
  totalNeurons?: number;
  label: string;
  delay?: number;
  highlightNeurons?: Set<number>;
  color?: string;
}) {
  /* Sort neurons by activation (descending) — strongest on the left */
  const sorted = useMemo(
    () => [...neurons].sort((a, b) => b.val - a.val),
    [neurons],
  );
  const maxVal = useMemo(
    () => Math.max(1e-6, ...sorted.map((n) => n.val)),
    [sorted],
  );
  const sharedCount =
    highlightNeurons !== undefined
      ? neurons.filter((n) => highlightNeurons.has(n.idx)).length
      : null;

  const topN = Math.min(5, sorted.length);

  return (
    <motion.div
>>>>>>> Stashed changes
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
<<<<<<< Updated upstream
      <span className="text-[10px] font-mono text-gray-500 w-7 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 flex gap-[2px] h-5 items-end">
        {ds.map((v, i) => {
          const t = maxVal > 0 ? Math.min(v / maxVal, 1) : 0;
          const isActive = t > 0.05;
          const isHL = dsHighlight ? dsHighlight.has(i) : false;
          // Proportional height with sqrt scaling, min 20% for active
          const pct = isActive ? Math.max(Math.sqrt(t) * 100, 20) : 0;

          let bg: string;
          if (dsHighlight) {
            bg =
              isHL && isActive
                ? `rgba(16,185,129,${(0.55 + t * 0.45).toFixed(2)})`
                : isActive
                  ? `rgba(100,116,139,${(0.12 + t * 0.18).toFixed(2)})`
                  : "transparent";
          } else {
            bg = isActive ? sciColor(t) : "transparent";
          }

          return (
            <motion.div
              key={i}
              className="flex-1 rounded-sm"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: delay + i * 0.008, duration: 0.25 }}
              style={{
                height: `${pct}%`,
                backgroundColor: bg,
                transformOrigin: "bottom",
                boxShadow:
                  isActive && t > 0.4
                    ? dsHighlight && isHL
                      ? "0 0 6px rgba(16,185,129,0.4)"
                      : `0 0 6px ${accentColor ?? "rgba(139,92,246,0.35)"}`
                    : undefined,
              }}
            />
          );
        })}
=======
      {/* Ranked bar chart row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-gray-500 w-7 shrink-0 text-right">
          {label}
        </span>
        <div
          className="flex-1 grid items-end h-9 rounded-md overflow-hidden border border-gray-800/30 px-0.5"
          style={{
            gridTemplateColumns: `repeat(${sorted.length}, 1fr)`,
            gap: "1px",
            background:
              "linear-gradient(to right,rgba(15,23,42,0.3),rgba(15,23,42,0.5))",
          }}
        >
          {sorted.map((n, i) => {
            const t = n.val / maxVal;
            const isHL = highlightNeurons?.has(n.idx);
            const hPct = Math.max(5, t * 100);

            let bg: string;
            let shadow: string | undefined;

            if (highlightNeurons !== undefined) {
              bg = isHL
                ? `rgba(16,185,129,${(0.5 + t * 0.5).toFixed(2)})`
                : `rgba(100,116,139,${(0.03 + t * 0.04).toFixed(2)})`;
              shadow =
                isHL && t > 0.25 ? "0 0 5px rgba(16,185,129,0.35)" : undefined;
            } else {
              bg = color ?? sciColor(t);
              shadow =
                t > 0.4
                  ? `0 0 4px ${color ?? "rgba(139,92,246,0.3)"}`
                  : undefined;
            }

            return (
              <motion.div
                key={n.idx}
                className="rounded-t-[2px]"
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: delay + i * 0.01, duration: 0.18 }}
                style={{
                  height: `${hPct}%`,
                  backgroundColor: bg,
                  transformOrigin: "bottom",
                  boxShadow: shadow,
                }}
                title={`#${n.idx} — ${n.val.toFixed(4)}`}
              />
            );
          })}
        </div>
        {sharedCount !== null && (
          <span className="text-[9px] font-mono text-emerald-500/70 w-10 shrink-0 text-left">
            {sharedCount}/{neurons.length}
          </span>
        )}
      </div>
      {/* Top neuron indices — lets users spot shared neurons across words */}
      <div className="flex items-center gap-2 mt-px">
        <span className="w-7 shrink-0" />
        <div className="flex gap-1.5">
          {sorted.slice(0, topN).map((n, i) => {
            const isHL = highlightNeurons?.has(n.idx);
            return (
              <span
                key={n.idx}
                className="text-[7px] font-mono leading-none"
                style={{
                  color:
                    highlightNeurons !== undefined
                      ? isHL
                        ? "#6ee7b7"
                        : "#27272a"
                      : i === 0
                        ? (color ?? "#a78bfa")
                        : "#52525b",
                  fontWeight: isHL || i < 2 ? 600 : 400,
                }}
              >
                #{n.idx}
              </span>
            );
          })}
        </div>
>>>>>>> Stashed changes
      </div>
    </motion.div>
  );
}

/* ================================================================== */
<<<<<<< Updated upstream
/*  1b. NEURON STRIP — renders actual neuron positions (not bins)       */
/* ================================================================== */
function NeuronStrip({
  neurons,
  totalNeurons = 8192,
  label,
  delay = 0,
  highlightNeurons,
  color,
}: {
  neurons: TopNeuron[];
  totalNeurons?: number;
  label: string;
  delay?: number;
  highlightNeurons?: Set<number>;
  color?: string;
}) {
  const maxVal = useMemo(
    () => Math.max(1e-6, ...neurons.map((n) => n.val)),
    [neurons],
  );
  const sharedCount =
    highlightNeurons !== undefined
      ? neurons.filter((n) => highlightNeurons.has(n.idx)).length
      : null;

  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <span className="text-[10px] font-mono text-gray-500 w-7 shrink-0 text-right">
        {label}
      </span>
      <div
        className="flex-1 relative h-6 rounded overflow-hidden border border-gray-800/30"
        style={{
          background:
            "linear-gradient(to right, rgba(15,23,42,0.35), rgba(15,23,42,0.55))",
        }}
      >
        {/* Faint scale markers at 25/50/75% */}
        {[0.25, 0.5, 0.75].map((f) => (
          <div
            key={f}
            className="absolute top-0 bottom-0 w-px bg-gray-800/25"
            style={{ left: `${f * 100}%` }}
          />
        ))}
        {/* Neuron ticks at actual index positions */}
        {neurons.map((n, i) => {
          const xPct = (n.idx / totalNeurons) * 100;
          const t = n.val / maxVal;
          const isHL = highlightNeurons?.has(n.idx);
          const hPct = Math.max(35, Math.sqrt(t) * 100);

          let bg: string;
          let shadow: string | undefined;

          if (highlightNeurons !== undefined) {
            // Intersection mode: shared neurons glow green, others dim
            bg = isHL
              ? `rgba(16,185,129,${(0.65 + t * 0.35).toFixed(2)})`
              : `rgba(100,116,139,${(0.12 + t * 0.12).toFixed(2)})`;
            shadow =
              isHL && t > 0.3 ? "0 0 8px rgba(16,185,129,0.45)" : undefined;
          } else {
            bg = color ?? sciColor(t);
            shadow =
              t > 0.5
                ? `0 0 6px ${color ?? "rgba(139,92,246,0.4)"}`
                : undefined;
          }

          return (
            <motion.div
              key={n.idx}
              className="absolute bottom-0 rounded-t-sm"
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{ delay: delay + i * 0.01, duration: 0.2 }}
              style={{
                left: `calc(${xPct}% - 2px)`,
                width: 4,
                height: `${hPct}%`,
                backgroundColor: bg,
                transformOrigin: "bottom",
                boxShadow: shadow,
              }}
              title={`Neuron #${n.idx} (${n.val.toFixed(4)})`}
            />
          );
        })}
      </div>
      {sharedCount !== null && (
        <span className="text-[9px] font-mono text-emerald-500/70 w-8 shrink-0 text-left">
          {sharedCount}/{neurons.length}
        </span>
      )}
    </motion.div>
  );
}

/* ================================================================== */
/*  1. SIMILARITY VIEW — hero view, all concepts at once               */
/* ================================================================== */
function SimilarityView({
  concepts,
  activeConcept,
  setActiveConcept,
  selectedLayer,
}: {
  concepts: Record<string, FingerprintResult>;
  activeConcept: string;
  setActiveConcept: (c: string) => void;
  selectedLayer: number;
}) {
  const result = concepts[activeConcept];
  if (!result) return null;

  const simKey = String(selectedLayer);
  const matrix = result.similarity[simKey];
  if (!matrix) return null;

  const words = result.words.map((w) => w.word);
  const n = words.length;
  const offDiag: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) if (i !== j) offDiag.push(matrix[i][j]);
  const avgSim =
    offDiag.length > 0
      ? offDiag.reduce((a, b) => a + b, 0) / offDiag.length
      : 0;

  // Quick overview badges
  const allAvgs = useMemo(() => {
    const out: Record<string, number> = {};
    Object.entries(concepts).forEach(([cid, cr]) => {
      const m = cr.similarity[simKey];
      if (!m) return;
      const n2 = m.length;
      let sum = 0,
        cnt = 0;
      for (let i = 0; i < n2; i++)
        for (let j = 0; j < n2; j++)
          if (i !== j) {
            sum += m[i][j];
            cnt++;
          }
      out[cid] = cnt > 0 ? sum / cnt : 0;
    });
    return out;
  }, [concepts, simKey]);

  return (
    <div className="space-y-4">
      {/* Concept selector badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(concepts).map(([cid]) => {
          const preset = PRESETS.find((p) => p.id === cid);
          const avg = allAvgs[cid] ?? 0;
          const isActive = cid === activeConcept;
          return (
            <motion.button
              key={cid}
              onClick={() => setActiveConcept(cid)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                isActive
                  ? "border-bdh-accent bg-bdh-accent/15 text-bdh-accent shadow-lg shadow-bdh-accent/10"
                  : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="mr-1.5">{preset?.icon}</span>
              {preset?.name ?? cid}
              <span
                className={`ml-2 text-xs font-mono ${avg > 0.6 ? "text-emerald-400" : avg > 0.4 ? "text-amber-400" : "text-gray-500"}`}
              >
                {avg.toFixed(2)}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Similarity matrix */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={activeConcept + simKey}
      >
=======
/*  1. SIMILARITY VIEW — hero view, all concepts at once               */
/* ================================================================== */
function SimilarityView({
  concepts,
  activeConcept,
  setActiveConcept,
  selectedLayer,
}: {
  concepts: Record<string, FingerprintResult>;
  activeConcept: string;
  setActiveConcept: (c: string) => void;
  selectedLayer: number;
}) {
  const result = concepts[activeConcept];
  if (!result) return null;

  const simKey = String(selectedLayer);
  const matrix = result.similarity[simKey];
  if (!matrix) return null;

  const words = result.words.map((w) => w.word);
  const n = words.length;
  const offDiag: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) if (i !== j) offDiag.push(matrix[i][j]);
  const avgSim =
    offDiag.length > 0
      ? offDiag.reduce((a, b) => a + b, 0) / offDiag.length
      : 0;

  // Compute min/max for rescaling — spreads the color range across actual data
  const allVals = matrix.flat();
  const matMin = Math.min(...allVals);
  const matMax = Math.max(...allVals);
  const matRange = matMax - matMin || 1;
  const rescale = (v: number) =>
    Math.max(0, Math.min(1, (v - matMin) / matRange));

  // Quick overview badges
  const allAvgs = useMemo(() => {
    const out: Record<string, number> = {};
    Object.entries(concepts).forEach(([cid, cr]) => {
      const m = cr.similarity[simKey];
      if (!m) return;
      const n2 = m.length;
      let sum = 0,
        cnt = 0;
      for (let i = 0; i < n2; i++)
        for (let j = 0; j < n2; j++)
          if (i !== j) {
            sum += m[i][j];
            cnt++;
          }
      out[cid] = cnt > 0 ? sum / cnt : 0;
    });
    return out;
  }, [concepts, simKey]);

  return (
    <div className="space-y-4">
      {/* Concept selector badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(concepts).map(([cid]) => {
          const preset = PRESETS.find((p) => p.id === cid);
          const avg = allAvgs[cid] ?? 0;
          const isActive = cid === activeConcept;
          return (
            <motion.button
              key={cid}
              onClick={() => setActiveConcept(cid)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                isActive
                  ? "border-bdh-accent bg-bdh-accent/15 text-bdh-accent shadow-lg shadow-bdh-accent/10"
                  : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="mr-1.5">{preset?.icon}</span>
              {preset?.name ?? cid}
              <span
                className={`ml-2 text-xs font-mono ${avg > 0.6 ? "text-emerald-400" : avg > 0.4 ? "text-amber-400" : "text-gray-500"}`}
              >
                {avg.toFixed(2)}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Similarity matrix */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={activeConcept + simKey}
      >
>>>>>>> Stashed changes
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-bdh-accent" />
            <span className="text-sm font-semibold">
              Cosine Similarity — {result.concept}
            </span>
          </div>
          <span
            className={`text-xs font-mono font-bold ${avgSim > 0.6 ? "text-emerald-400" : avgSim > 0.4 ? "text-amber-400" : "text-gray-400"}`}
          >
            avg: {avgSim.toFixed(3)}
          </span>
        </div>

        {/* Matrix grid */}
        <div className="overflow-x-auto">
          <div
            className="grid gap-[3px] mx-auto"
            style={{
              gridTemplateColumns: `48px repeat(${n}, minmax(60px, 1fr))`,
              maxWidth: 48 + n * 80,
            }}
          >
            <div />
            {words.map((w, j) => (
              <div
                key={`h-${j}`}
                className="text-center text-[10px] font-mono font-bold truncate px-1"
                style={{ color: WORD_COLORS[j % WORD_COLORS.length] }}
              >
                {w}
              </div>
            ))}
            {words.map((wi, i) => (
              <React.Fragment key={`r-${i}`}>
                <div
                  className="text-right text-[10px] font-mono font-bold pr-2 flex items-center justify-end"
                  style={{ color: WORD_COLORS[i % WORD_COLORS.length] }}
                >
                  {wi}
                </div>
<<<<<<< Updated upstream
                {matrix[i].map((val: number, j: number) => (
                  <motion.div
                    key={`c-${i}-${j}`}
                    className="rounded-md flex items-center justify-center text-[10px] font-mono font-semibold h-10"
                    style={{
                      backgroundColor: simColor(val),
                      color:
                        val > 0.5
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(200,200,220,0.5)",
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: (i * n + j) * 0.015 }}
                  >
                    {val.toFixed(2)}
                  </motion.div>
                ))}
=======
                {matrix[i].map((val: number, j: number) => {
                  const t = rescale(val);
                  return (
                    <motion.div
                      key={`c-${i}-${j}`}
                      className="rounded-md flex items-center justify-center text-[11px] font-mono font-bold h-12"
                      style={{
                        backgroundColor: simColor(t),
                        color:
                          t > 0.6 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)",
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: (i * n + j) * 0.015 }}
                    >
                      {val.toFixed(2)}
                    </motion.div>
                  );
                })}
>>>>>>> Stashed changes
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4">
<<<<<<< Updated upstream
          <span className="text-[10px] text-gray-500">Low</span>
=======
          <span className="text-[10px] text-gray-500 font-mono">
            {matMin.toFixed(2)}
          </span>
>>>>>>> Stashed changes
          <div className="flex-1 h-3 rounded-full overflow-hidden flex">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-full"
                style={{ backgroundColor: simColor(i / 19) }}
              />
            ))}
          </div>
<<<<<<< Updated upstream
          <span className="text-[10px] text-gray-500">High</span>
=======
          <span className="text-[10px] text-gray-500 font-mono">
            {matMax.toFixed(2)}
          </span>
>>>>>>> Stashed changes
        </div>

        {avgSim > 0.5 && (
          <motion.div
            className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-xs text-emerald-300">
              <Sparkles size={12} className="inline mr-1" />
              Avg similarity <strong>{avgSim.toFixed(3)}</strong> — words in the{" "}
              <strong>{result.concept}</strong> category activate overlapping
              neuron populations. This is <strong>monosemantic encoding</strong>{" "}
              in action.
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  2. CROSS-CONCEPT VIEW — pre-computed negative control              */
/* ================================================================== */
<<<<<<< Updated upstream
=======

/** Extract "signature neurons" — neurons firing in 2+ words of the same concept */
function extractConceptSignature(
  result: FingerprintResult,
  layer: number,
): { head: number; idx: number; count: number; totalVal: number }[] {
  const agg = new Map<
    string,
    { head: number; idx: number; count: number; totalVal: number }
  >();
  result.words.forEach((w) => {
    const l = w.layers.find((la) => la.layer === layer);
    if (!l) return;
    l.heads.forEach((h) => {
      h.top_neurons.forEach((n) => {
        const key = `${h.head}_${n.idx}`;
        const existing = agg.get(key);
        if (existing) {
          existing.count++;
          existing.totalVal += n.val;
        } else {
          agg.set(key, {
            head: h.head,
            idx: n.idx,
            count: 1,
            totalVal: n.val,
          });
        }
      });
    });
  });
  return [...agg.values()]
    .filter((n) => n.count >= 2)
    .sort((a, b) => b.count - a.count || b.totalVal - a.totalVal);
}

>>>>>>> Stashed changes
function CrossConceptView({
  crossPairs,
  concepts,
  selectedLayer,
}: {
  crossPairs: CrossConceptEntry[];
  concepts: Record<string, FingerprintResult>;
  selectedLayer: number;
}) {
  const [activePair, setActivePair] = useState(0);
  const pair = crossPairs[activePair];
  if (!pair) return null;

  const primaryResult = concepts[pair.primary];
  const secondaryResult = pair.secondary_result;
  if (!primaryResult || !secondaryResult) return null;

  const distinctness = pair.distinctness_per_layer;
  const avgDistinctness =
    distinctness.reduce((a, b) => a + b, 0) / distinctness.length;

  const pColor = CONCEPT_COLORS[pair.primary] ?? "#8b5cf6";
  const sColor = CONCEPT_COLORS[pair.secondary] ?? "#06b6d4";

<<<<<<< Updated upstream
=======
  /* Concept signature neurons — shared by 2+ words within each concept */
  const pSignature = useMemo(
    () => extractConceptSignature(primaryResult, selectedLayer),
    [primaryResult, selectedLayer],
  );
  const sSignature = useMemo(
    () => extractConceptSignature(secondaryResult, selectedLayer),
    [secondaryResult, selectedLayer],
  );
  const signatureOverlapCount = useMemo(() => {
    const pSet = new Set(pSignature.map((n) => `${n.head}_${n.idx}`));
    return sSignature.filter((n) => pSet.has(`${n.head}_${n.idx}`)).length;
  }, [pSignature, sSignature]);

>>>>>>> Stashed changes
  return (
    <div className="space-y-4">
      {/* Pair selector */}
      <div className="flex flex-wrap gap-2">
        {crossPairs.map((cp, i) => {
          const pName =
            PRESETS.find((p) => p.id === cp.primary)?.name ?? cp.primary;
          const sName =
            PRESETS.find((p) => p.id === cp.secondary)?.name ?? cp.secondary;
          return (
            <motion.button
              key={i}
              onClick={() => setActivePair(i)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                i === activePair
                  ? "border-bdh-accent bg-bdh-accent/15 text-bdh-accent"
                  : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {pName} <span className="text-gray-600 mx-1">vs</span> {sName}
            </motion.button>
          );
        })}
      </div>

      {/* Distinctness bar chart */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={activePair}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitCompare size={16} className="text-bdh-accent" />
            <span className="text-sm font-semibold">
              Neuron Distinctness per Layer
            </span>
          </div>
          <span
            className={`text-xs font-mono font-bold ${avgDistinctness > 0.7 ? "text-emerald-400" : "text-amber-400"}`}
          >
            avg: {avgDistinctness.toFixed(3)}
          </span>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">
          1 − Jaccard overlap between top-neuron sets. Higher = concepts use
          completely different neurons.
        </p>
        <div className="flex items-end gap-2 h-28">
          {distinctness.map((d, i) => (
            <motion.div
              key={i}
              className="flex-1 flex flex-col items-center gap-1"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              style={{ transformOrigin: "bottom" }}
            >
              <span className="text-[9px] font-mono text-gray-500 mb-0.5">
                {d.toFixed(2)}
              </span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${d * 100}%`,
                  backgroundColor:
                    d > 0.7
                      ? "rgba(16,185,129,0.7)"
                      : d > 0.4
                        ? "rgba(245,158,11,0.7)"
                        : "rgba(239,68,68,0.5)",
                  boxShadow:
                    i === selectedLayer
                      ? "0 0 12px rgba(139,92,246,0.5)"
                      : undefined,
                  outline:
                    i === selectedLayer
                      ? "2px solid rgba(139,92,246,0.6)"
                      : undefined,
                }}
              />
              <span
                className={`text-[9px] font-mono ${i === selectedLayer ? "text-bdh-accent font-bold" : "text-gray-500"}`}
              >
                L{i}
              </span>
            </motion.div>
          ))}
        </div>

        {avgDistinctness > 0.65 && (
          <motion.div
            className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <p className="text-xs text-emerald-300">
              <Sparkles size={12} className="inline mr-1" />
              <strong>{(avgDistinctness * 100).toFixed(0)}%</strong> average
              distinctness — BDH dedicates <em>separate</em> neuron populations
              to each concept. This is the <strong>negative control</strong>{" "}
              that validates monosemanticity.
            </p>
          </motion.div>
        )}
      </motion.div>

<<<<<<< Updated upstream
=======
      {/* ---- Concept Neuron Signatures ---- */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        key={`sig-${activePair}-${selectedLayer}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Zap size={14} className="text-bdh-accent" />
          <span className="text-sm font-semibold">
            Concept Neuron Signatures — Layer {selectedLayer}
          </span>
        </div>
        <p className="text-[10px] text-gray-600 mb-4">
          Neurons firing for 2+ words <em>within</em> the same concept. If
          monosemantic, these signature sets should be <strong>disjoint</strong>
          .
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-4">
          {[
            {
              sig: pSignature,
              color: pColor,
              label: pair.primary,
            },
            {
              sig: sSignature,
              color: sColor,
              label: pair.secondary,
            },
          ].map(({ sig, color, label }) => {
            const preset = presetOf(label);
            const byHead: Record<number, typeof sig> = {};
            sig.forEach((n) => {
              (byHead[n.head] ??= []).push(n);
            });
            return (
              <div key={label}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color }}
                  >
                    {preset?.icon} {preset?.name ?? label}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-auto font-mono">
                    {sig.length} signature neurons
                  </span>
                </div>
                {[0, 1, 2, 3].map((head) => {
                  const neurons = byHead[head] ?? [];
                  return (
                    <div key={head} className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-mono text-gray-600 w-6 shrink-0">
                        H{head}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {neurons.length === 0 ? (
                          <span className="text-[8px] text-gray-700 italic">
                            none
                          </span>
                        ) : (
                          neurons.slice(0, 8).map((n) => (
                            <span
                              key={n.idx}
                              className="text-[8px] font-mono px-1.5 py-0.5 rounded-md"
                              style={{
                                backgroundColor: color + "18",
                                color,
                                border: `1px solid ${color}33`,
                              }}
                              title={`Shared by ${n.count} words, Σ act = ${n.totalVal.toFixed(3)}`}
                            >
                              #{n.idx}
                            </span>
                          ))
                        )}
                        {neurons.length > 8 && (
                          <span
                            className="text-[8px] font-mono"
                            style={{ color }}
                          >
                            +{neurons.length - 8}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Overlap verdict */}
        <motion.div
          className={`p-3 rounded-xl border ${
            signatureOverlapCount === 0
              ? "bg-emerald-950/20 border-emerald-500/20"
              : "bg-amber-950/20 border-amber-500/20"
          }`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-xs">
            {signatureOverlapCount === 0 ? (
              <>
                <Sparkles size={12} className="inline mr-1 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Zero overlap</span>
                <span className="text-gray-400">
                  {" "}
                  — the two concepts use <em>completely different</em> neurons.
                  This proves monosemantic specialization.
                </span>
              </>
            ) : (
              <>
                <Info size={12} className="inline mr-1 text-amber-400" />
                <span className="text-amber-400 font-bold">
                  {signatureOverlapCount} overlapping
                </span>
                <span className="text-gray-400">
                  {" "}
                  signature neurons — some neurons respond to both concepts.
                </span>
              </>
            )}
          </p>
        </motion.div>
      </motion.div>

>>>>>>> Stashed changes
      {/* Side-by-side heatmaps */}
      <div className="grid gap-5 md:grid-cols-2">
        {[
          { result: primaryResult, color: pColor, label: pair.primary },
          { result: secondaryResult, color: sColor, label: pair.secondary },
        ].map(({ result: r, color, label }) => (
          <div key={label} className="space-y-3">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color }}
              >
                {PRESETS.find((p) => p.id === label)?.icon}{" "}
                {PRESETS.find((p) => p.id === label)?.name ?? label}
              </span>
            </div>
            {r.words.map((fp, i) => {
              const layer = fp.layers.find((l) => l.layer === selectedLayer);
              if (!layer) return null;
              const totalActive = layer.heads.reduce(
                (s, h) => s + h.x_active,
                0,
              );
              return (
                <motion.div
                  key={fp.word}
                  className="rounded-xl p-4 bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  initial={{
                    opacity: 0,
                    x: label === pair.primary ? -12 : 12,
                  }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-mono font-bold"
                      style={{ color }}
                    >
                      {fp.word}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {totalActive.toLocaleString()} active
                    </span>
                  </div>
                  <div className="space-y-1">
                    {layer.heads.map((h) => (
                      <NeuronStrip
                        key={h.head}
                        neurons={h.top_neurons}
                        label={`H${h.head}`}
                        color={color}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  3. INTERSECTION VIEW — highlight shared neurons vs reference word  */
/* ================================================================== */
function IntersectionView({
  result,
  selectedLayer,
}: {
  result: FingerprintResult;
  selectedLayer: number;
}) {
  const [refIdx, setRefIdx] = useState(0);
  const words = result.words;
  const refWord = words[refIdx];
  if (!refWord) return null;

  const refLayer = refWord.layers.find((l) => l.layer === selectedLayer);
  if (!refLayer) return null;

  // Collect actual neuron indices from reference word's top_neurons
  const refActiveNeurons: Map<number, Set<number>> = useMemo(() => {
    const m = new Map<number, Set<number>>();
    refLayer.heads.forEach((h) => {
      const s = new Set<number>();
      h.top_neurons.forEach((n) => s.add(n.idx));
      m.set(h.head, s);
    });
    return m;
  }, [refLayer]);

  return (
    <div className="space-y-4">
      {/* Reference selector */}
      <motion.div
        className="glass-card p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            Reference word:
          </span>
          {words.map((w, i) => (
            <button
              key={w.word}
              onClick={() => setRefIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-mono font-semibold transition-all border ${
                i === refIdx
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                  : "bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              {w.word}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">
          <span className="inline-block w-3 h-2 rounded-[1px] bg-emerald-500/60 mr-1 align-middle" />
          Green = shared with <strong>"{refWord.word}"</strong>
          <span className="inline-block w-3 h-2 rounded-[1px] bg-gray-600/30 ml-3 mr-1 align-middle" />
          Dim = unique to this word
        </p>
      </motion.div>

      {/* Reference word */}
      <motion.div
        className="rounded-xl p-5 border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-gray-900/50 backdrop-blur-sm"
        style={{ borderLeftWidth: 4, borderLeftColor: "#10b981" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-3 h-3 rounded-full ring-2 ring-emerald-500/30"
            style={{
              backgroundColor: WORD_COLORS[refIdx % WORD_COLORS.length],
            }}
          />
          <span
            className="font-mono font-bold text-lg"
            style={{ color: WORD_COLORS[refIdx % WORD_COLORS.length] }}
          >
            "{refWord.word}"
          </span>
          <span className="text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-400 font-bold px-2 py-0.5 rounded-full ml-2">
            REFERENCE
          </span>
        </div>
        <div className="space-y-1">
          {refLayer.heads.map((h, hi) => (
            <NeuronStrip
              key={hi}
              neurons={h.top_neurons}
              label={`H${h.head}`}
              delay={hi * 0.02}
              color="rgba(16,185,129,0.8)"
            />
          ))}
        </div>
      </motion.div>

      {/* Comparison words */}
      {words
        .filter((_, i) => i !== refIdx)
        .map((fp, ci) => {
          const layer = fp.layers.find((l) => l.layer === selectedLayer);
          if (!layer) return null;
          const origIdx = words.indexOf(fp);
          const color = WORD_COLORS[origIdx % WORD_COLORS.length];

          let sharedCount = 0,
            totalActive = 0;
          layer.heads.forEach((h) => {
            const refSet = refActiveNeurons.get(h.head);
            h.top_neurons.forEach((n) => {
              totalActive++;
              if (refSet?.has(n.idx)) sharedCount++;
            });
          });
          const overlapPct =
            totalActive > 0
              ? ((sharedCount / totalActive) * 100).toFixed(0)
              : "0";

          return (
            <motion.div
              key={fp.word}
              className="rounded-xl p-4 overflow-hidden bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.08 + 0.1 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="font-mono font-bold text-base"
                    style={{ color }}
                  >
                    "{fp.word}"
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${overlapPct}%` }}
                      transition={{ delay: ci * 0.1 + 0.3, duration: 0.5 }}
                    />
                  </div>
                  <span className="text-xs font-bold text-emerald-400 font-mono w-10 text-right">
                    {overlapPct}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {layer.heads.map((h, hi) => (
                  <NeuronStrip
                    key={hi}
                    neurons={h.top_neurons}
                    label={`H${h.head}`}
                    delay={ci * 0.08 + hi * 0.02 + 0.1}
                    highlightNeurons={refActiveNeurons.get(h.head)}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}

/* ================================================================== */
<<<<<<< Updated upstream
/*  4. NEURON GRAPH — SOTA redesign with radial layout & interactions  */
/* ================================================================== */
=======
/*  4. NEURON GRAPH — Hub-spoke: shared neurons as hubs, words on rim  */
/* ================================================================== */

/* Head-indexed palette — 4 distinct hues so heads are visually grouped */
const HEAD_COLORS = ["#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];

>>>>>>> Stashed changes
interface GraphNode {
  id: string;
  label: string;
  type: "neuron" | "word";
  color: string;
  radius: number;
  x: number;
  y: number;
  val?: number;
  wordCount?: number;
<<<<<<< Updated upstream
=======
  head?: number;
>>>>>>> Stashed changes
}
interface GraphEdge {
  source: string;
  target: string;
  color: string;
  width: number;
  shared: boolean;
}

function NeuronGraphView({
  result,
  selectedLayer,
}: {
  result: FingerprintResult;
  selectedLayer: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
<<<<<<< Updated upstream
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
=======
  const [dims, setDims] = useState({ w: 900, h: 620 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filterHead, setFilterHead] = useState<number | null>(null);
>>>>>>> Stashed changes

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
<<<<<<< Updated upstream
      setDims({ w: width, h: Math.max(500, Math.min(width * 0.65, 700)) });
=======
      setDims({ w: width, h: Math.max(520, Math.min(width * 0.68, 720)) });
>>>>>>> Stashed changes
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

<<<<<<< Updated upstream
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];
=======
  /* ---- data: aggregate neurons, keep ONLY shared (wordCount >= 2) ---- */
  const { nodes, edges, headCounts, totalShared, totalUnique } = useMemo(() => {
>>>>>>> Stashed changes
    const words = result.words;
    const cx = dims.w / 2;
    const cy = dims.h / 2;

<<<<<<< Updated upstream
    // Word nodes in an inner ring
    const innerRadius = Math.min(dims.w, dims.h) * 0.18;
    words.forEach((w, i) => {
      const angle = (2 * Math.PI * i) / words.length - Math.PI / 2;
      const color = WORD_COLORS[i % WORD_COLORS.length];
      nodeMap.set(`w_${w.word}`, {
        id: `w_${w.word}`,
        label: w.word,
        type: "word",
        color,
        radius: 22,
        x: cx + Math.cos(angle) * innerRadius,
        y: cy + Math.sin(angle) * innerRadius,
      });
    });

    // Aggregate neurons
=======
    /* 1. aggregate every neuron across all words for this layer */
>>>>>>> Stashed changes
    const neuronAgg = new Map<
      string,
      {
        head: number;
        idx: number;
        totalVal: number;
        wordCount: number;
<<<<<<< Updated upstream
        words: Set<string>;
=======
        words: Map<string, number>; /* word → activation */
>>>>>>> Stashed changes
      }
    >();
    words.forEach((w) => {
      const layer = w.layers.find((l) => l.layer === selectedLayer);
      if (!layer) return;
      layer.heads.forEach((h) => {
        h.top_neurons.forEach((n) => {
          const key = `n_H${h.head}_N${n.idx}`;
          const existing = neuronAgg.get(key);
          if (existing) {
            existing.totalVal += n.val;
            existing.wordCount++;
<<<<<<< Updated upstream
            existing.words.add(w.word);
=======
            existing.words.set(w.word, n.val);
>>>>>>> Stashed changes
          } else {
            neuronAgg.set(key, {
              head: h.head,
              idx: n.idx,
              totalVal: n.val,
              wordCount: 1,
<<<<<<< Updated upstream
              words: new Set([w.word]),
=======
              words: new Map([[w.word, n.val]]),
>>>>>>> Stashed changes
            });
          }
        });
      });
    });

<<<<<<< Updated upstream
    const sortedNeurons = [...neuronAgg.entries()].sort((a, b) =>
=======
    /* 2. partition into shared / unique */
    let shared = [...neuronAgg.entries()].filter(([, n]) => n.wordCount >= 2);
    const uniqueCount = neuronAgg.size - shared.length;

    /* optional head filter */
    if (filterHead !== null) {
      shared = shared.filter(([, n]) => n.head === filterHead);
    }

    /* sort: most-shared first, then by activation */
    shared.sort((a, b) =>
>>>>>>> Stashed changes
      b[1].wordCount !== a[1].wordCount
        ? b[1].wordCount - a[1].wordCount
        : b[1].totalVal - a[1].totalVal,
    );
<<<<<<< Updated upstream
    const topNeurons = sortedNeurons.slice(0, 30);
    const maxVal = Math.max(1e-6, ...topNeurons.map(([, n]) => n.totalVal));

    // Neuron nodes in outer ring; shared neurons closer in
    const outerRadius = Math.min(dims.w, dims.h) * 0.38;
    const sharedRadius = Math.min(dims.w, dims.h) * 0.28;

    topNeurons.forEach(([key, info], i) => {
      const isShared = info.wordCount >= 2;
      const r = 6 + (info.totalVal / maxVal) * 14;
      const angle = (2 * Math.PI * i) / topNeurons.length - Math.PI / 2;
      const rad = isShared ? sharedRadius : outerRadius;

      nodeMap.set(key, {
        id: key,
        label: `H${info.head}:${info.idx}`,
        type: "neuron",
        color: isShared ? "#10b981" : "#4b5563",
        radius: r,
        x: cx + Math.cos(angle) * rad,
        y: cy + Math.sin(angle) * rad,
        val: info.totalVal,
        wordCount: info.wordCount,
      });

      info.words.forEach((wName) => {
=======

    /* take top-20 shared hubs to keep the graph readable */
    const topShared = shared.slice(0, 20);
    const maxVal = Math.max(1e-6, ...topShared.map(([, n]) => n.totalVal));

    /* head stats */
    const headCountsMap: Record<number, number> = {};
    shared.forEach(([, n]) => {
      headCountsMap[n.head] = (headCountsMap[n.head] || 0) + 1;
    });

    /* 3. layout: words on outer ring, shared neurons on inner ring */
    const outerR = Math.min(dims.w, dims.h) * 0.4;
    const innerR = Math.min(dims.w, dims.h) * 0.18;

    const nodeArr: GraphNode[] = [];
    const edgeList: GraphEdge[] = [];

    /* word nodes — outer ring */
    words.forEach((w, i) => {
      const angle = (2 * Math.PI * i) / words.length - Math.PI / 2;
      const color = WORD_COLORS[i % WORD_COLORS.length];
      nodeArr.push({
        id: `w_${w.word}`,
        label: w.word,
        type: "word",
        color,
        radius: 28,
        x: cx + Math.cos(angle) * outerR,
        y: cy + Math.sin(angle) * outerR,
      });
    });

    /* neuron hub nodes — inner ring, sorted by head for grouping */
    const hubsSortedByHead = [...topShared].sort(
      (a, b) => a[1].head - b[1].head,
    );
    hubsSortedByHead.forEach(([key, info], i) => {
      const angle = (2 * Math.PI * i) / hubsSortedByHead.length - Math.PI / 2;
      /* radius scales with wordCount & activation */
      const r =
        10 +
        (info.wordCount / words.length) * 10 +
        (info.totalVal / maxVal) * 8;
      const headColor = HEAD_COLORS[info.head % HEAD_COLORS.length];

      nodeArr.push({
        id: key,
        label: `#${info.idx}`,
        type: "neuron",
        color: headColor,
        radius: Math.min(r, 26),
        x: cx + Math.cos(angle) * innerR,
        y: cy + Math.sin(angle) * innerR,
        val: info.totalVal,
        wordCount: info.wordCount,
        head: info.head,
      });

      /* edges from this hub to every connected word */
      info.words.forEach((act, wName) => {
>>>>>>> Stashed changes
        const wIdx = words.findIndex((w) => w.word === wName);
        const wordColor = WORD_COLORS[wIdx % WORD_COLORS.length];
        edgeList.push({
          source: `w_${wName}`,
          target: key,
<<<<<<< Updated upstream
          color: isShared ? "#10b981" : wordColor,
          width: isShared ? 2.5 : 1,
          shared: isShared,
=======
          color: wordColor,
          width: 1.5 + (act / maxVal) * 2.5,
          shared: true,
>>>>>>> Stashed changes
        });
      });
    });

<<<<<<< Updated upstream
    // d3-force refinement
    const nodeArr = [...nodeMap.values()];
    const sim = d3
      .forceSimulation(nodeArr as any[])
      .force(
        "link",
        d3
          .forceLink(
            edgeList.map((e) => ({
              source: nodeArr.findIndex((n) => n.id === e.source),
              target: nodeArr.findIndex((n) => n.id === e.target),
            })),
          )
          .distance(100)
          .strength(0.3),
      )
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(cx, cy).strength(0.05))
      .force(
        "collide",
        d3.forceCollide<any>().radius((d: any) => (d.radius || 10) + 8),
=======
    /* 4. d3 force — light nudge to avoid overlaps while keeping ring shape */
    const sim = d3
      .forceSimulation(nodeArr as any[])
      .force(
        "collide",
        d3
          .forceCollide<any>()
          .radius((d: any) => (d.radius || 10) + 6)
          .strength(0.8),
>>>>>>> Stashed changes
      )
      .force(
        "radial",
        d3
          .forceRadial(
<<<<<<< Updated upstream
            (d: any) => (d.type === "word" ? innerRadius : outerRadius),
            cx,
            cy,
          )
          .strength(0.3),
      )
      .stop();
    for (let i = 0; i < 200; i++) sim.tick();
    nodeArr.forEach((n) => {
      n.x = Math.max(n.radius + 10, Math.min(dims.w - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(dims.h - n.radius - 10, n.y));
    });

    return { nodes: nodeArr, edges: edgeList };
  }, [result, selectedLayer, dims]);
=======
            (d: any) => (d.type === "word" ? outerR : innerR),
            cx,
            cy,
          )
          .strength(0.6),
      )
      .force("charge", d3.forceManyBody().strength(-60))
      .stop();
    for (let i = 0; i < 180; i++) sim.tick();
    nodeArr.forEach((n) => {
      n.x = Math.max(n.radius + 12, Math.min(dims.w - n.radius - 12, n.x));
      n.y = Math.max(n.radius + 12, Math.min(dims.h - n.radius - 12, n.y));
    });

    return {
      nodes: nodeArr,
      edges: edgeList,
      headCounts: headCountsMap,
      totalShared: shared.length,
      totalUnique: uniqueCount,
    };
  }, [result, selectedLayer, dims, filterHead]);
>>>>>>> Stashed changes

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

<<<<<<< Updated upstream
  const sharedCount = nodes.filter(
    (n) => n.type === "neuron" && n.color === "#10b981",
  ).length;

  // Hover helpers
=======
  /* ---- hover helpers ---- */
>>>>>>> Stashed changes
  const hoveredEdges = useMemo(() => {
    if (!hoveredNode) return new Set<number>();
    const s = new Set<number>();
    edges.forEach((e, i) => {
      if (e.source === hoveredNode || e.target === hoveredNode) s.add(i);
    });
    return s;
  }, [hoveredNode, edges]);

  const hoveredNeighbors = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const s = new Set<string>();
    edges.forEach((e) => {
      if (e.source === hoveredNode) s.add(e.target);
      if (e.target === hoveredNode) s.add(e.source);
    });
    s.add(hoveredNode);
    return s;
  }, [hoveredNode, edges]);

<<<<<<< Updated upstream
=======
  /* ---- curved edge path ---- */
>>>>>>> Stashed changes
  const edgePath = useCallback((s: GraphNode, t: GraphNode) => {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return `M${s.x},${s.y} L${t.x},${t.y}`;
<<<<<<< Updated upstream
    const curvature = Math.min(dist * 0.2, 40);
=======
    const curvature = Math.min(dist * 0.15, 35);
>>>>>>> Stashed changes
    const mx = (s.x + t.x) / 2 - (dy / dist) * curvature;
    const my = (s.y + t.y) / 2 + (dx / dist) * curvature;
    return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
  }, []);

<<<<<<< Updated upstream
=======
  /* ---- tooltip for hovered neuron ---- */
  const tooltipNode = hoveredNode ? nodeById.get(hoveredNode) : null;

>>>>>>> Stashed changes
  return (
    <motion.div
      ref={containerRef}
      className="glass-card p-5 overflow-hidden"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
<<<<<<< Updated upstream
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-bdh-accent" />
          <span className="text-sm font-semibold">
            Neuron Connectivity — Layer {selectedLayer}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30" />
            Shared ({sharedCount})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full bg-gray-600" />
            Unique
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded-lg bg-bdh-accent/30 border border-bdh-accent/50" />
            Word
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full"
        style={{ height: dims.h }}
      >
        <defs>
          <filter id="neuron-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="word-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="shared-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.4" />
          </radialGradient>
          {WORD_COLORS.map((c, i) => (
            <radialGradient
              key={i}
              id={`word-grad-${i}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={c} stopOpacity="0.95" />
              <stop offset="100%" stopColor={c} stopOpacity="0.5" />
            </radialGradient>
          ))}
        </defs>

        {/* Subtle radial guide rings */}
        <circle
          cx={dims.w / 2}
          cy={dims.h / 2}
          r={Math.min(dims.w, dims.h) * 0.18}
          fill="none"
          stroke="rgba(139,92,246,0.06)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
        <circle
          cx={dims.w / 2}
          cy={dims.h / 2}
          r={Math.min(dims.w, dims.h) * 0.38}
          fill="none"
          stroke="rgba(100,100,120,0.05)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />

        {/* Edges — curved paths */}
        {edges.map((e, i) => {
          const s = nodeById.get(e.source);
          const t = nodeById.get(e.target);
          if (!s || !t) return null;
          const isHoverActive = hoveredNode !== null;
          const isConnected = hoveredEdges.has(i);
          const opacity = isHoverActive
            ? isConnected
              ? 0.8
              : 0.06
            : e.shared
              ? 0.45
              : 0.15;

          return (
            <motion.path
              key={`e-${i}`}
              d={edgePath(s, t)}
              fill="none"
              stroke={e.color}
              strokeWidth={isConnected ? e.width + 1 : e.width}
              strokeOpacity={opacity}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: i * 0.005, duration: 0.5 }}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n, i) => {
          const isHoverActive = hoveredNode !== null;
          const isRelevant = hoveredNeighbors.has(n.id);
          const nodeOpacity = isHoverActive ? (isRelevant ? 1 : 0.15) : 1;
          const isWord = n.type === "word";
          const isShared = !isWord && n.color === "#10b981";
=======
      {/* ---- header row ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-bdh-accent" />
          <span className="text-sm font-semibold">
            Shared-Neuron Hub Graph — Layer {selectedLayer}
          </span>
        </div>

        {/* head filter pills */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <button
            onClick={() => setFilterHead(null)}
            className={`px-2 py-0.5 rounded-full border transition ${
              filterHead === null
                ? "border-bdh-accent text-bdh-accent bg-bdh-accent/10"
                : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            All Heads
          </button>
          {HEAD_COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => setFilterHead(filterHead === i ? null : i)}
              className={`px-2 py-0.5 rounded-full border transition ${
                filterHead === i
                  ? "bg-opacity-20 text-white"
                  : "border-gray-700 text-gray-500 hover:text-gray-300"
              }`}
              style={
                filterHead === i
                  ? { borderColor: c, backgroundColor: c + "22", color: c }
                  : {}
              }
            >
              H{i}
              {headCounts[i] ? ` (${headCounts[i]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ---- legend strip ---- */}
      <div className="flex items-center gap-5 mb-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-4 rounded-md border"
            style={{
              background: "rgba(139,92,246,0.25)",
              borderColor: "rgba(139,92,246,0.5)",
            }}
          />
          Word (outer ring)
        </span>
        {HEAD_COLORS.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: c, boxShadow: `0 0 6px ${c}55` }}
            />
            Head {i}
          </span>
        ))}
        <span className="ml-auto text-gray-600 font-mono">
          {totalShared} shared · {totalUnique} unique (hidden)
        </span>
      </div>

      {/* ---- SVG graph ---- */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="w-full"
        style={{ height: dims.h }}
      >
        <defs>
          <filter id="hub-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="word-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          {WORD_COLORS.map((c, i) => (
            <radialGradient key={i} id={`wg-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c} stopOpacity="0.9" />
              <stop offset="100%" stopColor={c} stopOpacity="0.45" />
            </radialGradient>
          ))}
          {HEAD_COLORS.map((c, i) => (
            <radialGradient key={i} id={`hg-${i}`} cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor={c} stopOpacity="1" />
              <stop offset="100%" stopColor={c} stopOpacity="0.35" />
            </radialGradient>
          ))}
        </defs>

        {/* Subtle guide rings */}
        <circle
          cx={dims.w / 2}
          cy={dims.h / 2}
          r={Math.min(dims.w, dims.h) * 0.18}
          fill="none"
          stroke="rgba(139,92,246,0.05)"
          strokeWidth="1"
          strokeDasharray="3 7"
        />
        <circle
          cx={dims.w / 2}
          cy={dims.h / 2}
          r={Math.min(dims.w, dims.h) * 0.4}
          fill="none"
          stroke="rgba(100,100,120,0.04)"
          strokeWidth="1"
          strokeDasharray="3 7"
        />

        {/* ---- Edges ---- */}
        {edges.map((e, i) => {
          const s = nodeById.get(e.source);
          const t = nodeById.get(e.target);
          if (!s || !t) return null;
          const isHoverActive = hoveredNode !== null;
          const isConnected = hoveredEdges.has(i);
          const opacity = isHoverActive ? (isConnected ? 0.85 : 0.04) : 0.35;

          return (
            <motion.path
              key={`e-${i}`}
              d={edgePath(s, t)}
              fill="none"
              stroke={e.color}
              strokeWidth={isConnected ? e.width + 1.5 : e.width}
              strokeOpacity={opacity}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: i * 0.008, duration: 0.5 }}
            />
          );
        })}

        {/* ---- Nodes ---- */}
        {nodes.map((n, i) => {
          const isHoverActive = hoveredNode !== null;
          const isRelevant = hoveredNeighbors.has(n.id);
          const nodeOpacity = isHoverActive ? (isRelevant ? 1 : 0.12) : 1;
          const isWord = n.type === "word";
>>>>>>> Stashed changes
          const wordIdx = isWord
            ? result.words.findIndex((w) => `w_${w.word}` === n.id)
            : -1;

          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: nodeOpacity, scale: 1 }}
<<<<<<< Updated upstream
              transition={{ delay: i * 0.015, duration: 0.3 }}
=======
              transition={{ delay: i * 0.018, duration: 0.35 }}
>>>>>>> Stashed changes
              onMouseEnter={() => setHoveredNode(n.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer" }}
            >
<<<<<<< Updated upstream
              {/* Glow ring for shared neurons */}
              {isShared && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.radius + 6}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  filter="url(#neuron-glow)"
                >
                  <animate
                    attributeName="r"
                    values={`${n.radius + 4};${n.radius + 8};${n.radius + 4}`}
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="stroke-opacity"
                    values="0.3;0.15;0.3"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Word node = rounded rect */}
              {isWord ? (
                <>
                  <rect
                    x={n.x - n.radius}
                    y={n.y - n.radius * 0.65}
                    width={n.radius * 2}
                    height={n.radius * 1.3}
                    rx={6}
                    fill={`url(#word-grad-${wordIdx % WORD_COLORS.length})`}
                    stroke={n.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
=======
              {isWord ? (
                /* ---- Word node: rounded pill ---- */
                <>
                  <rect
                    x={n.x - n.radius}
                    y={n.y - 14}
                    width={n.radius * 2}
                    height={28}
                    rx={8}
                    fill={`url(#wg-${wordIdx % WORD_COLORS.length})`}
                    stroke={n.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.55"
>>>>>>> Stashed changes
                    filter="url(#word-glow)"
                  />
                  <text
                    x={n.x}
<<<<<<< Updated upstream
                    y={n.y + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="700"
=======
                    y={n.y + 4.5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontFamily="monospace"
                    fontWeight="700"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
>>>>>>> Stashed changes
                  >
                    {n.label}
                  </text>
                </>
              ) : (
<<<<<<< Updated upstream
                <>
                  {/* Neuron node = circle */}
=======
                /* ---- Neuron hub node: bold circle with index label ---- */
                <>
                  {/* pulsing glow ring */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius + 5}
                    fill="none"
                    stroke={n.color}
                    strokeWidth="1.2"
                    strokeOpacity="0.25"
                    filter="url(#hub-glow)"
                  >
                    <animate
                      attributeName="r"
                      values={`${n.radius + 3};${n.radius + 7};${n.radius + 3}`}
                      dur="3.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="stroke-opacity"
                      values="0.25;0.1;0.25"
                      dur="3.5s"
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* main circle */}
>>>>>>> Stashed changes
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius}
<<<<<<< Updated upstream
                    fill={isShared ? "url(#shared-grad)" : n.color}
                    fillOpacity={isShared ? 1 : 0.5}
                    stroke={n.color}
                    strokeWidth={isShared ? 1.5 : 0.8}
                    strokeOpacity={isShared ? 0.8 : 0.4}
                  />
                  {(hoveredNode === n.id || isShared) && (
                    <text
                      x={n.x}
                      y={n.y - n.radius - 6}
                      textAnchor="middle"
                      fill={isShared ? "#6ee7b7" : "#9ca3af"}
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight={isShared ? 600 : 400}
                    >
                      {n.label}
                    </text>
                  )}
                  {/* Word count badge */}
                  {isShared && n.wordCount && n.wordCount >= 2 && (
                    <>
                      <circle
                        cx={n.x + n.radius * 0.7}
                        cy={n.y - n.radius * 0.7}
                        r={6}
                        fill="#065f46"
                        stroke="#10b981"
                        strokeWidth="1"
                      />
                      <text
                        x={n.x + n.radius * 0.7}
                        y={n.y - n.radius * 0.7 + 3.5}
                        textAnchor="middle"
                        fill="#6ee7b7"
                        fontSize="7"
=======
                    fill={`url(#hg-${(n.head ?? 0) % HEAD_COLORS.length})`}
                    stroke={n.color}
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />

                  {/* neuron index inside circle */}
                  <text
                    x={n.x}
                    y={n.y + 3.5}
                    textAnchor="middle"
                    fill="white"
                    fontSize={n.radius > 16 ? "9" : "7"}
                    fontFamily="monospace"
                    fontWeight="700"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    {n.label}
                  </text>

                  {/* head label above */}
                  <text
                    x={n.x}
                    y={n.y - n.radius - 5}
                    textAnchor="middle"
                    fill={n.color}
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="600"
                    opacity="0.75"
                  >
                    H{n.head}
                  </text>

                  {/* word-count badge */}
                  {n.wordCount && n.wordCount >= 2 && (
                    <>
                      <circle
                        cx={n.x + n.radius * 0.72}
                        cy={n.y - n.radius * 0.72}
                        r={7}
                        fill="#18181b"
                        stroke={n.color}
                        strokeWidth="1.2"
                      />
                      <text
                        x={n.x + n.radius * 0.72}
                        y={n.y - n.radius * 0.72 + 3.5}
                        textAnchor="middle"
                        fill="white"
                        fontSize="8"
>>>>>>> Stashed changes
                        fontWeight="700"
                      >
                        {n.wordCount}
                      </text>
                    </>
                  )}
                </>
              )}
            </motion.g>
          );
        })}
      </svg>

<<<<<<< Updated upstream
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-gray-500">
          <span className="text-emerald-400 font-semibold">Green neurons</span>{" "}
          fire for multiple words — proof of shared concept encoding. Hover to
          explore connections.
        </p>
        <span className="text-[10px] text-gray-600 font-mono">
          {nodes.filter((n) => n.type === "neuron").length} neurons ·{" "}
          {edges.length} connections
=======
      {/* ---- tooltip card ---- */}
      {tooltipNode && tooltipNode.type === "neuron" && (
        <motion.div
          className="mt-2 p-2.5 rounded-lg bg-gray-900/90 border border-gray-700 text-xs flex items-center gap-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span
            className="font-mono font-bold"
            style={{ color: tooltipNode.color }}
          >
            Head {tooltipNode.head} · Neuron {tooltipNode.label}
          </span>
          <span className="text-gray-400">
            Shared by{" "}
            <span className="text-white font-semibold">
              {tooltipNode.wordCount}
            </span>{" "}
            words
          </span>
          <span className="text-gray-500">
            Σ activation:{" "}
            <span className="text-gray-300 font-mono">
              {tooltipNode.val?.toFixed(4)}
            </span>
          </span>
        </motion.div>
      )}

      {/* ---- footer summary ---- */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-gray-500">
          <span className="text-bdh-accent font-semibold">Hub neurons</span>{" "}
          fire for 2+ words — evidence of shared concept encoding. Hover any
          node to trace connections.
        </p>
        <span className="text-[10px] text-gray-600 font-mono">
          {nodes.filter((n) => n.type === "neuron").length} hubs ·{" "}
          {edges.length} links
>>>>>>> Stashed changes
        </span>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
<<<<<<< Updated upstream
/*  SHARED NEURON TABLE                                                */
/* ================================================================== */
function SharedNeuronPanel({
  neurons,
  words,
}: {
  neurons: SharedNeuron[];
  words: string[];
}) {
  if (neurons.length === 0) return null;
=======
/*  MONOSEMANTIC NEURON TABLE (statistical selectivity)                */
/* ================================================================== */
function MonosemanticNeuronPanel({
  neurons,
  words,
  conceptName,
}: {
  neurons: MonosemanticNeuron[];
  words: string[];
  conceptName: string;
}) {
  if (!neurons || neurons.length === 0) {
    return (
      <motion.div
        className="glass-card p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-gray-600" />
          <span className="text-sm text-gray-500">
            No monosemantic neurons found for this concept (selectivity &gt;
            0.5)
          </span>
        </div>
      </motion.div>
    );
  }

  const HEAD_COLORS = ["#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];

>>>>>>> Stashed changes
  return (
    <motion.div
      className="glass-card p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
<<<<<<< Updated upstream
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-bdh-accent" />
        <span className="text-sm font-semibold">Top Shared Neurons</span>
        <span className="text-xs text-gray-500 ml-auto">
          Neurons active across all {words.length} input words
        </span>
      </div>
=======
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-bdh-accent" />
        <span className="text-sm font-semibold">Monosemantic Neurons</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-bdh-accent/20 text-bdh-accent font-mono">
          {neurons.length} found
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Neurons that fire selectively for{" "}
        <span className="text-white font-semibold">{conceptName}</span> but not
        other concepts. Selectivity = mean_in / (mean_in + mean_out) — 1.0 =
        perfectly exclusive.
      </p>
>>>>>>> Stashed changes
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-2">Location</th>
<<<<<<< Updated upstream
              <th className="text-right py-2 px-2">Mean Act.</th>
=======
              <th className="text-right py-2 px-2">Selectivity</th>
              <th className="text-right py-2 px-2">In</th>
              <th className="text-right py-2 px-2">Out</th>
>>>>>>> Stashed changes
              {words.map((w, i) => (
                <th
                  key={w}
                  className="text-right py-2 px-2 font-mono"
                  style={{ color: WORD_COLORS[i % WORD_COLORS.length] }}
                >
                  {w}
                </th>
              ))}
<<<<<<< Updated upstream
              <th className="py-2 px-2">Strength</th>
            </tr>
          </thead>
          <tbody>
            {neurons.slice(0, 15).map((n, i) => (
=======
              <th className="py-2 px-2">Selectivity</th>
            </tr>
          </thead>
          <tbody>
            {neurons.slice(0, 20).map((n, i) => (
>>>>>>> Stashed changes
              <motion.tr
                key={`${n.layer}-${n.head}-${n.neuron}`}
                className="border-b border-gray-800/50 hover:bg-gray-800/30"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
<<<<<<< Updated upstream
                <td className="py-2 px-2 font-mono text-bdh-accent">
                  L{n.layer}_H{n.head}_N{n.neuron}
                </td>
                <td className="py-2 px-2 text-right font-mono text-gray-400">
                  {n.mean_activation.toFixed(4)}
=======
                <td className="py-2 px-2 font-mono">
                  <span className="text-gray-500">L{n.layer}_</span>
                  <span
                    style={{ color: HEAD_COLORS[n.head % HEAD_COLORS.length] }}
                  >
                    H{n.head}
                  </span>
                  <span className="text-gray-500">_N{n.neuron}</span>
                </td>
                <td className="py-2 px-2 text-right font-mono font-bold">
                  <span
                    className={
                      n.selectivity >= 0.9
                        ? "text-emerald-400"
                        : n.selectivity >= 0.75
                          ? "text-amber-400"
                          : "text-gray-300"
                    }
                  >
                    {n.selectivity.toFixed(3)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-emerald-400/70">
                  {n.mean_in.toFixed(3)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-red-400/70">
                  {n.mean_out.toFixed(3)}
>>>>>>> Stashed changes
                </td>
                {n.per_word.map((pw, wi) => (
                  <td
                    key={wi}
                    className="py-2 px-2 text-right font-mono"
                    style={{
                      color: WORD_COLORS[wi % WORD_COLORS.length],
                      opacity: pw > 0 ? 1 : 0.3,
                    }}
                  >
                    {pw.toFixed(3)}
                  </td>
                ))}
                <td className="py-2 px-2">
<<<<<<< Updated upstream
                  <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-bdh-accent to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min((n.mean_activation / (neurons[0]?.mean_activation || 1)) * 100, 100)}%`,
                      }}
                      transition={{ delay: i * 0.05, duration: 0.5 }}
=======
                  <div className="w-24 h-3 bg-gray-800 rounded-full overflow-hidden relative">
                    <motion.div
                      className={`h-full rounded-full ${
                        n.selectivity >= 0.9
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
                          : n.selectivity >= 0.75
                            ? "bg-gradient-to-r from-amber-500 to-amber-300"
                            : "bg-gradient-to-r from-bdh-accent to-violet-300"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${n.selectivity * 100}%` }}
                      transition={{ delay: i * 0.04, duration: 0.5 }}
                    />
                    {/* 0.25 chance line */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-gray-600"
                      style={{ left: "25%" }}
                      title="Chance level (0.25)"
>>>>>>> Stashed changes
                    />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
<<<<<<< Updated upstream
=======
      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> ≥ 0.9
          (exclusive)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> ≥ 0.75 (strong)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-bdh-accent" /> ≥ 0.5
          (selective)
        </span>
        <span className="ml-auto">Vertical line = chance (0.25)</span>
      </div>
>>>>>>> Stashed changes
    </motion.div>
  );
}

/* ================================================================== */
/*  "TRY IT YOURSELF" — live probe w/ overlay against categories       */
/* ================================================================== */
function TryItYourself({
  precomputed,
  selectedLayer,
}: {
  precomputed: PrecomputedData | null;
  selectedLayer: number;
}) {
  const [input, setInput] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<FingerprintResult | null>(null);

  const addWord = useCallback(() => {
    const w = input.trim().toLowerCase();
    if (w && !words.includes(w)) {
      setWords((prev) => [...prev, w]);
      setInput("");
    }
  }, [input, words]);

  const removeWord = (w: string) =>
    setWords((prev) => prev.filter((x) => x !== w));

  const probe = async () => {
    if (words.length < 1) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await analysis.neuronFingerprint("custom", words);
      setLiveResult(resp.data as FingerprintResult);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Backend offline — start the server to use live probing",
      );
    } finally {
      setLoading(false);
    }
  };

  // Cosine similarity between user words and each pre-computed category
  const categoryOverlap = useMemo(() => {
    if (!liveResult || !precomputed) return null;
    if (liveResult.words.length === 0) return null;

    // Build average x_ds vector for all user words at selectedLayer
    const userVecs: number[][] = [];
    liveResult.words.forEach((uw) => {
      const uLayer = uw.layers.find((l) => l.layer === selectedLayer);
      if (!uLayer) return;
      userVecs.push(uLayer.heads.flatMap((h) => h.x_ds));
    });
    if (userVecs.length === 0) return null;

    const dim = userVecs[0].length;
    const avgUser = new Array(dim).fill(0);
    userVecs.forEach((v) => v.forEach((val, j) => (avgUser[j] += val)));
    avgUser.forEach((_, j) => (avgUser[j] /= userVecs.length));

    const cosine = (a: number[], b: number[]) => {
      let dot = 0,
        na = 0,
        nb = 0;
      for (let k = 0; k < a.length; k++) {
        dot += a[k] * b[k];
        na += a[k] * a[k];
        nb += b[k] * b[k];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom > 0 ? dot / denom : 0;
    };

    const overlaps: { concept: string; similarity: number }[] = [];
    Object.entries(precomputed.concepts).forEach(([cid, cr]) => {
      const sims: number[] = [];
      cr.words.forEach((w) => {
        const layer = w.layers.find((l) => l.layer === selectedLayer);
        if (!layer) return;
        const vec = layer.heads.flatMap((h) => h.x_ds);
        sims.push(cosine(avgUser, vec));
      });
      const avgSim =
        sims.length > 0 ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
      overlaps.push({ concept: cid, similarity: avgSim });
    });

    overlaps.sort((a, b) => b.similarity - a.similarity);
    return overlaps;
  }, [liveResult, precomputed, selectedLayer]);

<<<<<<< Updated upstream
=======
  /* Shared neurons across probed words — for overlap highlighting */
  const liveSharedNeurons = useMemo(() => {
    if (!liveResult || liveResult.words.length < 2) return null;
    const neuronWordCount = new Map<string, number>();
    liveResult.words.forEach((w) => {
      const layer = w.layers.find((l) => l.layer === selectedLayer);
      if (!layer) return;
      layer.heads.forEach((h) => {
        h.top_neurons.forEach((n) => {
          const key = `${h.head}_${n.idx}`;
          neuronWordCount.set(key, (neuronWordCount.get(key) || 0) + 1);
        });
      });
    });
    const perHead = new Map<number, Set<number>>();
    neuronWordCount.forEach((count, key) => {
      if (count >= 2) {
        const parts = key.split("_");
        const head = parseInt(parts[0]);
        const idx = parseInt(parts[1]);
        if (!perHead.has(head)) perHead.set(head, new Set());
        perHead.get(head)!.add(idx);
      }
    });
    return perHead.size > 0 ? perHead : null;
  }, [liveResult, selectedLayer]);

  const totalSharedCount = liveSharedNeurons
    ? [...liveSharedNeurons.values()].reduce((s, set) => s + set.size, 0)
    : 0;

>>>>>>> Stashed changes
  return (
    <motion.div
      className="rounded-2xl p-6 bg-gradient-to-br from-gray-900/80 to-gray-950/80 border border-cyan-500/15 backdrop-blur-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-lg bg-cyan-500/10">
          <Search size={16} className="text-cyan-400" />
        </div>
        <span className="text-base font-bold">Try It Yourself</span>
        <span className="text-[10px] text-gray-600 font-mono ml-auto">
          Live inference
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-5 ml-9">
        Type any word — see its sparse fingerprint and which category it aligns
        with.
      </p>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-900/60 rounded-xl border border-gray-700/50 min-h-[52px] mb-3">
        <AnimatePresence>
          {words.map((w) => (
            <motion.span
              key={w}
              className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-500/20 border border-cyan-500/40 rounded-full text-sm text-cyan-400 font-medium"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              layout
            >
              {w}
              <button
                onClick={() => removeWord(w)}
                className="ml-0.5 hover:text-red-400 transition-colors"
              >
                <X size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addWord();
            if (e.key === "Backspace" && !input && words.length)
              removeWord(words[words.length - 1]);
          }}
          placeholder='Type a word (e.g. "pound", "japon")…'
          className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-gray-200 placeholder-gray-600"
        />
        <button
          onClick={addWord}
          disabled={!input.trim()}
          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-all"
        >
          <Plus size={16} />
        </button>
      </div>

      <button
        onClick={probe}
        disabled={words.length < 1 || loading}
        className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed mb-4"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Zap size={16} />
        )}
        {loading ? "Probing…" : "Probe Model"}
      </button>

      {error && (
        <motion.p
          className="text-sm text-red-400 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.p>
      )}

      {liveResult && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
<<<<<<< Updated upstream
=======
          {/* Shared neuron banner */}
          {liveSharedNeurons && (
            <motion.div
              className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/15"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-xs">
                <Sparkles size={12} className="inline mr-1 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">
                  {totalSharedCount} shared neuron
                  {totalSharedCount !== 1 ? "s" : ""}
                </span>
                <span className="text-gray-500">
                  {" "}
                  found across {liveResult.words.length} words —{" "}
                  <span className="text-emerald-500/70">green bars</span> =
                  neurons that fire for multiple words
                </span>
              </p>
            </motion.div>
          )}

>>>>>>> Stashed changes
          {liveResult.words.map((fp) => {
            const layer = fp.layers.find((l) => l.layer === selectedLayer);
            if (!layer) return null;
            return (
              <motion.div
                key={fp.word}
                className="rounded-xl p-4 bg-gray-900/50 border border-gray-800/50 backdrop-blur-sm"
                style={{ borderLeftWidth: 3, borderLeftColor: "#22d3ee" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono font-bold text-cyan-400">
                    "{fp.word}"
                  </span>
                  <span className="text-[10px] text-gray-600 font-mono">
                    {layer.heads
                      .reduce((s, h) => s + h.x_active, 0)
                      .toLocaleString()}{" "}
                    active
                  </span>
                </div>
                <div className="space-y-1">
                  {layer.heads.map((h, hi) => (
                    <NeuronStrip
                      key={hi}
                      neurons={h.top_neurons}
                      label={`H${h.head}`}
                      delay={hi * 0.03}
                      color="rgba(34,211,238,0.7)"
<<<<<<< Updated upstream
=======
                      highlightNeurons={liveSharedNeurons?.get(h.head)}
>>>>>>> Stashed changes
                    />
                  ))}
                </div>
              </motion.div>
            );
          })}

          {categoryOverlap &&
            (() => {
              const maxSim = Math.max(
                0.01,
                ...categoryOverlap.map((co) => co.similarity),
              );
              return (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <Zap size={13} className="text-cyan-400" />
                    <span className="text-xs text-gray-300 font-semibold uppercase tracking-wider">
                      Category Affinity
                    </span>
                  </div>
                  {categoryOverlap.map((co, i) => {
                    const preset = PRESETS.find((p) => p.id === co.concept);
                    const color = CONCEPT_COLORS[co.concept] ?? "#8b5cf6";
                    const relWidth = (co.similarity / maxSim) * 80;
                    const isTop = i === 0;
                    return (
                      <motion.div
                        key={co.concept}
                        className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                          isTop
                            ? "bg-gray-800/40 border border-gray-700/40"
                            : ""
                        }`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                      >
                        <div className="flex items-center gap-1.5 w-28 shrink-0 justify-end">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className="text-xs font-semibold"
                            style={{ color }}
                          >
                            {preset?.icon} {preset?.name}
                          </span>
                        </div>
                        <div className="flex-1 h-4 bg-gray-800/60 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${relWidth}%` }}
                            transition={{ delay: i * 0.1, duration: 0.5 }}
                          />
                        </div>
                        <span
                          className={`text-xs font-mono w-14 text-right ${
                            isTop ? "font-bold" : "text-gray-500"
                          }`}
                          style={isTop ? { color } : undefined}
                        >
                          {co.similarity.toFixed(3)}
                        </span>
                      </motion.div>
                    );
                  })}
                  {categoryOverlap[0] &&
                    categoryOverlap[0].similarity > 0.05 && (
                      <motion.p
                        className="text-xs text-emerald-300 mt-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <Sparkles size={12} className="inline mr-1" />
                        Highest similarity with{" "}
                        <strong>
                          {PRESETS.find(
                            (p) => p.id === categoryOverlap[0].concept,
                          )?.name ?? categoryOverlap[0].concept}
                        </strong>{" "}
                        — the model recognizes semantic affinity!
                      </motion.p>
                    )}
                </div>
              );
            })()}
        </motion.div>
      )}
    </motion.div>
  );
}

/* ================================================================== */
/*  MAIN PAGE — narrative-driven, pre-computed first                   */
/* ================================================================== */
export function MonosemanticityPage() {
  const [precomputed, setPrecomputed] = useState<PrecomputedData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState(5);
  const [viewTab, setViewTab] = useState<ViewTab>("similarity");
  const [activeConcept, setActiveConcept] = useState("currencies");
  const [intersectionConcept, setIntersectionConcept] = useState("currencies");

  // Load pre-computed data on mount
  useEffect(() => {
    fetch("/monosemanticity/precomputed.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: PrecomputedData) => {
        setPrecomputed(data);
        setSelectedLayer(data.best_layer);
        setLoadingData(false);
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoadingData(false);
      });
  }, []);

  const nLayers = precomputed?.model_info.n_layers ?? 8;
  const bestLayer = precomputed?.best_layer ?? 5;

<<<<<<< Updated upstream
=======
  // --- Loading state ---
>>>>>>> Stashed changes
  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Loader2 size={40} className="animate-spin text-bdh-accent" />
          <p className="text-gray-400 text-sm">Loading monosemanticity data…</p>
        </motion.div>
      </div>
    );
  }

<<<<<<< Updated upstream
=======
  // --- Error state ---
>>>>>>> Stashed changes
  if (loadError || !precomputed) {
    return (
      <div className="min-h-screen p-6 md:p-8 max-w-[1600px] mx-auto">
        <motion.div
          className="flex flex-col items-center justify-center py-20 text-gray-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Brain size={64} className="mb-4 opacity-30" />
          <p className="text-lg font-medium mb-2">
            Pre-computed data not found
          </p>
<<<<<<< Updated upstream
          <p className="text-sm text-gray-700 max-w-md text-center">
            Run{" "}
            <code className="text-bdh-accent">
=======
          <p className="text-sm text-gray-500 text-center max-w-md">
            Run{" "}
            <code className="px-2 py-1 bg-gray-800 rounded text-xs font-mono text-bdh-accent">
>>>>>>> Stashed changes
              python scripts/precompute_monosemanticity.py
            </code>{" "}
            to generate the visualization data, then refresh this page.
          </p>
          {loadError && (
            <p className="text-xs text-red-400/60 mt-4 font-mono">
              {loadError}
            </p>
          )}
        </motion.div>
      </div>
    );
  }

<<<<<<< Updated upstream
=======
  const currentTab = VIEW_TABS.find((t) => t.id === viewTab)!;

>>>>>>> Stashed changes
  return (
    <div className="min-h-screen p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-3xl font-bold mb-1">
          <span className="gradient-text">Monosemanticity</span> Explorer
        </h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          BDH produces{" "}
          <span className="text-white font-medium">interpretable neurons</span>{" "}
<<<<<<< Updated upstream
          where same-concept words activate the same sparse subset. Four views
          reveal this from similarity to neuron-level connectivity.
        </p>
      </motion.div>

      {/* Toolbar: Layer selector + View tabs */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
=======
          by design. Same-concept words activate the same sparse x_sparse
          subset. Four views reveal this — from similarity proof to neuron-level
          graphs.
        </p>
      </motion.div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
>>>>>>> Stashed changes
        <LayerSelector
          nLayers={nLayers}
          selected={selectedLayer}
          onChange={setSelectedLayer}
          bestLayer={bestLayer}
        />

        <div className="flex gap-1 bg-gray-900/60 rounded-xl p-1 border border-gray-800/50">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewTab === tab.id
<<<<<<< Updated upstream
                  ? "bg-bdh-accent text-white"
                  : "text-gray-400 hover:text-gray-200"
=======
                  ? "bg-bdh-accent text-white shadow-lg shadow-bdh-accent/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
>>>>>>> Stashed changes
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

<<<<<<< Updated upstream
      {/* Narrative step indicator */}
      <motion.div
        className="mb-4 flex items-center gap-2"
=======
      {/* Narrative step */}
      <motion.div
        className="mb-5 flex items-start gap-3 p-3 rounded-xl bg-gray-900/30 border border-gray-800/30"
>>>>>>> Stashed changes
        key={viewTab}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
      >
<<<<<<< Updated upstream
        <span className="text-xs text-bdh-accent font-bold uppercase tracking-wider">
          Step {VIEW_TABS.findIndex((t) => t.id === viewTab) + 1}/
          {VIEW_TABS.length}
        </span>
        <ArrowRight size={12} className="text-gray-600" />
        <span className="text-xs text-gray-400">
          {VIEW_TABS.find((t) => t.id === viewTab)?.blurb}
        </span>
=======
        <Info size={14} className="text-bdh-accent mt-0.5 shrink-0" />
        <div>
          <span className="text-[10px] text-bdh-accent font-bold uppercase tracking-wider">
            Step {VIEW_TABS.findIndex((t) => t.id === viewTab) + 1} of{" "}
            {VIEW_TABS.length}
          </span>
          <span className="text-gray-600 mx-2">·</span>
          <span className="text-xs text-gray-400">{currentTab.narrative}</span>
        </div>
>>>>>>> Stashed changes
      </motion.div>

      {/* Active view */}
      <div className="mb-6">
        <AnimatePresence mode="wait">
          {viewTab === "similarity" && (
            <motion.div
              key="sim"
<<<<<<< Updated upstream
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
=======
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
>>>>>>> Stashed changes
              transition={{ duration: 0.2 }}
            >
              <SimilarityView
                concepts={precomputed.concepts}
                activeConcept={activeConcept}
                setActiveConcept={setActiveConcept}
                selectedLayer={selectedLayer}
              />
            </motion.div>
          )}
          {viewTab === "crossConcept" && (
            <motion.div
              key="cross"
<<<<<<< Updated upstream
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
=======
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
>>>>>>> Stashed changes
              transition={{ duration: 0.2 }}
            >
              <CrossConceptView
                crossPairs={precomputed.cross_concept}
                concepts={precomputed.concepts}
                selectedLayer={selectedLayer}
              />
            </motion.div>
          )}
          {viewTab === "intersection" && (
            <motion.div
              key="inter"
<<<<<<< Updated upstream
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const preset = PRESETS.find((p) => p.id === cid);
=======
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              {/* Concept selector for intersection */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const p = presetOf(cid);
                  const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
>>>>>>> Stashed changes
                  return (
                    <button
                      key={cid}
                      onClick={() => setIntersectionConcept(cid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        intersectionConcept === cid
<<<<<<< Updated upstream
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                          : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                      }`}
                    >
                      {preset?.icon} {preset?.name ?? cid}
=======
                          ? "shadow-lg"
                          : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                      }`}
                      style={
                        intersectionConcept === cid
                          ? {
                              borderColor: `${c}50`,
                              backgroundColor: `${c}15`,
                              color: c,
                            }
                          : undefined
                      }
                    >
                      {p?.icon} {p?.name ?? cid}
>>>>>>> Stashed changes
                    </button>
                  );
                })}
              </div>
              <IntersectionView
                result={precomputed.concepts[intersectionConcept]}
                selectedLayer={selectedLayer}
              />
            </motion.div>
          )}
          {viewTab === "neuronGraph" && (
            <motion.div
              key="graph"
<<<<<<< Updated upstream
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const preset = PRESETS.find((p) => p.id === cid);
=======
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              {/* Concept selector for graph */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const p = presetOf(cid);
                  const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
>>>>>>> Stashed changes
                  return (
                    <button
                      key={cid}
                      onClick={() => setActiveConcept(cid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        activeConcept === cid
<<<<<<< Updated upstream
                          ? "border-bdh-accent bg-bdh-accent/15 text-bdh-accent"
                          : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                      }`}
                    >
                      {preset?.icon} {preset?.name ?? cid}
=======
                          ? "shadow-lg"
                          : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                      }`}
                      style={
                        activeConcept === cid
                          ? {
                              borderColor: `${c}50`,
                              backgroundColor: `${c}15`,
                              color: c,
                            }
                          : undefined
                      }
                    >
                      {p?.icon} {p?.name ?? cid}
>>>>>>> Stashed changes
                    </button>
                  );
                })}
              </div>
              <NeuronGraphView
                result={precomputed.concepts[activeConcept]}
                selectedLayer={selectedLayer}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

<<<<<<< Updated upstream
      {/* Shared neurons table */}
      {(viewTab === "intersection" || viewTab === "neuronGraph") && (
        <SharedNeuronPanel
          neurons={
            precomputed.concepts[
              viewTab === "intersection" ? intersectionConcept : activeConcept
            ]?.shared_neurons ?? []
          }
          words={
            precomputed.concepts[
              viewTab === "intersection" ? intersectionConcept : activeConcept
            ]?.words.map((w) => w.word) ?? []
          }
        />
      )}
=======
      {/* Monosemantic neurons table (for intersection & graph views) */}
      {(viewTab === "intersection" || viewTab === "neuronGraph") &&
        (() => {
          const cid =
            viewTab === "intersection" ? intersectionConcept : activeConcept;
          const concept = precomputed.concepts[cid];
          const presetInfo = PRESETS.find((p) => p.id === cid);
          return (
            <MonosemanticNeuronPanel
              neurons={concept?.monosemantic_neurons ?? []}
              words={concept?.words.map((w) => w.word) ?? []}
              conceptName={presetInfo?.name ?? cid}
            />
          );
        })()}
>>>>>>> Stashed changes

      {/* Insight banner */}
      <motion.div
        className="mt-6 glass-card p-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
<<<<<<< Updated upstream
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Sparkles size={16} className="text-bdh-accent" />
          What You're Seeing
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          The{" "}
          <span className="text-amber-400 font-semibold">x-path (encoder)</span>{" "}
          maps raw input through a sparse ReLU producing{" "}
          <span className="text-white">8,192 neurons per head</span>.
          Same-concept words activate the <em>same sparse subset</em> — that's
          monosemanticity. The{" "}
          <span className="text-emerald-400 font-semibold">
            Similarity Matrix
          </span>{" "}
          quantifies it. The{" "}
          <span className="text-cyan-400 font-semibold">Cross-Concept</span>{" "}
          view proves <em>different</em> concepts use <em>different</em> neurons
          (negative control). Unlike transformers whose neurons are{" "}
          <span className="text-red-400">polysemantic</span>, BDH produces{" "}
          <span className="text-bdh-accent font-semibold">
            interpretable synapses
          </span>{" "}
          where you can point at a neuron and say{" "}
          <em>"this is the currency neuron."</em>
        </p>
      </motion.div>

      {/* Section divider */}
=======
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-bdh-accent" />
          What You're Seeing — x_sparse only
        </h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          Every visualization shows{" "}
          <span className="text-amber-400 font-semibold">
            x_sparse = ReLU(input × Encoder)
          </span>{" "}
          — the clean "concept fingerprint" before attention and Hebbian
          updates. This is the pure encoding path. The y_sparse path adds
          context-dependent noise and is intentionally excluded. Across{" "}
          <span className="text-white font-medium">
            {precomputed.model_info.n_neurons.toLocaleString()} neurons per head
          </span>
          , same-concept words activate the same sparse ~5% subset. That's
          monosemanticity — you can point at a neuron and know what concept it
          encodes. Transformers can't do this.
        </p>
      </motion.div>

      {/* Divider */}
>>>>>>> Stashed changes
      <div className="relative my-10">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-800/50" />
        </div>
        <div className="relative flex justify-center">
<<<<<<< Updated upstream
          <span className="px-4 py-1 bg-gray-950 text-xs text-gray-500 uppercase tracking-wider rounded-full border border-gray-800/50">
=======
          <span className="px-4 py-1 bg-gray-950 text-[10px] text-gray-500 uppercase tracking-wider rounded-full border border-gray-800/50">
>>>>>>> Stashed changes
            Live Exploration
          </span>
        </div>
      </div>

      {/* Try It Yourself */}
      <TryItYourself precomputed={precomputed} selectedLayer={selectedLayer} />
    </div>
  );
}
