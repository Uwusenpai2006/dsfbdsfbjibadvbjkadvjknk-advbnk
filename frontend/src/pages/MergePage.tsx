import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  GitMerge,
  Check,
  Sparkles,
  Zap,
  Loader2,
  Brain,
  BarChart3,
  FileText,
  AlertCircle,
  Terminal,
} from "lucide-react";

/* ================================================================== */
/*  Types — matched to merge_data.json from analysis/merge.py          */
/* ================================================================== */
interface ModelInfo {
  name: string;
  flag: string;
  params: number;
  n_neurons: number;
  n_heads: number;
  n_layers: number;
  n_embd: number;
}
interface Heritage {
  model1_name: string;
  model2_name: string;
  neurons_per_head_original: number;
  neurons_per_head_merged: number;
  total_neurons_per_model: number;
  total_neurons_merged: number;
  ranges: Record<string, { start: number; end: number }>;
}
interface EvalResult {
  french_loss: number | null;
  portuguese_loss: number | null;
}
interface Sample {
  label: string;
  prompt: string;
  generated: string;
}
interface MergeData {
  heritage: Heritage;
  models: Record<string, ModelInfo>;
  evaluation: Record<string, EvalResult>;
  samples: Sample[];
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function fmtParams(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
function fmtNeurons(n: number): string {
  return n.toLocaleString();
}
function lossColor(v: number | null): string {
  if (v === null) return "text-gray-500";
  if (v < 1.0) return "text-emerald-400";
  if (v < 2.0) return "text-amber-400";
  return "text-red-400";
}

/* ================================================================== */
/*  Section 1: Merge Process Diagram (animated)                        */
/* ================================================================== */
function MergeDiagram({
  data,
  step,
  setStep,
}: {
  data: MergeData | null;
  step: number;
  setStep: (s: number) => void;
}) {
  const m1 = data?.models[data.heritage.model1_name];
  const m2 = data?.models[data.heritage.model2_name];
  const merged = data?.models.merged;
  const N = data?.heritage.neurons_per_head_original ?? 8192;
  const N2 = data?.heritage.neurons_per_head_merged ?? 16384;

  const steps = [
    {
      title: m1?.name ?? "Model A",
      desc: "Specialist",
      icon: m1?.flag ?? "🇫🇷",
    },
    {
      title: m2?.name ?? "Model B",
      desc: "Specialist",
      icon: m2?.flag ?? "🇵🇹",
    },
    { title: "Merge", desc: "Concatenate N", icon: "🔀" },
    { title: "Polyglot", desc: "Both languages", icon: "🌍" },
  ];

  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-5 flex items-center gap-2">
        <GitMerge size={14} className="text-bdh-accent" />
        Merge Process
      </h2>

      {/* Step indicators */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <motion.button
              onClick={() => setStep(i)}
              className="flex flex-col items-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 transition-all text-xl ${
                  i < step
                    ? "bg-emerald-500/20 border-2 border-emerald-500/50"
                    : i === step
                      ? "bg-bdh-accent/20 border-2 border-bdh-accent ring-4 ring-bdh-accent/15"
                      : "bg-gray-800/50 border-2 border-gray-700/50"
                }`}
              >
                {i < step ? (
                  <Check size={20} className="text-emerald-400" />
                ) : (
                  s.icon
                )}
              </div>
              <span
                className={`text-xs font-semibold ${i <= step ? "text-white" : "text-gray-500"}`}
              >
                {s.title}
              </span>
              <span className="text-[10px] text-gray-500">{s.desc}</span>
            </motion.button>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-3 rounded ${i < step ? "bg-emerald-500/50" : "bg-gray-700/50"}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Animated visual */}
      <div className="relative h-72 overflow-hidden">
        {/* Model A */}
        <motion.div
          className="absolute left-4 top-4 w-60 rounded-xl p-4 border-2 border-blue-500/40 bg-blue-500/8"
          animate={{
            x: step >= 2 ? 80 : 0,
            y: step >= 2 ? 50 : 0,
            scale: step >= 2 ? 0.75 : 1,
            opacity: step >= 3 ? 0.3 : 1,
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{m1?.flag ?? "🇫🇷"}</span>
            <span className="font-bold text-blue-400 text-sm">
              {m1?.name ?? "French"}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 space-y-1">
            <div>
              Neurons/head:{" "}
              <span className="text-blue-300 font-mono">{fmtNeurons(N)}</span>
            </div>
            <div>
              Params:{" "}
              <span className="text-blue-300 font-mono">
                {fmtParams(m1?.params ?? 0)}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-8 gap-0.5">
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-sm bg-blue-500/40" />
            ))}
          </div>
        </motion.div>

        {/* Model B */}
        <motion.div
          className="absolute right-4 top-4 w-60 rounded-xl p-4 border-2 border-emerald-500/40 bg-emerald-500/8"
          animate={{
            x: step >= 2 ? -80 : 0,
            y: step >= 2 ? 50 : 0,
            scale: step >= 2 ? 0.75 : 1,
            opacity: step >= 3 ? 0.3 : 1,
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{m2?.flag ?? "🇵🇹"}</span>
            <span className="font-bold text-emerald-400 text-sm">
              {m2?.name ?? "Portuguese"}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 space-y-1">
            <div>
              Neurons/head:{" "}
              <span className="text-emerald-300 font-mono">
                {fmtNeurons(N)}
              </span>
            </div>
            <div>
              Params:{" "}
              <span className="text-emerald-300 font-mono">
                {fmtParams(m2?.params ?? 0)}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-8 gap-0.5">
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40"
              />
            ))}
          </div>
        </motion.div>

        {/* Merge icon */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
          animate={{
            scale: step === 2 ? [1, 1.3, 1] : step >= 3 ? 0.8 : 0,
            opacity: step >= 2 ? 1 : 0,
          }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-16 h-16 rounded-full bg-bdh-accent/20 border-2 border-bdh-accent flex items-center justify-center shadow-lg shadow-bdh-accent/20">
            <GitMerge size={28} className="text-bdh-accent" />
          </div>
        </motion.div>

        {/* Merged model */}
        <motion.div
          className="absolute left-1/2 bottom-2 -translate-x-1/2 w-72 rounded-xl p-4 border-2 border-purple-500/40 bg-purple-500/8"
          animate={{
            opacity: step >= 3 ? 1 : 0,
            y: step >= 3 ? 0 : 40,
            scale: step >= 3 ? 1 : 0.9,
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🌍</span>
            <span className="font-bold text-purple-400 text-sm">
              Merged Polyglot
            </span>
          </div>
          <div className="text-[11px] text-gray-400">
            Neurons/head:{" "}
            <span className="text-purple-300 font-mono">{fmtNeurons(N2)}</span>
            {" · "}
            Params:{" "}
            <span className="text-purple-300 font-mono">
              {fmtParams(merged?.params ?? 0)}
            </span>
          </div>
          <div
            className="mt-2 grid gap-[2px]"
            style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
          >
            {Array.from({ length: 48 }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-sm ${i < 24 ? "bg-blue-500/40" : "bg-emerald-500/40"}`}
              />
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-blue-500/50" />
              <span className="text-gray-500">
                {m1?.name ?? "French"} neurons
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500/50" />
              <span className="text-gray-500">
                {m2?.name ?? "Portuguese"} neurons
              </span>
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  Section 2: Loss Comparison Table                                   */
/* ================================================================== */
function LossTable({ data }: { data: MergeData }) {
  const { evaluation, heritage, models } = data;
  const name1 = heritage.model1_name;
  const name2 = heritage.model2_name;
  const m1 = models[name1];
  const m2 = models[name2];

  const rows = [
    {
      key: name1,
      label: m1?.name ?? name1,
      flag: m1?.flag ?? "🇫🇷",
      color: "blue",
    },
    {
      key: name2,
      label: m2?.name ?? name2,
      flag: m2?.flag ?? "🇵🇹",
      color: "emerald",
    },
    { key: "merged", label: "Merged Polyglot", flag: "🌍", color: "purple" },
  ];

  const hasEval = Object.keys(evaluation).length > 0;

  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <BarChart3 size={14} className="text-bdh-accent" />
        Loss Comparison
        <span className="text-[10px] text-gray-500 font-normal ml-2">
          Next-byte prediction loss (lower = better)
        </span>
      </h2>

      {!hasEval ? (
        <div className="text-center py-8 text-gray-500">
          <AlertCircle size={24} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            Run evaluation after merging to populate this table.
          </p>
          <code className="text-xs text-bdh-accent/70 mt-2 block">
            python analysis/merge.py --model1 ... --model2 ... --output ...
          </code>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-3 text-gray-500 font-semibold">
                  Model
                </th>
                <th className="text-right py-3 px-3 text-blue-400 font-semibold">
                  French Loss
                </th>
                <th className="text-right py-3 px-3 text-emerald-400 font-semibold">
                  Portuguese Loss
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const ev = evaluation[row.key];
                const isMerged = row.key === "merged";
                return (
                  <motion.tr
                    key={row.key}
                    className={`border-b border-gray-800/40 ${isMerged ? "bg-purple-500/5" : ""}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{row.flag}</span>
                        <span
                          className={`font-semibold ${isMerged ? "text-purple-400" : "text-gray-200"}`}
                        >
                          {row.label}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold ${lossColor(ev?.french_loss ?? null)}`}
                    >
                      {ev?.french_loss != null
                        ? ev.french_loss.toFixed(4)
                        : "—"}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono font-bold ${lossColor(ev?.portuguese_loss ?? null)}`}
                    >
                      {ev?.portuguese_loss != null
                        ? ev.portuguese_loss.toFixed(4)
                        : "—"}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasEval && (
        <motion.div
          className="mt-4 p-3 rounded-xl bg-purple-500/8 border border-purple-500/15"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-xs text-purple-300/80 leading-relaxed">
            <Sparkles size={12} className="inline mr-1" />
            Each specialist excels at its own language but fails at the other.
            The merged model handles{" "}
            <strong className="text-white">both languages</strong> — without any
            fine-tuning. This is BDH's compositional advantage.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ================================================================== */
/*  Section 3: Sample Generations                                      */
/* ================================================================== */
function SampleGenerations({ data }: { data: MergeData }) {
  const { samples } = data;

  if (!samples || samples.length === 0) {
    return (
      <motion.div
        className="glass-card p-6 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileText size={14} className="text-bdh-accent" />
          Sample Generations
        </h2>
        <p className="text-sm text-gray-500 text-center py-6">
          Samples will appear after running the merge pipeline.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <FileText size={14} className="text-bdh-accent" />
        Sample Generations
        <span className="text-[10px] text-gray-500 font-normal ml-2">
          From the merged polyglot model
        </span>
      </h2>

      <div className="space-y-3">
        {samples.map((s, i) => (
          <motion.div
            key={i}
            className="rounded-xl p-4 bg-gray-900/40 border border-gray-800/40"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-bdh-accent/70 bg-bdh-accent/10 px-2 py-0.5 rounded">
                {s.label}
              </span>
            </div>
            <div className="font-mono text-sm leading-relaxed">
              <span className="text-cyan-400">{s.prompt}</span>
              <span className="text-gray-300">
                {s.generated.slice(s.prompt.length)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  Section 4: Neuron Heritage Map                                     */
/* ================================================================== */
function HeritageMap({ data }: { data: MergeData }) {
  const { heritage } = data;
  const N = heritage.neurons_per_head_original;
  const N2 = heritage.neurons_per_head_merged;
  const totalPerModel = heritage.total_neurons_per_model;

  // Generate a representative strip of neurons
  const stripSize = 120;
  const neurons = useMemo(() => {
    return Array.from({ length: stripSize }, (_, i) => {
      const neuronIdx = Math.floor((i / stripSize) * N2);
      return {
        idx: neuronIdx,
        origin: neuronIdx < N ? heritage.model1_name : heritage.model2_name,
        color: neuronIdx < N ? "blue" : "emerald",
      };
    });
  }, [N, N2, heritage]);

  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Brain size={14} className="text-bdh-accent" />
        Neuron Heritage Map
      </h2>

      <p className="text-xs text-gray-500 mb-4">
        Each neuron in the merged model traces back to exactly one specialist.
        {heritage.model1_name.charAt(0).toUpperCase() +
          heritage.model1_name.slice(1)}{" "}
        neurons occupy indices 0–{fmtNeurons(N - 1)},{" "}
        {heritage.model2_name.charAt(0).toUpperCase() +
          heritage.model2_name.slice(1)}{" "}
        neurons occupy {fmtNeurons(N)}–{fmtNeurons(N2 - 1)}.
      </p>

      {/* Visual neuron strip */}
      <div className="mb-4">
        <div className="flex gap-[1px] h-8 rounded-lg overflow-hidden">
          {neurons.map((n, i) => (
            <motion.div
              key={i}
              className="flex-1"
              style={{
                backgroundColor:
                  n.color === "blue"
                    ? "rgba(59,130,246,0.5)"
                    : "rgba(16,185,129,0.5)",
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.003, duration: 0.2 }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[9px] font-mono text-gray-500">
          <span>0</span>
          <span className="text-blue-400/60">← {heritage.model1_name} →</span>
          <span>{fmtNeurons(N)}</span>
          <span className="text-emerald-400/60">
            ← {heritage.model2_name} →
          </span>
          <span>{fmtNeurons(N2)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-blue-500/8 border border-blue-500/15 p-3 text-center">
          <div className="text-lg font-mono font-bold text-blue-400">
            {fmtNeurons(totalPerModel)}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            {heritage.model1_name} neurons
          </div>
        </div>
        <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 p-3 text-center">
          <div className="text-lg font-mono font-bold text-emerald-400">
            {fmtNeurons(totalPerModel)}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            {heritage.model2_name} neurons
          </div>
        </div>
        <div className="rounded-lg bg-purple-500/8 border border-purple-500/15 p-3 text-center">
          <div className="text-lg font-mono font-bold text-purple-400">
            {fmtNeurons(heritage.total_neurons_merged)}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">
            merged total
          </div>
        </div>
      </div>

      <motion.div
        className="mt-4 p-3 rounded-xl bg-bdh-accent/8 border border-bdh-accent/15"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-xs text-bdh-accent/80 leading-relaxed">
          <Sparkles size={12} className="inline mr-1" />
          In a transformer, you'd need to retrain from scratch to combine
          knowledge. BDH's sparse, modular neuron space allows{" "}
          <strong className="text-white">direct concatenation</strong> — each
          specialist's neurons operate independently in the merged model.
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ================================================================== */
/*  Section 5: Model Stats Cards                                       */
/* ================================================================== */
function ModelCards({ data }: { data: MergeData }) {
  const { models, heritage, evaluation } = data;
  const name1 = heritage.model1_name;
  const name2 = heritage.model2_name;

  const cards = [
    { key: name1, ring: "ring-blue-500/30", accent: "text-blue-400" },
    { key: name2, ring: "ring-emerald-500/30", accent: "text-emerald-400" },
    { key: "merged", ring: "ring-purple-500/30", accent: "text-purple-400" },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6">
      {cards.map((c, i) => {
        const m = models[c.key];
        const ev = evaluation[c.key];
        if (!m) return null;
        const isMerged = c.key === "merged";
        return (
          <motion.div
            key={c.key}
            className={`glass-card p-5 ${isMerged ? `ring-2 ${c.ring}` : ""}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.08 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{m.flag}</span>
              <h3 className={`font-bold ${c.accent}`}>{m.name}</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Parameters</span>
                <span className="font-mono">{fmtParams(m.params)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Neurons/Head</span>
                <span className="font-mono">{fmtNeurons(m.n_neurons)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Layers × Heads</span>
                <span className="font-mono">
                  {m.n_layers} × {m.n_heads}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Embedding dim</span>
                <span className="font-mono">{m.n_embd}</span>
              </div>
              {ev && (
                <>
                  <div className="border-t border-gray-800/40 my-2" />
                  <div className="flex justify-between">
                    <span className="text-gray-400">French loss</span>
                    <span
                      className={`font-mono font-bold ${lossColor(ev.french_loss)}`}
                    >
                      {ev.french_loss?.toFixed(4) ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Portuguese loss</span>
                    <span
                      className={`font-mono font-bold ${lossColor(ev.portuguese_loss)}`}
                    >
                      {ev.portuguese_loss?.toFixed(4) ?? "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Why This Matters — insight panel                                   */
/* ================================================================== */
function InsightPanel() {
  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
        <Sparkles size={14} className="text-bdh-accent" />
        Why This Matters
      </h3>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h4 className="text-sm font-semibold text-red-400 mb-2">
            ❌ Transformers Can't Do This
          </h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            Transformer weights are densely interconnected — every neuron talks
            to every other. Concatenating two transformer models produces
            garbage. Any "merging" requires expensive fine-tuning, distillation,
            or careful weight interpolation.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-emerald-400 mb-2">
            ✅ BDH Does It Naturally
          </h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            BDH's sparse, modular architecture means neurons operate
            independently. Concatenating two models is as simple as stacking
            their neuron spaces and averaging shared parameters. No fine-tuning
            needed.
          </p>
        </div>
      </div>
      <div className="mt-4 p-3 bg-bdh-accent/10 border border-bdh-accent/25 rounded-xl">
        <p className="text-xs text-bdh-accent leading-relaxed">
          <Zap size={12} className="inline mr-1" />
          <strong>Implication:</strong> Train specialists for specific tasks,
          merge them freely. This enables{" "}
          <span className="text-white font-semibold">
            modular AI development
          </span>{" "}
          — a paradigm impossible with current transformer architectures.
        </p>
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  How To Run — instructions for user                                 */
/* ================================================================== */
function HowToRun() {
  const steps = [
    {
      title: "Train Portuguese model",
      cmd: "python training/train.py --config training/configs/portuguese.yaml",
      note: "Architecture must match French model exactly",
    },
    {
      title: "Run merge",
      cmd: "python analysis/merge.py \\\n  --model1 checkpoints/french_specialist/checkpoint_best.pt \\\n  --model2 checkpoints/portuguese_specialist/checkpoint_best.pt \\\n  --output checkpoints/merged_polyglot.pt",
      note: "Concatenates neuron spaces + evaluates on both languages",
    },
    {
      title: "Refresh this page",
      cmd: "",
      note: "The merge script generates merge_data.json automatically",
    },
  ];

  return (
    <motion.div
      className="glass-card p-6 mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Terminal size={14} className="text-bdh-accent" />
        How to Run the Merge Pipeline
      </h2>
      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-bdh-accent/15 border border-bdh-accent/30 flex items-center justify-center text-xs font-bold text-bdh-accent shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-200 mb-1">
                {s.title}
              </div>
              {s.cmd && (
                <code className="block text-xs text-bdh-accent/80 bg-gray-900/60 rounded-lg p-2 font-mono whitespace-pre-wrap">
                  {s.cmd}
                </code>
              )}
              <p className="text-[11px] text-gray-500 mt-1">{s.note}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */
export function MergePage() {
  const [data, setData] = useState<MergeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mergeStep, setMergeStep] = useState(0);

  // Auto-advance merge animation
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      setMergeStep((s) => (s < 3 ? s + 1 : s));
    }, 1200);
    return () => clearInterval(timer);
  }, [data]);

  // Load precomputed data
  useEffect(() => {
    fetch("/merge/merge_data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MergeData) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-bdh-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-3xl font-bold mb-1">
          <span className="gradient-text">Model Merging</span> Explorer
        </h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          Combine separately trained specialists into a unified polyglot model —
          impossible with transformers, natural with BDH's modular neuron space.
        </p>
      </motion.div>

      {/* If no data, show instructions */}
      {!data ? (
        <>
          <MergeDiagram data={null} step={mergeStep} setStep={setMergeStep} />
          <HowToRun />
          <InsightPanel />
        </>
      ) : (
        <>
          {/* Data-driven sections */}
          <MergeDiagram data={data} step={mergeStep} setStep={setMergeStep} />
          <ModelCards data={data} />
          <LossTable data={data} />
          <SampleGenerations data={data} />
          <HeritageMap data={data} />
          <InsightPanel />
        </>
      )}
    </div>
  );
}
