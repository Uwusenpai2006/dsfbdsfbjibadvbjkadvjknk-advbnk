import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Zap, RefreshCw, AlertCircle } from "lucide-react";

export function SparsityPage() {
  const [inputText, setInputText] = useState(
    "The European Parliament adopted the resolution.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [comparisonData, setComparisonData] = useState<{
    bdh: { sparsity: number; activeNeurons: number; totalNeurons: number };
    transformer: {
      sparsity: number;
      activeNeurons: number;
      totalNeurons: number;
    };
  } | null>(null);

  // Demo data fallback
  const demoData = {
    bdh: { sparsity: 0.947, activeNeurons: 1732, totalNeurons: 32768 },
    transformer: { sparsity: 0.05, activeNeurons: 31130, totalNeurons: 32768 },
  };

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try API first
      const response = await fetch("/api/inference/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          model_name: "french",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const totalNeurons =
          data.num_heads * data.neurons_per_head * data.num_layers;
        const activeNeurons = Math.round(
          totalNeurons * (1 - data.overall_sparsity),
        );

        setComparisonData({
          bdh: {
            sparsity: data.overall_sparsity,
            activeNeurons,
            totalNeurons,
          },
          // Transformer comparison (simulated - they don't have real sparsity)
          transformer: {
            sparsity: 0.05,
            activeNeurons: Math.round(totalNeurons * 0.95),
            totalNeurons,
          },
        });
        setIsLiveMode(true);
        setIsLoading(false);
        return;
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(`API Error: ${errData.detail || response.statusText}`);
      }
    } catch (err) {
      setError("Backend offline - showing demo data");
    }

    // Fall back to demo data
    setComparisonData(demoData);
    setIsLiveMode(false);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen p-8" style={{ background: '#070D12' }}>
      {/* Error display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg text-[#8B95A5] flex items-center gap-2 text-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Mode indicator */}
      {comparisonData && (
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              isLiveMode
                ? "text-[#00C896]"
                : "text-[#6B7280]"
            }`}
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {isLiveMode ? "Live API" : "Demo Mode"}
          </span>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 text-[#E2E8F0]">
          Sparse Brain <span className="text-[#00C896]">Comparator</span>
        </h1>
        <p className="text-[#8B95A5] text-sm">
          Compare BDH's ~5% activation rate with Transformer's ~95%.
        </p>
      </div>

      {/* Input */}
      <div className="card-interactive p-6 mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Enter text to compare..."
            className="input-field flex-1"
          />
          <button
            onClick={handleAnalyze}
            className="btn-primary flex items-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <Zap size={18} />
            )}
            Analyze
          </button>
        </div>
      </div>

      {/* Comparison */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* BDH */}
        <div className="card-interactive p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xl">🐉</span>
            <div>
              <h2 className="text-lg font-semibold text-[#E2E8F0]">BDH</h2>
              <p className="text-[#6B7280] text-sm">Baby Dragon Hatchling</p>
            </div>
          </div>

          {/* Sparsity visualization */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-[#8B95A5]">Sparsity</span>
              <span className="text-white font-bold">
                {comparisonData
                  ? `${(comparisonData.bdh.sparsity * 100).toFixed(1)}%`
                  : "--"}
              </span>
            </div>
            <div className="h-3 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full bg-[#00C896] rounded"
                style={{
                  width: comparisonData
                    ? `${comparisonData.bdh.sparsity * 100}%`
                    : "0%",
                  boxShadow: '0 0 8px rgba(0,200,150,0.4)',
                }}
              />
            </div>
          </div>

          {/* Neuron grid */}
          <div className="mb-4">
            <p className="text-[#6B7280] text-sm mb-2">
              Neuron activations (sample of 400)
            </p>
            <div className="grid grid-cols-20 gap-0.5">
              {Array.from({ length: 400 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-sm"
                  style={{
                    background: i <
                    (comparisonData
                      ? 400 * (1 - comparisonData.bdh.sparsity)
                      : 20)
                      ? '#00C896'
                      : 'rgba(255,255,255,0.04)',
                    boxShadow: i <
                    (comparisonData
                      ? 400 * (1 - comparisonData.bdh.sparsity)
                      : 20)
                      ? '0 0 4px rgba(0,200,150,0.5)'
                      : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-2xl font-bold text-[#E2E8F0]">
              {comparisonData
                ? comparisonData.bdh.activeNeurons.toLocaleString()
                : "--"}
            </div>
            <div className="text-[#8B95A5] text-sm">active neurons</div>
            <div className="text-[#6B7280] text-xs mt-1">
              out of {comparisonData?.bdh.totalNeurons.toLocaleString() || "--"}
            </div>
          </div>
        </div>

        {/* Transformer */}
        <div className="card-interactive p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <BarChart3 size={20} className="text-[#6B7280]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#E2E8F0]">Transformer</h2>
              <p className="text-[#6B7280] text-sm">Standard architecture</p>
            </div>
          </div>

          {/* Sparsity visualization */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-[#8B95A5]">Sparsity</span>
              <span className="text-[#E2E8F0] font-bold">
                {comparisonData
                  ? `${(comparisonData.transformer.sparsity * 100).toFixed(1)}%`
                  : "--"}
              </span>
            </div>
            <div className="h-3 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full bg-orange-500 rounded"
                style={{
                  width: comparisonData
                    ? `${comparisonData.transformer.sparsity * 100}%`
                    : "0%",
                }}
              />
            </div>
          </div>

          {/* Neuron grid */}
          <div className="mb-4">
            <p className="text-[#6B7280] text-sm mb-2">
              Neuron activations (sample of 400)
            </p>
            <div className="grid grid-cols-20 gap-0.5">
              {Array.from({ length: 400 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-sm"
                  style={{
                    background: i <
                    (comparisonData
                      ? 400 * (1 - comparisonData.transformer.sparsity)
                      : 380)
                      ? '#F97316'
                      : 'rgba(255,255,255,0.04)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="text-center p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-2xl font-bold text-[#E2E8F0]">
              {comparisonData
                ? comparisonData.transformer.activeNeurons.toLocaleString()
                : "--"}
            </div>
            <div className="text-[#8B95A5] text-sm">active neurons</div>
            <div className="text-[#6B7280] text-xs mt-1">
              out of{" "}
              {comparisonData?.transformer.totalNeurons.toLocaleString() ||
                "--"}
            </div>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-8 card-interactive p-6">
        <h3 className="text-lg font-semibold mb-4 text-[#E2E8F0]">Key Insight</h3>
        <p className="text-[#8B95A5] text-sm">
          BDH achieves ~95% sparsity through architectural design, not
          regularization. After projecting to neuron space (D→N), the ReLU
          activation naturally kills most signals. This means each active neuron
          carries meaningful, interpretable information — unlike transformers
          where the dense activations make interpretation nearly impossible.
        </p>
      </div>
    </div>
  );
}
