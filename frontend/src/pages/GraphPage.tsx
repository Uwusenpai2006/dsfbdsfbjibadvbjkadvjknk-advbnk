import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Network,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  AlertCircle,
  Send,
  Zap,
  Activity,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { api } from '../utils/api'

// ============================================================================
// TYPES
// ============================================================================

interface ClusterNode {
  id: number
  cluster: number
  degree: number
  out_degree: number
  in_degree: number
  is_hub: boolean
  // ForceGraph internal
  x?: number
  y?: number
  z?: number
  // Activation overlay
  activation?: number
}

interface ClusterEdge {
  source: number | ClusterNode
  target: number | ClusterNode
  weight: number
  same_cluster: boolean
}

interface ClusterMeta {
  cluster_id: number
  neuron_count: number
  avg_out_degree: number
  avg_in_degree: number
  internal_edges: number
  internal_weight: number
  hub_neurons: Array<{ neuron: number; degree: number }>
  label: string | null
}

interface ClusterData {
  model_name: string
  head: number
  beta: number
  n_neurons: number
  n_total_edges: number
  n_display_nodes: number
  n_display_edges: number
  num_clusters: number
  modularity: number
  density: number
  nodes: ClusterNode[]
  edges: ClusterEdge[]
  clusters: ClusterMeta[]
  histogram: Array<{ x: number; y: number }>
  degree_distribution: Array<{ x: number; y: number }>
}

interface ActivationResult {
  input_text: string
  input_chars: string[]
  head: number
  layer: number
  layers_used: number[]
  cluster_activations: Array<{
    cluster_id: number
    total_activation: number
    active_neurons: number
    mean_activation: number
    normalized: number
  }>
  node_activations: Record<string, number>
  max_activation: number
}

// ============================================================================
// CLUSTER COLORS — vivid, distinct palette
// ============================================================================

const CLUSTER_COLORS = [
  '#4B5563', // 0 = isolated (gray)
  '#8B5CF6', // 1 purple
  '#3B82F6', // 2 blue
  '#10B981', // 3 emerald
  '#F59E0B', // 4 amber
  '#EF4444', // 5 red
  '#EC4899', // 6 pink
  '#06B6D4', // 7 cyan
  '#84CC16', // 8 lime
  '#F97316', // 9 orange
  '#6366F1', // 10 indigo
  '#14B8A6', // 11 teal
  '#E879F9', // 12 fuchsia
  '#FB923C', // 13 light orange
  '#A78BFA', // 14 light purple
  '#34D399', // 15 light emerald
  '#FBBF24', // 16 yellow
  '#F472B6', // 17 light pink
  '#22D3EE', // 18 light cyan
  '#A3E635', // 19 light lime
]

function getClusterColor(clusterId: number): string {
  if (clusterId <= 0) return CLUSTER_COLORS[0]
  return CLUSTER_COLORS[((clusterId - 1) % (CLUSTER_COLORS.length - 1)) + 1]
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [128, 128, 128]
}

// ============================================================================
// MINI COMPONENTS
// ============================================================================

