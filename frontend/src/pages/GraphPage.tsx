import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Network, Play, Pause, RotateCcw, Loader2, AlertCircle, Send, Zap, Activity,
  Eye, EyeOff, ChevronDown, ChevronUp, Info, SkipForward, Square,
} from 'lucide-react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { api } from '../utils/api'

// ============================================================================
// TYPES
// ============================================================================

interface ClusterNode {
  id: number; cluster: number; degree: number; out_degree: number; in_degree: number; is_hub: boolean
  x?: number; y?: number; z?: number; activation?: number
}
interface ClusterEdge { source: number | ClusterNode; target: number | ClusterNode; weight: number; same_cluster: boolean }
interface ClusterMeta {
  cluster_id: number; neuron_count: number; avg_out_degree: number; avg_in_degree: number
  internal_edges: number; internal_weight: number; hub_neurons: Array<{ neuron: number; degree: number }>; label: string | null
}
interface ClusterData {
  model_name: string; head: number; beta: number; n_neurons: number; n_total_edges: number
  n_display_nodes: number; n_display_edges: number; num_clusters: number; modularity: number; density: number
  nodes: ClusterNode[]; edges: ClusterEdge[]; clusters: ClusterMeta[]
  histogram: Array<{ x: number; y: number }>; degree_distribution: Array<{ x: number; y: number }>
}
interface TokenActivation {
  token_idx: number; byte: number; char: string
  cluster_activations: Array<{ cluster_id: number; activation: number; active_neurons: number; normalized: number }>
}
interface ActivationResult {
  input_text: string; input_chars: string[]; num_tokens: number; head: number; layer: number
  layers_used: number[]; per_token: TokenActivation[]
  cumulative_cluster_activations: Array<{ cluster_id: number; total_activation: number; active_neurons: number; normalized: number }>
  node_activations: Record<string, number>
}

// ============================================================================
// CLUSTER COLORS
// ============================================================================

const CLUSTER_COLORS = [
  '#4B5563', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#E879F9', '#FB923C',
  '#A78BFA', '#34D399', '#FBBF24', '#F472B6', '#22D3EE', '#A3E635',
]

function getClusterColor(cid: number): string {
  if (cid <= 0) return CLUSTER_COLORS[0]
  return CLUSTER_COLORS[((cid - 1) % (CLUSTER_COLORS.length - 1)) + 1]
}

function hexToRgb(hex: string): [number, number, number] {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [128, 128, 128]
}

// ============================================================================
// MINI HISTOGRAM
// ============================================================================

