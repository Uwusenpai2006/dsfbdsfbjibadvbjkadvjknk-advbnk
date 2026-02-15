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
  Star,
  Search,
  Info,
  Activity,
  BarChart2,
} from "lucide-react";
import * as d3 from "d3";
import { analysis } from "../utils/api";

/* ================================================================== */
/*  Type definitions                                                    */
/* ================================================================== */
interface TopNeuron {
  idx: number;
  val: number;
  raw?: number;
}
interface HeadFingerprint {
  head: number;
  x_ds: number[];
  x_active: number;
  top_neurons: TopNeuron[];
}
interface LayerFingerprint {
  layer: number;
  heads: HeadFingerprint[];
}
interface WordFingerprint {
  word: string;
  layers: LayerFingerprint[];
}
interface SharedNeuron {
  layer: number;
  head: number;
  neuron: number;
  mean_activation: number;
  active_in: number;
  per_word: number[];
}
interface MonosemanticNeuron {
  layer: number;
  head: number;
  neuron: number;
  selectivity: number;
  mean_in: number;
  mean_out: number;
  p_value: number;
  per_word: number[];
}
interface FingerprintResult {
  concept: string;
  words: WordFingerprint[];
  similarity: Record<string, number[][]>;
  shared_neurons: SharedNeuron[];
  monosemantic_neurons?: MonosemanticNeuron[];
  model_info: { n_layers: number; n_heads: number; n_neurons: number };
}
interface CrossConceptEntry {
  primary: string;
  secondary: string;
  distinctness_per_layer: number[];
  secondary_result: FingerprintResult;
}
interface SelectivityHistBin {
  bin_start: number;
  bin_end: number;
  count: number;
}
interface TrackedSynapse {
  id: string;
  label: string;
  layer: number;
  head: number;
  i: number;
  j: number;
  selectivity: number;
}
interface WordTimelineEntry {
  word: string;
  byte_start: number;
  byte_end: number;
  is_concept: boolean;
  sigma: Record<string, number>;
  delta_sigma: Record<string, number>;
}
interface SentenceTrack {
  sentence: string;
  n_bytes: number;
  words: WordTimelineEntry[];
}
interface ConceptTracking {
  synapses: TrackedSynapse[];
  sentences: SentenceTrack[];
}
interface PrecomputedData {
  model_info: { n_layers: number; n_heads: number; n_neurons: number };
  best_layer: number;
  concepts: Record<string, FingerprintResult>;
  cross_concept: CrossConceptEntry[];
  selectivity?: {
    histogram: SelectivityHistBin[];
    total_neurons: number;
    total_selective: number;
    mean_selectivity: number;
  };
  synapse_tracking?: Record<string, ConceptTracking>;
}

/* ================================================================== */
/*  Constants — presets, colors, etc.                                   */
/* ================================================================== */
const PRESETS = [
  { id: "currencies", name: "Currencies", icon: "💰", color: "#f59e0b" },
  { id: "countries", name: "Countries", icon: "🌍", color: "#06b6d4" },
  { id: "languages", name: "Languages", icon: "🗣️", color: "#8b5cf6" },
  { id: "politics", name: "Politics", icon: "⚖️", color: "#ef4444" },
];

const CONCEPT_COLORS: Record<string, string> = {
  currencies: "#f59e0b",
  countries: "#06b6d4",
  languages: "#8b5cf6",
  politics: "#ef4444",
};

const WORD_COLORS = [
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#22d3ee",
  "#a78bfa",
  "#fb923c",
  "#86efac",
];

