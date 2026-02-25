import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, AlertCircle, Wifi, WifiOff, Send, Cloud } from "lucide-react";
import { hfBackend } from "../utils/api";

interface LiveInferenceProps {
  onDataReceived?: (data: any) => void;
}

export function LiveInference({ onDataReceived }: LiveInferenceProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const [isHfOnline, setIsHfOnline] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [usedBackend, setUsedBackend] = useState<"huggingface" | "local" | null>(null);

  // Check if backends are available
  useEffect(() => {
    checkHfStatus();
    checkServerStatus();
    const interval = setInterval(() => {
      checkHfStatus();
      checkServerStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check HuggingFace backend (PRIMARY)
  const checkHfStatus = async () => {
    try {
      const health = await hfBackend.checkHealth();
      setIsHfOnline(health.model_loaded);
    } catch {
      setIsHfOnline(false);
    }
  };

  // Check local backend (FALLBACK)
  const checkServerStatus = async () => {
    try {
      const response = await fetch("/health", {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      setIsServerOnline(response.ok);
    } catch {
      setIsServerOnline(false);
    }
  };

  const hasAnyBackend = isHfOnline || isServerOnline;
  const activeBackend = isHfOnline ? "huggingface" : isServerOnline ? "local" : "none";

  const runInference = async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setError(null);
    setGeneratedText(null);
    setLastResult(null);
    setUsedBackend(null);

    // TRY 1: HuggingFace (primary)
    try {
      const result = await hfBackend.generate(inputText, 100, 1.0, 3);
      setGeneratedText(result.generated_text);
      setUsedBackend("huggingface");
      onDataReceived?.({
        generated_text: result.generated_text,
        tokens_generated: result.tokens_generated,
        source: "huggingface",
      });
      setIsLoading(false);
      return;
    } catch (hfErr) {
      console.warn("HuggingFace failed, trying local backend:", hfErr);
    }

    // TRY 2: Local backend (fallback)
    try {
      const response = await fetch("/api/inference/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Inference failed");
      }

      const data = await response.json();
      setLastResult(data);
      setUsedBackend("local");
      onDataReceived?.(data);
      setIsLoading(false);
      return;
    } catch (localErr) {
      console.warn("Local backend also failed:", localErr);
    }

    // BOTH FAILED
    setError("Both HuggingFace and local backends are unavailable. HuggingFace may be waking up — try again in ~30 seconds.");
    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runInference();
    }
  };

  return (
    <div className="glass-card p-6">
      {/* Header with status indicator */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap size={20} className="text-bdh-accent" />
          Live Inference
        </h3>

        <div className="flex items-center gap-3">
          {/* HuggingFace status (PRIMARY) */}
          {isHfOnline === null ? (
            <span className="text-[#4A5568] text-sm flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" />
              HF...
            </span>
          ) : isHfOnline ? (
            <span className="text-blue-400 text-sm flex items-center gap-1">
              <Cloud size={14} />
              HF Online
            </span>
          ) : (
            <span className="text-[#4A5568] text-sm flex items-center gap-1">
              <Cloud size={14} />
              HF Off
            </span>
          )}

          {/* Local backend status (FALLBACK) */}
          {isServerOnline === null ? (
            <span className="text-[#4A5568] text-sm flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" />
            </span>
          ) : isServerOnline ? (
            <span className="text-green-400 text-sm flex items-center gap-1">
              <Wifi size={14} />
              Local
            </span>
          ) : (
            <span className="text-[#4A5568] text-sm flex items-center gap-1">
              <WifiOff size={14} />
              Local Off
            </span>
          )}
        </div>
      </div>

      {/* Active backend indicator */}
      {hasAnyBackend && (
        <div className="mb-3 text-xs text-[#4A5568]">
          Primary:{" "}
          <span className={activeBackend === "huggingface" ? "text-blue-400" : "text-green-400"}>
            {activeBackend === "huggingface"
              ? "HuggingFace (deployed model)"
              : "Local Backend (fallback)"}
          </span>
        </div>
      )}

      {/* Both offline warning */}
      {hasAnyBackend === false && isHfOnline !== null && isServerOnline !== null && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-sm"
        >
          <p className="text-orange-300 flex items-center gap-2">
            <AlertCircle size={16} />
            No backends available. HuggingFace may be waking up (~30s after inactivity).
          </p>
        </motion.div>
      )}

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type any text to analyze (e.g., 'The capital of France is Paris')"
          className="input-field flex-1"
          disabled={!hasAnyBackend || isLoading}
        />
        <button
          onClick={runInference}
          disabled={!hasAnyBackend || isLoading || !inputText.trim()}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
          Run
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generated text result (from HuggingFace) */}
      {generatedText && usedBackend === "huggingface" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-white/[0.03] rounded-lg border border-blue-500/20"
        >
          <div className="text-xs text-blue-400 mb-2 flex items-center gap-1">
            <Cloud size={12} />
            Generated via HuggingFace
          </div>
          <pre className="text-sm text-[#E2E8F0] whitespace-pre-wrap font-mono leading-relaxed">
            {generatedText}
          </pre>
        </motion.div>
      )}

      {/* Quick stats from last result (from local backend) */}
      {lastResult && usedBackend === "local" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 grid grid-cols-3 gap-4"
        >
          <div className="p-3 bg-white/[0.03] rounded-lg text-center">
            <div className="text-2xl font-bold text-bdh-accent">
              {(lastResult.overall_sparsity * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-[#8B95A5]">Sparsity</div>
          </div>
          <div className="p-3 bg-white/[0.03] rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">
              {lastResult.input_tokens.length}
            </div>
            <div className="text-xs text-[#8B95A5]">Tokens</div>
          </div>
          <div className="p-3 bg-white/[0.03] rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">
              {lastResult.frames.length}
            </div>
            <div className="text-xs text-[#8B95A5]">Frames</div>
          </div>
        </motion.div>
      )}

      {/* Example prompts */}
      <div className="mt-4">
        <p className="text-xs text-[#4A5568] mb-2">Try these examples:</p>
        <div className="flex flex-wrap gap-2">
          {[
            "The European Parliament",
            "<F:en>Hello world<T:fr>",
            "100 euros and 50 dollars",
            "France, Germany, and Spain",
          ].map((example) => (
            <button
              key={example}
              onClick={() => setInputText(example)}
              className="px-2 py-1 text-xs bg-white/5 hover:bg-white/10 rounded text-[#8B95A5] hover:text-[#E2E8F0] transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