function MiniHistogram({ data, beta, label }: { data: Array<{ x: number; y: number }>; beta: number; label: string }) {
  if (!data?.length) return null
  const maxY = Math.max(...data.map(d => d.y), 1)
  const maxX = Math.max(...data.map(d => d.x))
  const minX = Math.min(...data.map(d => d.x))
  const betaPos = maxX > minX ? ((beta - minX) / (maxX - minX)) * 100 : 50

  return (
    <div className="mt-2">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className="relative h-12 bg-gray-900/50 rounded-lg overflow-hidden border border-gray-800/50">
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => (
            <div key={i} className="flex-1 mx-px transition-all duration-300"
              style={{ height: `${(d.y / maxY) * 100}%`, backgroundColor: d.x >= beta ? 'rgba(139,92,246,0.7)' : 'rgba(75,85,99,0.4)' }} />
          ))}
        </div>
        <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${Math.min(Math.max(betaPos, 0), 100)}%` }}>
          <div className="absolute -top-0.5 -translate-x-1/2 text-[8px] text-red-400 font-mono whitespace-nowrap">β={beta.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CLUSTER PILL
// ============================================================================

function ClusterPill({ cluster, activation, blinking, isExpanded, onClick }: {
  cluster: ClusterMeta; activation?: number; blinking: boolean; isExpanded: boolean; onClick: () => void
}) {
  const color = getClusterColor(cluster.cluster_id)
  const glow = activation || 0

  return (
    <motion.div layout onClick={onClick} className="cursor-pointer rounded-xl border transition-all duration-300"
      style={{
        borderColor: glow > 0.1 ? color : 'rgba(55,65,81,0.5)',
        backgroundColor: glow > 0.1 ? `${color}15` : 'rgba(17,24,39,0.5)',
        boxShadow: glow > 0.3 ? `0 0 ${20 * glow}px ${color}40` : 'none',
      }}>
      <div className="p-2.5 flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
          {blinking && <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: color, opacity: 0.5 }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-200 truncate">{cluster.label || `Cluster ${cluster.cluster_id}`}</span>
            <span className="text-[10px] text-gray-600">{cluster.neuron_count}n</span>
          </div>
          {glow > 0.05 && (
            <div className="mt-1 h-1 rounded-full bg-gray-800 overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
                initial={{ width: 0 }} animate={{ width: `${glow * 100}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
            </div>
          )}
        </div>
        {glow > 0.05 && <span className="text-[10px] font-mono" style={{ color }}>{(glow * 100).toFixed(0)}%</span>}
        {isExpanded ? <ChevronUp size={12} className="text-gray-600" /> : <ChevronDown size={12} className="text-gray-600" />}
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-2.5 pb-2.5 grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="p-1.5 bg-gray-900/50 rounded"><div className="text-gray-600">Out°</div><div className="font-mono text-gray-400">{cluster.avg_out_degree}</div></div>
              <div className="p-1.5 bg-gray-900/50 rounded"><div className="text-gray-600">In°</div><div className="font-mono text-gray-400">{cluster.avg_in_degree}</div></div>
              <div className="p-1.5 bg-gray-900/50 rounded"><div className="text-gray-600">Edges</div><div className="font-mono text-gray-400">{cluster.internal_edges}</div></div>
              <div className="p-1.5 bg-gray-900/50 rounded"><div className="text-gray-600">Weight</div><div className="font-mono text-gray-400">{cluster.internal_weight.toFixed(1)}</div></div>
              {cluster.hub_neurons.length > 0 && (
                <div className="col-span-2 p-1.5 bg-gray-900/50 rounded">
                  <div className="text-gray-600 mb-0.5">Hubs</div>
                  <div className="flex flex-wrap gap-1">
                    {cluster.hub_neurons.map(h => (
                      <span key={h.neuron} className="px-1 py-0.5 rounded bg-gray-800 font-mono text-gray-500">#{h.neuron}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function GraphPage() {
  const [clusterData, setClusterData] = useState<ClusterData | null>(null)
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Controls — head displayed as 1-4, stored internally as 0-3
  const [selectedHead, setSelectedHead] = useState(0)
  const [beta, setBeta] = useState(0.1)
  const [selectedLayer, setSelectedLayer] = useState(-1)
  const [inputText, setInputText] = useState('')
  const [isRotating, setIsRotating] = useState(true)
  const [showEdges, setShowEdges] = useState(true)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)
  const [highlightCluster, setHighlightCluster] = useState<number | null>(null)

  // Playback state
  const [playbackIdx, setPlaybackIdx] = useState<number>(-1) // -1 = not playing, 0..N-1 = current token
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackTimer = useRef<any>(null)

  const graphRef = useRef<any>(null)
  const betaTimeout = useRef<any>(null)

  // --- Load clusters ---
  const loadClusters = useCallback(async (head: number, b: number) => {
    setIsLoading(true); setError(null); setActivationResult(null); setPlaybackIdx(-1); setIsPlaying(false)
    try {
      const res = await api.get(`/graph/clusters/french`, { params: { head, beta: b, max_nodes: 400 }, timeout: 60000 })
      setClusterData(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load clusters')
    } finally { setIsLoading(false) }
  }, [])

  useEffect(() => { loadClusters(selectedHead, beta) }, [selectedHead]) // eslint-disable-line

  useEffect(() => {
    if (betaTimeout.current) clearTimeout(betaTimeout.current)
    betaTimeout.current = setTimeout(() => loadClusters(selectedHead, beta), 500)
    return () => clearTimeout(betaTimeout.current)
  }, [beta]) // eslint-disable-line

  // --- Run inference ---
  const runActivation = useCallback(async () => {
    if (!inputText.trim() || !clusterData) return
    setIsActivating(true); setPlaybackIdx(-1); setIsPlaying(false)
    try {
      const res = await api.post('/graph/activate', { text: inputText, model_name: 'french', head: selectedHead, layer: selectedLayer })
      setActivationResult(res.data)
      // Auto-start playback
      setPlaybackIdx(0); setIsPlaying(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Activation failed')
    } finally { setIsActivating(false) }
  }, [inputText, selectedHead, selectedLayer, clusterData])

  // --- Playback timer ---
  useEffect(() => {
    if (playbackTimer.current) clearInterval(playbackTimer.current)
    if (isPlaying && activationResult && playbackIdx >= 0 && playbackIdx < activationResult.num_tokens) {
      playbackTimer.current = setInterval(() => {
        setPlaybackIdx(prev => {
          if (prev >= (activationResult?.num_tokens || 1) - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 350) // 350ms per character
    }
    return () => { if (playbackTimer.current) clearInterval(playbackTimer.current) }
  }, [isPlaying, activationResult, playbackIdx])

  // --- Current token's cluster activations ---
  const currentTokenActivation = useMemo(() => {
    if (!activationResult || playbackIdx < 0 || playbackIdx >= activationResult.per_token.length) return null
    return activationResult.per_token[playbackIdx]
  }, [activationResult, playbackIdx])

  // Map cluster_id -> normalized activation for current token
  const currentClusterMap = useMemo(() => {
    const map: Record<number, number> = {}
    if (currentTokenActivation) {
      for (const ca of currentTokenActivation.cluster_activations) {
        map[ca.cluster_id] = ca.normalized
      }
    }
    return map
  }, [currentTokenActivation])

  // Blinking clusters = those with normalized > 0.3 on current token
  const blinkingClusters = useMemo(() => {
    const s = new Set<number>()
    if (currentTokenActivation) {
      for (const ca of currentTokenActivation.cluster_activations) {
        if (ca.normalized > 0.3) s.add(ca.cluster_id)
      }
    }
    return s
  }, [currentTokenActivation])

  // --- Build ForceGraph data ---
  const graphData = useMemo(() => {
    if (!clusterData) return { nodes: [], links: [] }
    const nodeActs = activationResult?.node_activations || {}
    const nodes = clusterData.nodes.map(n => ({ ...n, activation: nodeActs[String(n.id)] ? Number(nodeActs[String(n.id)]) : 0 }))
    const links = showEdges ? clusterData.edges.map(e => ({
      source: typeof e.source === 'object' ? (e.source as ClusterNode).id : e.source,
      target: typeof e.target === 'object' ? (e.target as ClusterNode).id : e.target,
      weight: e.weight, same_cluster: e.same_cluster,
    })) : []
    return { nodes, links }
  }, [clusterData, activationResult, showEdges])

  // --- Node rendering ---
  const nodeThreeObject = useCallback((node: any) => {
    const cluster = node.cluster || 0
    const isHub = node.is_hub
    const activation = node.activation || 0
    const isHl = highlightCluster !== null && cluster === highlightCluster
    const color = getClusterColor(cluster)
    const [r, g, b] = hexToRgb(color)

    // Check if this node's cluster is blinking right now
    const isBlinking = blinkingClusters.has(cluster)
    const blinkBoost = isBlinking ? 1.8 : 1

    const baseSize = isHub ? 3 : 1.5
    const actBoost = activation > 0 ? 1 + activation * 2.5 : 0
    const hlBoost = isHl ? 1.4 : 1
    const size = (baseSize + actBoost) * hlBoost * blinkBoost

    const dim = highlightCluster !== null && !isHl ? 0.12 : 1.0
    const emissiveStr = Math.max(activation > 0.1 ? activation * 0.7 : 0, isHl ? 0.25 : 0, isBlinking ? 0.6 : 0)

    const geo = new THREE.SphereGeometry(size, 10, 10)
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(r / 255 * dim, g / 255 * dim, b / 255 * dim),
      emissive: new THREE.Color(r / 255 * emissiveStr, g / 255 * emissiveStr, b / 255 * emissiveStr),
      transparent: dim < 1, opacity: dim < 1 ? 0.25 : 1,
    })
    return new THREE.Mesh(geo, mat)
  }, [highlightCluster, blinkingClusters])

  // --- Link color ---
  const linkColor = useCallback((link: any) => {
    if (!showEdges) return 'rgba(0,0,0,0)'
    if (link.same_cluster) {
      const src = clusterData?.nodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source))
      if (src) {
        const c = getClusterColor(src.cluster)
        const dimmed = highlightCluster !== null && src.cluster !== highlightCluster
        return dimmed ? 'rgba(40,40,55,0.04)' : `${c}44`
      }
    }
    return highlightCluster !== null ? 'rgba(40,40,55,0.03)' : 'rgba(120,120,150,0.12)'
  }, [clusterData, showEdges, highlightCluster])

  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runActivation() } }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* LEFT: Graph + Controls */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-4 pb-1 flex-shrink-0">
          <h1 className="text-xl font-bold"><span className="gradient-text">Graph Brain</span> Explorer</h1>
          <p className="text-gray-600 text-xs mt-0.5">G* = D<sub>x</sub>E · Louvain community detection on trained french model</p>
        </div>

        {/* Controls */}
        <div className="px-5 py-2 flex flex-wrap items-center gap-2.5 flex-shrink-0">
          {/* Head: display 1-4, internal 0-3 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Head</span>
            {[0, 1, 2, 3].map(h => (
              <button key={h} onClick={() => setSelectedHead(h)}
                className={`w-7 h-7 rounded-md text-xs font-mono font-bold transition-all ${
                  selectedHead === h ? 'bg-bdh-accent text-white shadow-lg shadow-bdh-accent/30' : 'bg-gray-800/80 text-gray-500 hover:bg-gray-700'
                }`}>{h + 1}</button>
            ))}
          </div>
          <div className="w-px h-5 bg-gray-800" />
          {/* Beta slider — low range */}
          <div className="flex items-center gap-1.5 flex-1 max-w-[220px]">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider whitespace-nowrap">β</span>
            <input type="range" min={0.01} max={0.5} step={0.005} value={beta}
              onChange={e => setBeta(parseFloat(e.target.value))}
              className="flex-1 h-1 appearance-none rounded-full bg-gray-800 outline-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bdh-accent [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-bdh-accent/40" />
            <span className="text-[10px] font-mono text-bdh-accent w-9 text-right">{beta.toFixed(3)}</span>
          </div>
          <div className="w-px h-5 bg-gray-800" />
          <button onClick={() => setShowEdges(!showEdges)}
            className={`p-1.5 rounded-md transition-all ${showEdges ? 'bg-gray-700 text-gray-200' : 'bg-gray-800/50 text-gray-600'}`}
            title={showEdges ? 'Hide edges' : 'Show edges'}>
            {showEdges ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={() => setIsRotating(!isRotating)}
            className={`p-1.5 rounded-md transition-all ${isRotating ? 'bg-bdh-accent/20 text-bdh-accent' : 'bg-gray-800/50 text-gray-500'}`}>
            {isRotating ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => graphRef.current?.cameraPosition({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 0 }, 600)}
            className="p-1.5 rounded-md bg-gray-800/50 text-gray-500 hover:bg-gray-700 transition-all"><RotateCcw size={14} /></button>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-5 mb-1 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-center gap-2 flex-shrink-0">
              <AlertCircle size={14} />{error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200 text-xs">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3D Graph — fills remaining space */}
        <div className="flex-1 relative mx-5 mb-2 rounded-xl overflow-hidden border border-gray-800/40 bg-[#07070c]">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center"><Loader2 className="w-8 h-8 text-bdh-accent animate-spin mx-auto mb-2" /><p className="text-gray-600 text-xs">Computing clusters...</p></div>
            </div>
          ) : graphData.nodes.length > 0 ? (
            <ForceGraph3D ref={graphRef} graphData={graphData}
              nodeThreeObject={nodeThreeObject} nodeThreeObjectExtend={false}
              linkColor={linkColor} linkOpacity={0.25} linkWidth={0.4}
              backgroundColor="#07070c" enableNodeDrag={true} enableNavigationControls={true} controlType="orbit"
              nodeLabel={(node: any) => `#${node.id} · Cluster ${node.cluster} · Deg ${node.degree}${node.is_hub ? ' (HUB)' : ''}`}
              onNodeClick={(node: any) => setHighlightCluster(prev => prev === node.cluster ? null : node.cluster)}
              onBackgroundClick={() => setHighlightCluster(null)}
              d3AlphaDecay={0.025} d3VelocityDecay={0.3} warmupTicks={60} cooldownTicks={180}
              width={undefined} height={undefined} />
          ) : !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center"><p className="text-gray-700 text-xs">No data. Check model is loaded.</p></div>
          )}
          {/* Overlay stats */}
          {clusterData && !isLoading && (
            <div className="absolute top-2 left-2 flex gap-1.5 pointer-events-none">
              <div className="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[10px] font-mono text-gray-500 border border-gray-800/40">
                {clusterData.n_display_nodes}n · {clusterData.n_display_edges}e
              </div>
              <div className="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[10px] font-mono text-bdh-accent/80 border border-gray-800/40">
                {clusterData.num_clusters} clusters · Q={clusterData.modularity.toFixed(3)}
              </div>
            </div>
          )}
          {/* Current token overlay during playback */}
          {currentTokenActivation && (
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-black/80 backdrop-blur border border-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Token</span>
                  <div className="flex gap-0.5 flex-wrap">
                    {activationResult?.input_chars.map((ch, i) => (
                      <span key={i} className={`px-1 py-0.5 rounded text-xs font-mono transition-all duration-200 ${
                        i === playbackIdx ? 'bg-bdh-accent text-white scale-110' : i < playbackIdx ? 'bg-gray-700/50 text-gray-400' : 'text-gray-600'
                      }`}>{ch}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inference input + playback controls */}
        <div className="px-5 pb-4 flex-shrink-0">
          <div className="glass-card p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={13} className="text-bdh-accent" />
              <span className="text-xs font-semibold text-gray-300">Live Inference</span>
              <span className="text-[10px] text-gray-600">— activations play character by character</span>
              {/* Playback controls */}
              {activationResult && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => { setPlaybackIdx(0); setIsPlaying(true) }}
                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all" title="Replay">
                    <RotateCcw size={12} />
                  </button>
                  <button onClick={() => setIsPlaying(!isPlaying)}
                    className={`p-1 rounded transition-all ${isPlaying ? 'bg-bdh-accent/20 text-bdh-accent' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button onClick={() => { setIsPlaying(false); setPlaybackIdx(prev => Math.min(prev + 1, (activationResult?.num_tokens || 1) - 1)) }}
                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all" title="Step">
                    <SkipForward size={12} />
                  </button>
                  <button onClick={() => { setIsPlaying(false); setPlaybackIdx(-1); setActivationResult(null) }}
                    className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all" title="Clear">
                    <Square size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyPress}
                placeholder="e.g. 'The price in euros was 50 francs'"
                className="input-field flex-1 text-xs !py-2" />
              <select value={selectedLayer} onChange={e => setSelectedLayer(parseInt(e.target.value))}
                className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-[10px] text-gray-400 focus:outline-none focus:ring-1 focus:ring-bdh-accent/50">
                <option value={-1}>All layers</option>
                {[0,1,2,3,4,5].map(l => <option key={l} value={l}>L{l}</option>)}
              </select>
              <button onClick={runActivation} disabled={isActivating || !inputText.trim()}
                className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap !py-2">
                {isActivating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Run
              </button>
            </div>
            {/* Quick examples */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {['The price in euros was 50 francs', 'Germany and France signed the treaty',
                'Le dollar américain', 'The European Parliament', '<F:en>Hello<T:fr>',
              ].map(ex => (
                <button key={ex} onClick={() => setInputText(ex)}
                  className="px-1.5 py-0.5 text-[9px] bg-gray-800/60 hover:bg-gray-700 rounded text-gray-600 hover:text-gray-400 transition-colors truncate max-w-[180px]">{ex}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <motion.aside initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="w-72 lg:w-80 border-l border-gray-800/50 bg-gray-900/30 backdrop-blur-sm flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-3 border-b border-gray-800/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={12} className="text-bdh-accent" />Clusters
            </h2>
            {clusterData && <span className="text-[9px] font-mono text-gray-700">{clusterData.n_neurons.toLocaleString()} neurons</span>}
          </div>
          {/* Current token indicator */}
          {currentTokenActivation && (
            <div className="mt-2 px-2 py-1.5 rounded-lg bg-bdh-accent/10 border border-bdh-accent/20">
              <div className="text-[9px] text-bdh-accent/60 uppercase tracking-wider">
                Token {currentTokenActivation.token_idx + 1}/{activationResult?.num_tokens}
              </div>
              <div className="text-sm font-mono text-white mt-0.5">
                '{currentTokenActivation.char}' <span className="text-gray-500 text-[10px]">byte {currentTokenActivation.byte}</span>
              </div>
            </div>
          )}
        </div>

        {/* Histogram */}
        {clusterData && (
          <div className="px-3 flex-shrink-0">
            <MiniHistogram data={clusterData.histogram} beta={beta} label="G* element distribution" />
          </div>
        )}

        {/* Cluster list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          {clusterData?.clusters.filter(c => c.cluster_id > 0).map(cluster => (
            <ClusterPill key={cluster.cluster_id} cluster={cluster}
              activation={currentClusterMap[cluster.cluster_id] ?? (activationResult
                ? (activationResult.cumulative_cluster_activations.find(c => c.cluster_id === cluster.cluster_id)?.normalized ?? 0)
                : 0)}
              blinking={blinkingClusters.has(cluster.cluster_id)}
              isExpanded={expandedCluster === cluster.cluster_id}
              onClick={() => {
                setExpandedCluster(p => p === cluster.cluster_id ? null : cluster.cluster_id)
                setHighlightCluster(p => p === cluster.cluster_id ? null : cluster.cluster_id)
              }} />
          ))}
          {clusterData?.clusters.find(c => c.cluster_id === 0) && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-800/50">
              <div className="text-[9px] text-gray-700 flex items-center gap-1">
                <Info size={9} />{clusterData.clusters.find(c => c.cluster_id === 0)?.neuron_count} isolated
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-800/50 bg-gray-950/50 flex-shrink-0">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            Clusters from <span className="text-gray-500">G*=D<sub>x</sub>E</span> via Louvain.
            Head {selectedHead + 1}/4 · β={beta.toFixed(3)}.
            Type text and watch clusters blink as each character is processed.
          </p>
        </div>
      </motion.aside>
    </div>
  )
}