const HEAD_COLORS = ["#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];

const SYNAPSE_COLORS = ["#f59e0b", "#06b6d4", "#8b5cf6", "#ef4444", "#10b981"];

function presetOf(id: string) {
  return PRESETS.find((p) => p.id === id);
}

/* ================================================================== */
/*  Color helpers                                                       */
/* ================================================================== */
function simColor(t: number): string {
  if (t < 0.3) return `rgba(59,130,246,${(0.15 + t * 0.5).toFixed(2)})`;
  if (t < 0.6) return `rgba(16,185,129,${(0.2 + (t - 0.3) * 1.5).toFixed(2)})`;
  return `rgba(250,204,21,${(0.3 + (t - 0.6) * 1.5).toFixed(2)})`;
}

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
/* ================================================================== */
type ViewTab =
  | "similarity"
  | "crossConcept"
  | "intersection"
  | "neuronGraph"
  | "synapseTracking"
  | "selectivity";

const VIEW_TABS: {
  id: ViewTab;
  label: string;
  icon: React.ReactNode;
  blurb: string;
  narrative: string;
}[] = [
  {
    id: "similarity",
    label: "Sparse Fingerprinting",
    icon: <BarChart3 size={14} />,
    blurb: "Same concept → same neurons",
    narrative:
      "Sparse Concept Fingerprinting: words belonging to the same concept activate overlapping neuron populations. Encoder alignment is measured by cosine similarity between their x_sparse vectors.",
  },
  {
    id: "crossConcept",
    label: "Cross-Concept",
    icon: <GitCompare size={14} />,
    blurb: "Different concepts → different neurons",
    narrative:
      "Negative control: words from different categories activate completely different neurons — near-zero cross-concept similarity.",
  },
  {
    id: "synapseTracking",
    label: "Synapse Tracking",
    icon: <Activity size={14} />,
    blurb: "Watch neurons fire in real sentences",
    narrative:
      "Track individual neurons token-by-token through full sentences. Concept-selective neurons spike when their concept word appears and stay silent otherwise — the signature of monosemanticity.",
  },
  {
    id: "selectivity",
    label: "Selectivity",
    icon: <BarChart2 size={14} />,
    blurb: "Statistical proof of concept selectivity",
    narrative:
      "Selectivity = mean_in / (mean_in + mean_out). Neurons with selectivity near 1.0 fire exclusively for one concept. Mann-Whitney U test confirms statistical significance (p < 0.05).",
  },
  {
    id: "intersection",
    label: "Shared Neurons",
    icon: <Eye size={14} />,
    blurb: "Which exact neurons overlap?",
    narrative:
      "Pick a reference word. See exactly which neurons it shares with other same-concept words (green) vs. neurons unique to each word (dim).",
  },
  {
    id: "neuronGraph",
    label: "Neuron Graph",
    icon: <Network size={14} />,
    blurb: "Visualize the connectivity",
    narrative:
      'A force-directed graph where word nodes connect to their top-K active neurons. Shared neurons glow — you can literally say "neuron #4521 is the currency neuron."',
  },
];

/* ================================================================== */
/*  LAYER SELECTOR                                                      */
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
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
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
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  Helper: extract concept signature neurons                          */
/* ================================================================== */
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

/* ================================================================== */
/*  1. SIMILARITY VIEW                                                 */
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

  const allVals = matrix.flat();
  const matMin = Math.min(...allVals);
  const matMax = Math.max(...allVals);
  const matRange = matMax - matMin || 1;
  const rescale = (v: number) =>
    Math.max(0, Math.min(1, (v - matMin) / matRange));

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

      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        key={activeConcept + simKey}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-bdh-accent" />
            <span className="text-sm font-semibold">
              Encoder Alignment — {result.concept}
            </span>
          </div>
          <span
            className={`text-xs font-mono font-bold ${avgSim > 0.6 ? "text-emerald-400" : avgSim > 0.4 ? "text-amber-400" : "text-gray-400"}`}
          >
            avg: {avgSim.toFixed(3)}
          </span>
        </div>

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
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <span className="text-[10px] text-gray-500 font-mono">
            {matMin.toFixed(2)}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden flex">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-full"
                style={{ backgroundColor: simColor(i / 19) }}
              />
            ))}
          </div>
          <span className="text-[10px] text-gray-500 font-mono">
            {matMax.toFixed(2)}
          </span>
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
/*  2. CROSS-CONCEPT VIEW                                              */
/* ================================================================== */
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

  return (
    <div className="space-y-4">
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

      {/* Concept Neuron Signatures */}
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
          {signatureOverlapCount > 0 ? (
            <span className="text-amber-400">
              {" "}
              Overlap: {signatureOverlapCount} shared neurons
            </span>
          ) : (
            <span className="text-emerald-400"> ✓ Completely disjoint!</span>
          )}
        </p>

        <div className="grid gap-6 md:grid-cols-2 mb-4">
          {[
            { sig: pSignature, color: pColor, label: pair.primary },
            { sig: sSignature, color: sColor, label: pair.secondary },
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
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Side-by-side word fingerprints */}
      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            result: primaryResult,
            color: pColor,
            label: pair.primary,
          },
          {
            result: secondaryResult,
            color: sColor,
            label: pair.secondary,
          },
        ].map(({ result: conceptResult, color, label }) => (
          <div key={label} className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color }}
              >
                {presetOf(label)?.icon} {presetOf(label)?.name}
              </span>
            </div>
            {conceptResult.words.map((fp, i) => {
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
/*  3. SYNAPSE TRACKING VIEW (NEW)                                     */
/* ================================================================== */
function SynapseTrackingView({
  tracking,
  activeConcept,
  setActiveConcept,
}: {
  tracking: Record<string, ConceptTracking>;
  activeConcept: string;
  setActiveConcept: (c: string) => void;
}) {
  const [activeSentence, setActiveSentence] = useState(0);
  const [showDelta, setShowDelta] = useState(true);
  const conceptTrack = tracking[activeConcept];

  if (!conceptTrack || conceptTrack.sentences.length === 0) {
    return (
      <motion.div
        className="glass-card p-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Activity size={32} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">
          No synapse tracking data available. Run the enhanced precompute script
          to generate timeseries data.
        </p>
      </motion.div>
    );
  }

  const sent = conceptTrack.sentences[activeSentence];
  const synapses = conceptTrack.synapses;
  const wordTimeline = sent?.words ?? [];

  // Max sigma or delta for normalization
  const { maxSigma, maxDelta } = useMemo(() => {
    let mxS = 1e-6;
    let mxD = 1e-6;
    wordTimeline.forEach((w) => {
      Object.values(w.sigma).forEach((v) => {
        if (Math.abs(v) > mxS) mxS = Math.abs(v);
      });
      Object.values(w.delta_sigma).forEach((v) => {
        if (Math.abs(v) > mxD) mxD = Math.abs(v);
      });
    });
    return { maxSigma: mxS, maxDelta: mxD };
  }, [wordTimeline]);

  const maxVal = showDelta ? maxDelta : maxSigma;

  // Helper to get RGB components from hex color
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  };

  return (
    <div className="space-y-4">
      {/* Concept selector */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(tracking).map((cid) => {
          const preset = presetOf(cid);
          const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
          return (
            <button
              key={cid}
              onClick={() => {
                setActiveConcept(cid);
                setActiveSentence(0);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activeConcept === cid
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
              {preset?.icon} {preset?.name ?? cid}
            </button>
          );
        })}
      </div>

      {/* Sentence selector */}
      <div className="flex flex-wrap gap-2">
        {conceptTrack.sentences.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveSentence(i)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono border transition-all max-w-xs truncate ${
              i === activeSentence
                ? "border-bdh-accent bg-bdh-accent/10 text-bdh-accent"
                : "border-gray-700/50 bg-gray-900/40 text-gray-500 hover:text-gray-300"
            }`}
          >
            "{s.sentence}"
          </button>
        ))}
      </div>

      {/* Tracked synapses legend */}
      <motion.div
        className="glass-card p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-bdh-accent" />
          <span className="text-sm font-semibold">Tracked Synapses σ(i,j)</span>
          <span className="text-[10px] text-gray-500 ml-auto">
            Top monosemantic synapses for{" "}
            {presetOf(activeConcept)?.name ?? activeConcept}
          </span>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">
          Cumulative Hebbian outer product: σ(i,j) = Σ y_sparse[τ,i] ·
          x_sparse[τ,j]. Each entry tracks how strongly neuron j's activation
          drives neuron i through attention.
        </p>
        <div className="flex flex-wrap gap-3">
          {synapses.map((syn, i) => (
            <div
              key={syn.id}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
              style={{
                borderColor: SYNAPSE_COLORS[i % SYNAPSE_COLORS.length] + "40",
                backgroundColor:
                  SYNAPSE_COLORS[i % SYNAPSE_COLORS.length] + "10",
              }}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: SYNAPSE_COLORS[i % SYNAPSE_COLORS.length],
                }}
              />
              <span
                className="text-[10px] font-mono font-bold"
                style={{
                  color: SYNAPSE_COLORS[i % SYNAPSE_COLORS.length],
                }}
              >
                {syn.id}
              </span>
              <span className="text-[9px] text-gray-500">
                sel: {syn.selectivity.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Mode toggle: cumulative σ vs Δσ per word */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowDelta(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            !showDelta
              ? "border-bdh-accent bg-bdh-accent/10 text-bdh-accent"
              : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:text-gray-200"
          }`}
        >
          Cumulative σ (build-up)
        </button>
        <button
          onClick={() => setShowDelta(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            showDelta
              ? "border-bdh-accent bg-bdh-accent/10 text-bdh-accent"
              : "border-gray-700/50 bg-gray-900/40 text-gray-400 hover:text-gray-200"
          }`}
        >
          Δσ per word (jumps)
        </button>
      </div>

      {/* Word-level σ timeline */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        key={`${activeConcept}-${activeSentence}-${showDelta}`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-bdh-accent" />
          <span className="text-sm font-semibold">
            {showDelta
              ? "Δσ per Word (Synaptic Jump)"
              : "Cumulative σ (Synaptic Build-up)"}
          </span>
        </div>

        {/* Word strip */}
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          {wordTimeline.map((w, wi) => (
            <div
              key={wi}
              className="flex flex-col items-center"
              style={{ minWidth: 60 }}
            >
              <span
                className={`text-[11px] font-mono leading-tight px-1 py-0.5 rounded ${
                  w.is_concept
                    ? "text-amber-300 font-bold bg-amber-500/15 border border-amber-500/30"
                    : "text-gray-400"
                }`}
              >
                {w.word}
              </span>
            </div>
          ))}
        </div>

        {/* Per-synapse heatmap rows (word-level) */}
        {synapses.map((syn, si) => {
          const synColor = SYNAPSE_COLORS[si % SYNAPSE_COLORS.length];
          const rgb = hexToRgb(synColor);
          return (
            <div key={syn.id} className="flex gap-1 mb-[3px] items-center">
              <span
                className="text-[8px] font-mono w-24 shrink-0 text-right pr-1"
                style={{ color: synColor }}
              >
                {syn.id}
              </span>
              <div className="flex gap-1 flex-1 overflow-x-auto">
                {wordTimeline.map((w, wi) => {
                  const val = showDelta
                    ? w.delta_sigma[syn.id] || 0
                    : w.sigma[syn.id] || 0;
                  const t = maxVal > 0 ? Math.abs(val) / maxVal : 0;
                  return (
                    <motion.div
                      key={wi}
                      className="rounded-sm"
                      style={{
                        minWidth: 60,
                        height: 18,
                        backgroundColor:
                          t > 0.02
                            ? `rgba(${rgb},${(0.1 + t * 0.9).toFixed(2)})`
                            : "rgba(30,30,40,0.3)",
                        boxShadow:
                          t > 0.3 ? `0 0 6px ${synColor}40` : undefined,
                        border:
                          w.is_concept && t > 0.1
                            ? `1px solid ${synColor}60`
                            : "1px solid transparent",
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: wi * 0.02 }}
                      title={`${w.word}: ${showDelta ? "Δ" : ""}σ=${val.toFixed(6)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* σ line chart — word-by-word */}
        <div className="mt-4 h-40 relative">
          <svg
            viewBox={`0 0 ${Math.max(wordTimeline.length * 62 + 80, 300)} 140`}
            className="w-full h-full"
            preserveAspectRatio="xMinYMin meet"
          >
            {/* Concept word highlight bands */}
            {wordTimeline.map((w, wi) =>
              w.is_concept ? (
                <rect
                  key={`bg-${wi}`}
                  x={80 + wi * 62}
                  y={0}
                  width={60}
                  height={140}
                  fill="rgba(245,158,11,0.06)"
                  rx={4}
                />
              ) : null,
            )}
            {/* Lines per synapse */}
            {synapses.map((syn, si) => {
              const synColor = SYNAPSE_COLORS[si % SYNAPSE_COLORS.length];
              const points = wordTimeline.map((w, wi) => {
                const val = showDelta
                  ? w.delta_sigma[syn.id] || 0
                  : w.sigma[syn.id] || 0;
                const x = 80 + wi * 62 + 30;
                const y = 125 - (Math.abs(val) / maxVal) * 110;
                return `${x},${y}`;
              });
              return (
                <g key={syn.id}>
                  <motion.polyline
                    points={points.join(" ")}
                    fill="none"
                    stroke={synColor}
                    strokeWidth="2.5"
                    strokeOpacity="0.9"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: si * 0.15 }}
                  />
                  {/* Dots at each word */}
                  {wordTimeline.map((w, wi) => {
                    const val = showDelta
                      ? w.delta_sigma[syn.id] || 0
                      : w.sigma[syn.id] || 0;
                    const x = 80 + wi * 62 + 30;
                    const y = 125 - (Math.abs(val) / maxVal) * 110;
                    const t = maxVal > 0 ? Math.abs(val) / maxVal : 0;
                    return t > 0.05 ? (
                      <motion.circle
                        key={wi}
                        cx={x}
                        cy={y}
                        r={w.is_concept ? 5 : 3}
                        fill={synColor}
                        fillOpacity={w.is_concept ? 1 : 0.6}
                        stroke={w.is_concept ? "white" : "none"}
                        strokeWidth={w.is_concept ? 1.5 : 0}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: wi * 0.04 + si * 0.15 }}
                      />
                    ) : null;
                  })}
                </g>
              );
            })}
            {/* Y-axis labels */}
            <text
              x="0"
              y="18"
              fill="#6b7280"
              fontSize="9"
              fontFamily="monospace"
            >
              {maxVal.toFixed(3)}
            </text>
            <text
              x="0"
              y="128"
              fill="#6b7280"
              fontSize="9"
              fontFamily="monospace"
            >
              0.000
            </text>
            {/* Word labels at bottom */}
            {wordTimeline.map((w, wi) => (
              <text
                key={wi}
                x={80 + wi * 62 + 30}
                y={138}
                fill={w.is_concept ? "#fbbf24" : "#6b7280"}
                fontSize={w.is_concept ? "8" : "7"}
                fontFamily="monospace"
                textAnchor="middle"
                fontWeight={w.is_concept ? "bold" : "normal"}
              >
                {w.word.length > 8 ? w.word.slice(0, 7) + "…" : w.word}
              </text>
            ))}
          </svg>
        </div>

        <motion.div
          className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/15"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs text-amber-300">
            <Sparkles size={12} className="inline mr-1" />
            {showDelta ? (
              <>
                <strong>Δσ</strong> shows the <strong>jump</strong> in the
                synaptic tensor when each word is processed. Monosemantic
                synapses show large Δσ exclusively at concept words
                (highlighted) and near-zero Δσ everywhere else.
              </>
            ) : (
              <>
                <strong>Cumulative σ</strong> shows the Hebbian outer product Σ
                y⊗x building up token-by-token. A monosemantic synapse stays
                flat during non-concept words and <strong>steps up</strong>{" "}
                sharply when a concept word (highlighted) appears — exactly as
                predicted by Eq.16 in the paper.
              </>
            )}
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ================================================================== */
/*  4. SELECTIVITY VIEW (NEW)                                          */
/* ================================================================== */
function SelectivityView({
  selectivity,
  concepts,
  activeConcept,
  setActiveConcept,
}: {
  selectivity: PrecomputedData["selectivity"];
  concepts: Record<string, FingerprintResult>;
  activeConcept: string;
  setActiveConcept: (c: string) => void;
}) {
  if (!selectivity) {
    return (
      <motion.div
        className="glass-card p-6 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <BarChart2 size={32} className="mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">
          No selectivity data available. Run the enhanced precompute script with
          Mann-Whitney U test support.
        </p>
      </motion.div>
    );
  }

  const histogram = selectivity.histogram;
  const maxCount = Math.max(1, ...histogram.map((h) => h.count));
  const concept = concepts[activeConcept];
  const monoNeurons = concept?.monosemantic_neurons ?? [];
  const significantCount = monoNeurons.filter((n) => n.p_value < 0.05).length;

  return (
    <div className="space-y-4">
      {/* Concept selector */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(concepts).map((cid) => {
          const preset = presetOf(cid);
          const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
          const nMono = concepts[cid]?.monosemantic_neurons?.length ?? 0;
          return (
            <button
              key={cid}
              onClick={() => setActiveConcept(cid)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activeConcept === cid
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
              {preset?.icon} {preset?.name ?? cid}
              <span className="ml-1.5 text-[10px] opacity-70">({nMono})</span>
            </button>
          );
        })}
      </div>

      {/* Global selectivity histogram */}
      <motion.div
        className="glass-card p-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-bdh-accent" />
            <span className="text-sm font-semibold">
              Selectivity Distribution (All Concepts)
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>
              Total:{" "}
              <strong className="text-white">
                {selectivity.total_neurons.toLocaleString()}
              </strong>{" "}
              neurons
            </span>
            <span>
              Selective (&gt;0.6):{" "}
              <strong className="text-emerald-400">
                {selectivity.total_selective.toLocaleString()}
              </strong>
            </span>
            <span>
              Mean:{" "}
              <strong className="text-emerald-400">
                {selectivity.mean_selectivity.toFixed(3)}
              </strong>
            </span>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 mb-3">
          Selectivity = mean_in / (mean_in + mean_out). Neurons near 1.0 fire
          exclusively for one concept. Neurons near 0.5 are non-selective.
        </p>

        <div className="flex items-end gap-[3px] h-32">
          {histogram.map((bin, i) => {
            const h = (bin.count / maxCount) * 100;
            const isHighSel = bin.bin_start >= 0.75;
            const isMedSel = bin.bin_start >= 0.5;
            return (
              <motion.div
                key={i}
                className="flex-1 flex flex-col items-center"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
                style={{ transformOrigin: "bottom" }}
              >
                {bin.count > 0 && (
                  <span className="text-[7px] font-mono text-gray-600 mb-0.5">
                    {bin.count}
                  </span>
                )}
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.max(h, bin.count > 0 ? 3 : 0)}%`,
                    backgroundColor: isHighSel
                      ? "rgba(16,185,129,0.8)"
                      : isMedSel
                        ? "rgba(245,158,11,0.7)"
                        : "rgba(100,116,139,0.3)",
                    boxShadow: isHighSel
                      ? "0 0 8px rgba(16,185,129,0.3)"
                      : undefined,
                  }}
                  title={`${bin.bin_start.toFixed(2)}–${bin.bin_end.toFixed(2)}: ${bin.count}`}
                />
              </motion.div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] font-mono text-gray-600">
            0.0 (non-selective)
          </span>
          <span className="text-[9px] font-mono text-emerald-500">
            1.0 (exclusive)
          </span>
        </div>

        {/* Threshold markers */}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥ 0.75
            (strong selectivity)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> ≥ 0.50
            (selective)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500" /> &lt; 0.50
            (non-selective)
          </span>
        </div>
      </motion.div>

      {/* Per-concept monosemantic neurons table */}
      <MonosemanticNeuronPanel
        neurons={monoNeurons}
        words={concept?.words.map((w) => w.word) ?? []}
        conceptName={presetOf(activeConcept)?.name ?? activeConcept}
      />

      {/* Statistical summary */}
      {significantCount > 0 && (
        <motion.div
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-xs text-emerald-300">
            <Sparkles size={12} className="inline mr-1" />
            <strong>{significantCount}</strong> of {monoNeurons.length}{" "}
            selective neurons pass Mann-Whitney U test (p &lt; 0.05) for{" "}
            <strong>{presetOf(activeConcept)?.name}</strong>. These neurons fire
            significantly more for this concept than for any other — statistical
            proof of monosemantic encoding in BDH's x_sparse path.
          </p>
        </motion.div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  5. INTERSECTION VIEW                                               */
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
/*  6. NEURON GRAPH VIEW                                               */
/* ================================================================== */
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
  head?: number;
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
  const [dims, setDims] = useState({ w: 900, h: 620 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [filterHead, setFilterHead] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(520, Math.min(width * 0.68, 720)) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { nodes, edges, headCounts, totalShared, totalUnique } = useMemo(() => {
    const words = result.words;
    const cx = dims.w / 2;
    const cy = dims.h / 2;

    const neuronAgg = new Map<
      string,
      {
        head: number;
        idx: number;
        totalVal: number;
        wordCount: number;
        words: Map<string, number>;
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
            existing.words.set(w.word, n.val);
          } else {
            neuronAgg.set(key, {
              head: h.head,
              idx: n.idx,
              totalVal: n.val,
              wordCount: 1,
              words: new Map([[w.word, n.val]]),
            });
          }
        });
      });
    });

    let shared = [...neuronAgg.entries()].filter(([, n]) => n.wordCount >= 2);
    const uniqueCount = neuronAgg.size - shared.length;

    if (filterHead !== null) {
      shared = shared.filter(([, n]) => n.head === filterHead);
    }

    shared.sort((a, b) =>
      b[1].wordCount !== a[1].wordCount
        ? b[1].wordCount - a[1].wordCount
        : b[1].totalVal - a[1].totalVal,
    );

    const topShared = shared.slice(0, 20);
    const maxVal = Math.max(1e-6, ...topShared.map(([, n]) => n.totalVal));

    const headCountsMap: Record<number, number> = {};
    shared.forEach(([, n]) => {
      headCountsMap[n.head] = (headCountsMap[n.head] || 0) + 1;
    });

    const outerR = Math.min(dims.w, dims.h) * 0.4;
    const innerR = Math.min(dims.w, dims.h) * 0.18;

    const nodeArr: GraphNode[] = [];
    const edgeList: GraphEdge[] = [];

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

    const hubsSortedByHead = [...topShared].sort(
      (a, b) => a[1].head - b[1].head,
    );
    hubsSortedByHead.forEach(([key, info], i) => {
      const angle = (2 * Math.PI * i) / hubsSortedByHead.length - Math.PI / 2;
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

      info.words.forEach((act, wName) => {
        const wIdx = words.findIndex((w) => w.word === wName);
        const wordColor = WORD_COLORS[wIdx % WORD_COLORS.length];
        edgeList.push({
          source: `w_${wName}`,
          target: key,
          color: wordColor,
          width: 1.5 + (act / maxVal) * 2.5,
          shared: true,
        });
      });
    });

    const sim = d3
      .forceSimulation(nodeArr as any[])
      .force(
        "collide",
        d3
          .forceCollide<any>()
          .radius((d: any) => (d.radius || 10) + 6)
          .strength(0.8),
      )
      .force(
        "radial",
        d3
          .forceRadial(
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

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

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

  const edgePath = useCallback((s: GraphNode, t: GraphNode) => {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return `M${s.x},${s.y} L${t.x},${t.y}`;
    const curvature = Math.min(dist * 0.15, 35);
    const mx = (s.x + t.x) / 2 - (dy / dist) * curvature;
    const my = (s.y + t.y) / 2 + (dx / dist) * curvature;
    return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
  }, []);

  const tooltipNode = hoveredNode ? nodeById.get(hoveredNode) : null;

  return (
    <motion.div
      ref={containerRef}
      className="glass-card p-5 overflow-hidden"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-bdh-accent" />
          <span className="text-sm font-semibold">
            Shared-Neuron Hub Graph — Layer {selectedLayer}
          </span>
        </div>
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

        {nodes.map((n, i) => {
          const isHoverActive = hoveredNode !== null;
          const isRelevant = hoveredNeighbors.has(n.id);
          const nodeOpacity = isHoverActive ? (isRelevant ? 1 : 0.12) : 1;
          const isWord = n.type === "word";
          const wordIdx = isWord
            ? result.words.findIndex((w) => `w_${w.word}` === n.id)
            : -1;

          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: nodeOpacity, scale: 1 }}
              transition={{ delay: i * 0.018, duration: 0.35 }}
              onMouseEnter={() => setHoveredNode(n.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer" }}
            >
              {isWord ? (
                <>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius}
                    fill={`url(#wg-${wordIdx % WORD_COLORS.length})`}
                    stroke={n.color}
                    strokeWidth="2.5"
                    strokeOpacity="0.6"
                    filter="url(#word-glow)"
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="800"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
                  >
                    {n.label}
                  </text>
                </>
              ) : (
                <>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius + 4}
                    fill="none"
                    stroke={n.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.2"
                    filter="url(#hub-glow)"
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.radius}
                    fill={`url(#hg-${(n.head ?? 0) % HEAD_COLORS.length})`}
                    stroke={n.color}
                    strokeWidth="2"
                    strokeOpacity="0.7"
                  />
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

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-gray-500">
          <span className="text-bdh-accent font-semibold">Hub neurons</span>{" "}
          fire for 2+ words — evidence of shared concept encoding. Hover any
          node to trace connections.
        </p>
        <span className="text-[10px] text-gray-600 font-mono">
          {nodes.filter((n) => n.type === "neuron").length} hubs ·{" "}
          {edges.length} links
        </span>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
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

  return (
    <motion.div
      className="glass-card p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
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
        perfectly exclusive. p-value from Mann-Whitney U test.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-2">Location</th>
              <th className="text-right py-2 px-2">Selectivity</th>
              <th className="text-right py-2 px-2">In</th>
              <th className="text-right py-2 px-2">Out</th>
              <th className="text-right py-2 px-2">p-value</th>
              {words.map((w, i) => (
                <th
                  key={w}
                  className="text-right py-2 px-2 font-mono"
                  style={{ color: WORD_COLORS[i % WORD_COLORS.length] }}
                >
                  {w}
                </th>
              ))}
              <th className="py-2 px-2">Selectivity</th>
            </tr>
          </thead>
          <tbody>
            {neurons.slice(0, 20).map((n, i) => (
              <motion.tr
                key={`${n.layer}-${n.head}-${n.neuron}`}
                className="border-b border-gray-800/50 hover:bg-gray-800/30"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
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
                </td>
                <td className="py-2 px-2 text-right font-mono">
                  <span
                    className={
                      n.p_value < 0.001
                        ? "text-emerald-400"
                        : n.p_value < 0.05
                          ? "text-amber-400"
                          : "text-gray-500"
                    }
                  >
                    {n.p_value < 0.001 ? "<0.001" : n.p_value.toFixed(3)}
                  </span>
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
                    <div
                      className="absolute top-0 bottom-0 w-px bg-gray-600"
                      style={{ left: "50%" }}
                      title="Chance level (0.50)"
                    />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
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
        <span className="ml-auto">Vertical line = chance (0.50)</span>
      </div>
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

  // Shared neurons across live-probed words
  const liveSharedNeurons = useMemo(() => {
    if (!liveResult || liveResult.words.length < 2) return null;
    const m = new Map<number, Set<number>>();
    const layer = liveResult.words[0]?.layers.find(
      (l) => l.layer === selectedLayer,
    );
    if (!layer) return null;

    layer.heads.forEach((h) => {
      const sets = liveResult.words.map((w) => {
        const wLayer = w.layers.find((l) => l.layer === selectedLayer);
        if (!wLayer) return new Set<number>();
        const wHead = wLayer.heads.find((hh) => hh.head === h.head);
        return new Set(wHead?.top_neurons.map((n) => n.idx) ?? []);
      });
      const intersection = new Set<number>();
      const first = sets[0];
      first.forEach((idx) => {
        if (sets.every((s) => s.has(idx))) intersection.add(idx);
      });
      if (intersection.size > 0) m.set(h.head, intersection);
    });
    return m.size > 0 ? m : null;
  }, [liveResult, selectedLayer]);

  const totalSharedCount = useMemo(() => {
    if (!liveSharedNeurons) return 0;
    let count = 0;
    liveSharedNeurons.forEach((s) => (count += s.size));
    return count;
  }, [liveSharedNeurons]);

  // Category affinity
  const categoryOverlap = useMemo(() => {
    if (!liveResult || !precomputed) return null;
    if (liveResult.words.length === 0) return null;

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
      if (sims.length > 0)
        overlaps.push({
          concept: cid,
          similarity: sims.reduce((a, b) => a + b, 0) / sims.length,
        });
    });
    overlaps.sort((a, b) => b.similarity - a.similarity);
    return overlaps;
  }, [liveResult, precomputed, selectedLayer]);

  return (
    <motion.div
      className="glass-card p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Search size={16} className="text-bdh-accent" />
        <span className="text-sm font-semibold">Try It Yourself</span>
        <span className="text-[10px] text-gray-500 ml-2">
          Probe the model with your own words
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl border border-gray-700/50 bg-gray-900/40">
        {words.map((w) => (
          <span
            key={w}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-sm font-mono text-cyan-400"
          >
            {w}
            <button
              onClick={() => removeWord(w)}
              className="text-cyan-400/50 hover:text-cyan-300 ml-0.5"
            >
              <X size={12} />
            </button>
          </span>
        ))}
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
                      highlightNeurons={liveSharedNeurons?.get(h.head)}
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
/*  MAIN PAGE                                                          */
/* ================================================================== */
export function MonosemanticityPage() {
  const [precomputed, setPrecomputed] = useState<PrecomputedData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState(5);
  const [viewTab, setViewTab] = useState<ViewTab>("similarity");
  const [activeConcept, setActiveConcept] = useState("currencies");
  const [intersectionConcept, setIntersectionConcept] = useState("currencies");

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
          <p className="text-sm text-gray-500 text-center max-w-md">
            Run{" "}
            <code className="px-2 py-1 bg-gray-800 rounded text-xs font-mono text-bdh-accent">
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

  const currentTab = VIEW_TABS.find((t) => t.id === viewTab)!;

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
          by design. Same-concept words activate the same sparse x_sparse
          subset. Six views reveal this — from similarity proof to synapse
          tracking to statistical selectivity analysis.
        </p>
      </motion.div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <LayerSelector
          nLayers={nLayers}
          selected={selectedLayer}
          onChange={setSelectedLayer}
          bestLayer={bestLayer}
        />

        <div className="flex gap-1 bg-gray-900/60 rounded-xl p-1 border border-gray-800/50 flex-wrap">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewTab === tab.id
                  ? "bg-bdh-accent text-white shadow-lg shadow-bdh-accent/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/40"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Narrative step */}
      <motion.div
        className="mb-5 flex items-start gap-3 p-3 rounded-xl bg-gray-900/30 border border-gray-800/30"
        key={viewTab}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Info size={14} className="text-bdh-accent mt-0.5 shrink-0" />
        <div>
          <span className="text-[10px] text-bdh-accent font-bold uppercase tracking-wider">
            Step {VIEW_TABS.findIndex((t) => t.id === viewTab) + 1} of{" "}
            {VIEW_TABS.length}
          </span>
          <span className="text-gray-600 mx-2">·</span>
          <span className="text-xs text-gray-400">{currentTab.narrative}</span>
        </div>
      </motion.div>

      {/* Active view */}
      <div className="mb-6">
        <AnimatePresence mode="wait">
          {viewTab === "similarity" && (
            <motion.div
              key="sim"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
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
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <CrossConceptView
                crossPairs={precomputed.cross_concept}
                concepts={precomputed.concepts}
                selectedLayer={selectedLayer}
              />
            </motion.div>
          )}
          {viewTab === "synapseTracking" && (
            <motion.div
              key="syntrack"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <SynapseTrackingView
                tracking={precomputed.synapse_tracking ?? {}}
                activeConcept={activeConcept}
                setActiveConcept={setActiveConcept}
              />
            </motion.div>
          )}
          {viewTab === "selectivity" && (
            <motion.div
              key="selectivity"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <SelectivityView
                selectivity={precomputed.selectivity}
                concepts={precomputed.concepts}
                activeConcept={activeConcept}
                setActiveConcept={setActiveConcept}
              />
            </motion.div>
          )}
          {viewTab === "intersection" && (
            <motion.div
              key="inter"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const p = presetOf(cid);
                  const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
                  return (
                    <button
                      key={cid}
                      onClick={() => setIntersectionConcept(cid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        intersectionConcept === cid
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
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(precomputed.concepts).map(([cid]) => {
                  const p = presetOf(cid);
                  const c = CONCEPT_COLORS[cid] ?? "#8b5cf6";
                  return (
                    <button
                      key={cid}
                      onClick={() => setActiveConcept(cid)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        activeConcept === cid
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

      {/* Insight banner */}
      <motion.div
        className="mt-6 glass-card p-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-bdh-accent" />
          What You're Seeing — Sparse Concept Fingerprinting
        </h3>
        <p className="text-gray-400 text-xs leading-relaxed">
          Every visualization shows{" "}
          <span className="text-amber-400 font-semibold">
            x_sparse = ReLU(input × Encoder)
          </span>{" "}
          — the clean "concept fingerprint" before attention and Hebbian
          updates. This is the pure encoding path. The{" "}
          <span className="text-cyan-400 font-semibold">Synapse Tracking</span>{" "}
          view shows how specific neurons activate token-by-token through full
          sentences. The{" "}
          <span className="text-emerald-400 font-semibold">Selectivity</span>{" "}
          view uses Mann-Whitney U tests to statistically prove neurons are
          concept-exclusive. Across{" "}
          <span className="text-white font-medium">
            {precomputed.model_info.n_neurons.toLocaleString()} neurons per head
          </span>
          , same-concept words activate the same sparse ~5% subset. That's
          monosemanticity — you can point at a neuron and know what concept it
          encodes. Transformers can't do this.
        </p>
      </motion.div>

      {/* Divider */}
      <div className="relative my-10">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-800/50" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-4 py-1 bg-gray-950 text-[10px] text-gray-500 uppercase tracking-wider rounded-full border border-gray-800/50">
            Live Exploration
          </span>
        </div>
      </div>

      {/* Try It Yourself */}
      <TryItYourself precomputed={precomputed} selectedLayer={selectedLayer} />
    </div>
  );
}