function MiniHistogram({ data, beta, label }: { data: Array<{ x: number; y: number }>; beta: number; label: string }) {
  if (!data || data.length === 0) return null
  const maxY = Math.max(...data.map((d) => d.y), 1)
  const maxX = Math.max(...data.map((d) => d.x))
  const minX = Math.min(...data.map((d) => d.x))
  const betaPos = maxX > minX ? ((beta - minX) / (maxX - minX)) * 100 : 50

  return (
    <div className="mt-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="relative h-16 bg-gray-900/50 rounded-lg overflow-hidden border border-gray-800/50">
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex-1 mx-px transition-all duration-300"
              style={{
                height: `${(d.y / maxY) * 100}%`,
                backgroundColor: d.x >= beta ? 'rgba(139,92,246,0.7)' : 'rgba(75,85,99,0.4)',
              }}
            />
          ))}
        </div>
        {/* Beta threshold line */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500"
          style={{ left: `${Math.min(Math.max(betaPos, 0), 100)}%` }}
        >
          <div className="absolute -top-0.5 -translate-x-1/2 text-[9px] text-red-400 font-mono whitespace-nowrap">
            β={beta.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClusterPill({
  cluster,
  activation,
  isExpanded,
  onClick,
}: {
  cluster: ClusterMeta
  activation?: { normalized: number; active_neurons: number; total_activation: number }
  isExpanded: boolean
  onClick: () => void
}) {
  const color = getClusterColor(cluster.cluster_id)
  const glowIntensity = activation ? activation.normalized : 0

  return (
    <motion.div
      layout
      onClick={onClick}
      className="cursor-pointer rounded-xl border transition-all duration-500"
      style={{
        borderColor: glowIntensity > 0.1 ? color : 'rgba(55,65,81,0.5)',
        backgroundColor: glowIntensity > 0.1 ? `${color}15` : 'rgba(17,24,39,0.5)',
        boxShadow: glowIntensity > 0.3 ? `0 0 ${20 * glowIntensity}px ${color}40` : 'none',
      }}
    >
      <div className="p-3 flex items-center gap-3">
        {/* Color dot with pulse */}
        <div className="relative">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          {glowIntensity > 0.3 && (
            <div
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: color, opacity: 0.4 }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200 truncate">
              {cluster.label || `Cluster ${cluster.cluster_id}`}
            </span>
            <span className="text-xs text-gray-500">{cluster.neuron_count}n</span>
          </div>
          {activation && activation.normalized > 0.05 && (
            <div className="mt-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${activation.normalized * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>

        {activation && activation.normalized > 0.05 && (
          <span className="text-xs font-mono" style={{ color }}>
            {(activation.normalized * 100).toFixed(0)}%
          </span>
        )}

        {isExpanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-gray-900/50 rounded-lg">
                <div className="text-gray-500">Avg Out°</div>
                <div className="font-mono text-gray-300">{cluster.avg_out_degree}</div>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg">
                <div className="text-gray-500">Avg In°</div>
                <div className="font-mono text-gray-300">{cluster.avg_in_degree}</div>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg">
                <div className="text-gray-500">Int. Edges</div>
                <div className="font-mono text-gray-300">{cluster.internal_edges}</div>
              </div>
              <div className="p-2 bg-gray-900/50 rounded-lg">
                <div className="text-gray-500">Int. Weight</div>
                <div className="font-mono text-gray-300">{cluster.internal_weight.toFixed(1)}</div>
              </div>
              {cluster.hub_neurons.length > 0 && (
                <div className="col-span-2 p-2 bg-gray-900/50 rounded-lg">
                  <div className="text-gray-500 mb-1">Hub Neurons</div>
                  <div className="flex flex-wrap gap-1">
                    {cluster.hub_neurons.map((h) => (
                      <span key={h.neuron} className="px-1.5 py-0.5 rounded font-mono text-gray-400 bg-gray-800">
                        #{h.neuron}<span className="text-gray-600">({h.degree})</span>
                      </span>
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
  // --- State ---
  const [clusterData, setClusterData] = useState<ClusterData | null>(null)
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Controls
  const [selectedHead, setSelectedHead] = useState(0)
  const [beta, setBeta] = useState(1.0)
  const [selectedLayer, setSelectedLayer] = useState(-1)  // -1 = all
  const [inputText, setInputText] = useState('')
  const [isRotating, setIsRotating] = useState(true)
  const [showEdges, setShowEdges] = useState(true)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)
  const [highlightCluster, setHighlightCluster] = useState<number | null>(null)

  const graphRef = useRef<any>(null)
  const prevBetaTimeout = useRef<any>(null)

  // --- Load clusters from backend ---
  const loadClusters = useCallback(async (head: number, b: number) => {
    setIsLoading(true)
    setError(null)
    setActivationResult(null)

    try {
      const response = await api.get(`/graph/clusters/french`, {
        params: { head, beta: b, max_nodes: 400 },
        timeout: 60000,
      })
      setClusterData(response.data)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load clusters'
      setError(msg)
      console.error('Cluster load error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadClusters(selectedHead, beta)
  }, [selectedHead]) // eslint-disable-line

  // Debounced beta change
  useEffect(() => {
    if (prevBetaTimeout.current) clearTimeout(prevBetaTimeout.current)
    prevBetaTimeout.current = setTimeout(() => {
      loadClusters(selectedHead, beta)
    }, 400)
    return () => clearTimeout(prevBetaTimeout.current)
  }, [beta]) // eslint-disable-line

  // --- Run inference activation ---
  const runActivation = useCallback(async () => {
    if (!inputText.trim() || !clusterData) return
    setIsActivating(true)

    try {
      const response = await api.post('/graph/activate', {
        text: inputText,
        model_name: 'french',
        head: selectedHead,
        layer: selectedLayer,
      })
      setActivationResult(response.data)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Activation failed'
      setError(msg)
    } finally {
      setIsActivating(false)
    }
  }, [inputText, selectedHead, selectedLayer, clusterData])

  // --- Build graph data for ForceGraph3D ---
  const graphData = useMemo(() => {
    if (!clusterData) return { nodes: [], links: [] }

    const nodeActivations = activationResult?.node_activations || {}
    const maxNodeAct = Math.max(
      ...Object.values(nodeActivations).map(Number),
      0.001,
    )

    const nodes = clusterData.nodes.map((n) => ({
      ...n,
      activation: nodeActivations[String(n.id)] ? Number(nodeActivations[String(n.id)]) / maxNodeAct : 0,
    }))

    const links = showEdges
      ? clusterData.edges.map((e) => ({
          source: typeof e.source === 'object' ? (e.source as ClusterNode).id : e.source,
          target: typeof e.target === 'object' ? (e.target as ClusterNode).id : e.target,
          weight: e.weight,
          same_cluster: e.same_cluster,
        }))
      : []

    return { nodes, links }
  }, [clusterData, activationResult, showEdges])

  // --- Cluster activation map ---
  const clusterActivationMap = useMemo(() => {
    if (!activationResult) return {}
    const map: Record<number, { normalized: number; active_neurons: number; total_activation: number }> = {}
    for (const ca of activationResult.cluster_activations) {
      map[ca.cluster_id] = {
        normalized: ca.normalized,
        active_neurons: ca.active_neurons,
        total_activation: ca.total_activation,
      }
    }
    return map
  }, [activationResult])

  // --- Node rendering ---
  const nodeThreeObject = useCallback(
    (node: any) => {
      const cluster = node.cluster || 0
      const isHub = node.is_hub
      const activation = node.activation || 0
      const isHighlighted = highlightCluster !== null && cluster === highlightCluster

      const color = getClusterColor(cluster)
      const [r, g, b] = hexToRgb(color)

      const baseSize = isHub ? 3.5 : 1.8
      const activationBoost = activation > 0 ? 1 + activation * 3 : 0
      const highlightBoost = isHighlighted ? 1.5 : 1
      const size = (baseSize + activationBoost) * highlightBoost

      const dimFactor = highlightCluster !== null && !isHighlighted ? 0.15 : 1.0
      const activationGlow = activation > 0.1 ? activation : 0

      const geometry = new THREE.SphereGeometry(size, 12, 12)
      const material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(r / 255 * dimFactor, g / 255 * dimFactor, b / 255 * dimFactor),
        emissive: new THREE.Color(
          (r / 255) * Math.max(activationGlow * 0.8, isHighlighted ? 0.3 : 0),
          (g / 255) * Math.max(activationGlow * 0.8, isHighlighted ? 0.3 : 0),
          (b / 255) * Math.max(activationGlow * 0.8, isHighlighted ? 0.3 : 0),
        ),
        transparent: dimFactor < 1,
        opacity: dimFactor < 1 ? 0.3 : 1,
      })

      const mesh = new THREE.Mesh(geometry, material)

      // Glow sprite for activated/hub nodes
      if (activationGlow > 0.2 || (isHub && isHighlighted)) {
        const spriteMat = new THREE.SpriteMaterial({
          map: new THREE.TextureLoader().load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAe9JREFUWEftlrFOwzAQhu+cTJgQAyPqxMoO4gF4AZ6AkYWBHcTAghiYWJEdxMjC0MHJhUvtJE7sOE0rJEf+7/7v7HN8RPh4MH7fvFr3pwcfRORp0T0CgDPGbE/mOPnafq1v7d/kE+LVUopnCvl3CHEr4CQAuDLMI7f7XY7v50kRyL6BICXzPEr9YUQ9wvHvEBKWCqlUk4oelcqjZKj+PggS9PxcKfTKSmFPEIkCsBm8FMR/VEh+LJaSSgUCqUiIQXgtlJK5+pKp3f7V6MvKNBxAaJl8FQEB+CYBuBJSqnUyLIsDfcP94+ORdEJIJ4AwJWM4MdC8F+tNCMj7hyKYhBCPBbBBxH5pJR6V0i+q5dShLVN0uRqp9f/agq0LAhxh4KYBmLOwwDi5CAO/0niZHIYR5NnGctaHsH9AsRYBNfzCN4LQlwBwm4f4udQ0J/G+K+a4n0WgrUhAOFLKAJ+DSG+NUjJBxH5ABCfMhdfVCCeBuDvYaH4Bwm+JYAXw5DcScbz27I8Px9Fk0d2c3ORJMc9ANgEhOVwDwDHYVE8SpL4IA6nr0opnVuE4FWmfmYE3xbCtyyC7wjhGwC4bIfwKyP4thB+VELxMYn4LXc+q0DwY6FYJRSfkzh5KIqTRlPw3w7ifwHyLfAhd+V9HQAAAABJRU5ErkJggg=='),
          color: new THREE.Color(r / 255, g / 255, b / 255),
          transparent: true,
          opacity: Math.min(activationGlow * 0.6 + (isHighlighted ? 0.2 : 0), 0.7),
        })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.scale.set(size * 5, size * 5, 1)
        mesh.add(sprite)
      }

      return mesh
    },
    [highlightCluster],
  )

  // --- Link rendering ---
  const linkColor = useCallback(
    (link: any) => {
      if (!showEdges) return 'rgba(0,0,0,0)'
      if (link.same_cluster) {
        // Find the cluster of source node
        const sourceNode = clusterData?.nodes.find(
          (n) => n.id === (typeof link.source === 'object' ? link.source.id : link.source),
        )
        if (sourceNode) {
          const color = getClusterColor(sourceNode.cluster)
          const dimmed = highlightCluster !== null && sourceNode.cluster !== highlightCluster
          return dimmed ? 'rgba(30,30,40,0.05)' : `${color}30`
        }
      }
      return highlightCluster !== null ? 'rgba(30,30,40,0.02)' : 'rgba(100,100,120,0.08)'
    },
    [clusterData, showEdges, highlightCluster],
  )

  // --- Handle key press for inference ---
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runActivation()
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ================================================================== */}
      {/* LEFT: 3D Graph + Controls */}
      {/* ================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="p-6 pb-0">
          <h1 className="text-2xl font-bold mb-1">
            <span className="gradient-text">Graph Brain</span> Explorer
          </h1>
          <p className="text-gray-500 text-sm">
            Neuron clusters from G* = D<sub>x</sub>E · Louvain community detection on trained weights
          </p>
        </motion.div>

        {/* Controls Bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 py-3 flex flex-wrap items-center gap-3">
          {/* Head selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Head</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((h) => (
                <button
                  key={h}
                  onClick={() => setSelectedHead(h)}
                  className={`w-8 h-8 rounded-lg text-xs font-mono font-bold transition-all ${
                    selectedHead === h
                      ? 'bg-bdh-accent text-white shadow-lg shadow-bdh-accent/30'
                      : 'bg-gray-800/80 text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-800" />

          {/* Beta slider */}
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">β thresh</span>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.05}
              value={beta}
              onChange={(e) => setBeta(parseFloat(e.target.value))}
              className="flex-1 h-1.5 appearance-none rounded-full bg-gray-800 outline-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bdh-accent [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-bdh-accent/40"
            />
            <span className="text-xs font-mono text-bdh-accent w-8 text-right">{beta.toFixed(2)}</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-800" />

          {/* Toggle edges */}
          <button
            onClick={() => setShowEdges(!showEdges)}
            className={`p-2 rounded-lg transition-all ${showEdges ? 'bg-gray-700 text-gray-200' : 'bg-gray-800/50 text-gray-600'}`}
            title={showEdges ? 'Hide edges' : 'Show edges'}
          >
            {showEdges ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Rotate / Reset */}
          <button
            onClick={() => setIsRotating(!isRotating)}
            className={`p-2 rounded-lg transition-all ${isRotating ? 'bg-bdh-accent/20 text-bdh-accent' : 'bg-gray-800/50 text-gray-500'}`}
          >
            {isRotating ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={() => graphRef.current?.cameraPosition({ x: 0, y: 0, z: 600 }, { x: 0, y: 0, z: 0 }, 800)}
            className="p-2 rounded-lg bg-gray-800/50 text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-all"
          >
            <RotateCcw size={16} />
          </button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-6 mb-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2"
            >
              <AlertCircle size={16} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3D Graph Canvas */}
        <div className="flex-1 relative mx-6 mb-3 rounded-2xl overflow-hidden border border-gray-800/50 bg-[#06060a]" style={{ minHeight: '50vh' }}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-bdh-accent animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Computing Louvain clusters...</p>
              </div>
            </div>
          ) : graphData.nodes.length > 0 ? (
            <ForceGraph3D
              ref={graphRef}
              graphData={graphData}
              nodeThreeObject={nodeThreeObject}
              nodeThreeObjectExtend={false}
              linkColor={linkColor}
              linkOpacity={0.15}
              linkWidth={0.3}
              backgroundColor="#06060a"
              enableNodeDrag={true}
              enableNavigationControls={true}
              controlType="orbit"
              nodeLabel={(node: any) =>
                `Neuron #${node.id}\nCluster: ${node.cluster}\nDegree: ${node.degree}${node.is_hub ? ' (HUB)' : ''}${
                  node.activation > 0 ? `\nActivation: ${(node.activation * 100).toFixed(0)}%` : ''
                }`
              }
              onNodeClick={(node: any) => {
                setHighlightCluster((prev) => (prev === node.cluster ? null : node.cluster))
              }}
              onBackgroundClick={() => setHighlightCluster(null)}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              warmupTicks={80}
              cooldownTicks={200}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-600 text-sm">No graph data. Check that the model is loaded.</p>
            </div>
          )}

          {/* Overlay stats */}
          {clusterData && !isLoading && (
            <div className="absolute top-3 left-3 flex gap-2 pointer-events-none">
              <div className="px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-[11px] font-mono text-gray-400 border border-gray-800/50">
                {clusterData.n_display_nodes} nodes · {clusterData.n_display_edges} edges
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-[11px] font-mono text-bdh-accent border border-gray-800/50">
                {clusterData.num_clusters} clusters · Q={clusterData.modularity.toFixed(3)}
              </div>
            </div>
          )}
        </div>

        {/* Inference Input */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-6 pb-6">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-bdh-accent" />
              <span className="text-sm font-semibold text-gray-300">Live Inference</span>
              <span className="text-xs text-gray-600">— type text to see which clusters activate</span>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="e.g. 'The price in euros was 50 francs'"
                className="input-field flex-1 text-sm"
              />
              <div className="flex items-center gap-2">
                <select
                  value={selectedLayer}
                  onChange={(e) => setSelectedLayer(parseInt(e.target.value))}
                  className="h-full px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400
                    focus:outline-none focus:ring-1 focus:ring-bdh-accent/50"
                >
                  <option value={-1}>All layers</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((l) => (
                    <option key={l} value={l}>Layer {l}</option>
                  ))}
                </select>
                <button
                  onClick={runActivation}
                  disabled={isActivating || !inputText.trim()}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isActivating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Activate
                </button>
              </div>
            </div>

            {/* Quick examples */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                'The price in euros was 50 francs',
                'Germany and France signed the treaty',
                '<F:en>Hello world<T:fr>',
                'The European Parliament adopted the resolution',
                'Le dollar américain s\'est apprécié',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setInputText(ex); }}
                  className="px-2 py-0.5 text-[10px] bg-gray-800/60 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors truncate max-w-[200px]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ================================================================== */}
      {/* RIGHT: Cluster Sidebar */}
      {/* ================================================================== */}
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 lg:w-96 border-l border-gray-800/50 bg-gray-900/30 backdrop-blur-sm flex flex-col overflow-hidden"
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Activity size={14} className="text-bdh-accent" />
              Neuron Clusters
            </h2>
            {clusterData && (
              <span className="text-[10px] font-mono text-gray-600">
                {clusterData.n_neurons.toLocaleString()} neurons total
              </span>
            )}
          </div>

          {/* Activation summary */}
          <AnimatePresence>
            {activationResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 p-2.5 rounded-lg bg-bdh-accent/10 border border-bdh-accent/20"
              >
                <div className="text-[10px] text-bdh-accent/70 uppercase tracking-wider mb-1">Input</div>
                <div className="text-xs text-gray-300 font-mono truncate">{activationResult.input_text}</div>
                <div className="mt-1.5 flex gap-3 text-[10px] text-gray-500">
                  <span>Head {activationResult.head}</span>
                  <span>Layers: {activationResult.layers_used.join(',')}</span>
                  <span>Max: {activationResult.max_activation.toFixed(1)}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Histogram */}
        {clusterData && (
          <div className="px-4 pt-3">
            <MiniHistogram data={clusterData.histogram} beta={beta} label="G* element distribution (signal vs noise)" />
          </div>
        )}

        {/* Cluster list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {clusterData?.clusters
            .filter((c) => c.cluster_id > 0) // skip isolated
            .map((cluster) => (
              <ClusterPill
                key={cluster.cluster_id}
                cluster={cluster}
                activation={clusterActivationMap[cluster.cluster_id]}
                isExpanded={expandedCluster === cluster.cluster_id}
                onClick={() => {
                  setExpandedCluster((prev) => (prev === cluster.cluster_id ? null : cluster.cluster_id))
                  setHighlightCluster((prev) => (prev === cluster.cluster_id ? null : cluster.cluster_id))
                }}
              />
            ))}

          {/* Isolated neurons */}
          {clusterData?.clusters.find((c) => c.cluster_id === 0) && (
            <div className="mt-2 pt-2 border-t border-gray-800/50">
              <div className="text-[10px] text-gray-600 flex items-center gap-1">
                <Info size={10} />
                {clusterData.clusters.find((c) => c.cluster_id === 0)?.neuron_count} isolated neurons (no edges above β)
              </div>
            </div>
          )}
        </div>

        {/* Key Insight footer */}
        <div className="p-4 border-t border-gray-800/50 bg-gray-950/50">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Clusters emerge from <span className="text-gray-400">G* = D<sub>x</sub>E</span> weight matrices via Louvain
            community detection. The paper finds{' '}
            <span className="text-bdh-accent/70">positive Newman modularity</span> — neurons self-organize into
            functional modules for concepts like currency, countries, and syntax.
          </p>
        </div>
      </motion.aside>
    </div>
  )
}
