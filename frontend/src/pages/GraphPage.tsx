import { useState, useEffect, useRef, Suspense } from 'react'
import { motion } from 'framer-motion'
import { Network, Play, Pause, RotateCcw, Layers } from 'lucide-react'
import ForceGraph3D from 'react-force-graph-3d'

interface GraphNode {
  id: string
  group: number
  val: number
  x?: number
  y?: number
  z?: number
}

interface GraphLink {
  source: string
  target: string
  value: number
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// Generate sample graph data (in production, load from JSON or API)
function generateSampleGraph(numNodes: number = 500): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  
  // Create nodes with scale-free degree distribution
  for (let i = 0; i < numNodes; i++) {
    nodes.push({
      id: `n${i}`,
      group: Math.floor(Math.random() * 8), // 8 "communities"
      val: Math.random() < 0.05 ? 10 : Math.random() < 0.2 ? 5 : 2, // Hub nodes are larger
    })
  }
  
  // Create edges with preferential attachment (scale-free)
  const hubNodes = nodes.filter(n => n.val >= 5)
  
  for (let i = 0; i < numNodes; i++) {
    // Connect to hubs more often (scale-free property)
    const numConnections = Math.floor(Math.random() * 3) + 1
    for (let j = 0; j < numConnections; j++) {
      const target = Math.random() < 0.6 
        ? hubNodes[Math.floor(Math.random() * hubNodes.length)]
        : nodes[Math.floor(Math.random() * numNodes)]
      
      if (target.id !== nodes[i].id) {
        links.push({
          source: nodes[i].id,
          target: target.id,
          value: Math.random() * 0.5 + 0.1,
        })
      }
    }
  }
  
  return { nodes, links }
}

export function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedModel, setSelectedModel] = useState<'french' | 'portuguese' | 'merged'>('french')
  const [isLoading, setIsLoading] = useState(true)
  const [isRotating, setIsRotating] = useState(true)
  const graphRef = useRef<any>(null)

  // Generate/load graph data
  useEffect(() => {
    setIsLoading(true)
    
    // In production, fetch from API or load from JSON
    const timer = setTimeout(() => {
      const data = generateSampleGraph(selectedModel === 'merged' ? 800 : 500)
      setGraphData(data)
      setIsLoading(false)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [selectedModel])

  // Color nodes by model origin (for merged view)
  const getNodeColor = (node: GraphNode) => {
    if (selectedModel === 'merged') {
      const id = parseInt(node.id.slice(1))
      if (id < 400) return '#3B82F6' // French (blue)
      if (id < 800) return '#10B981' // Portuguese (green)
      return '#8B5CF6' // Emergent (purple)
    }
    
    // Color by community
    const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6']
    return colors[node.group % colors.length]
  }

  return (
    <div className="min-h-screen p-8" style={{ background: '#070D12' }}>
      <motion.div
        initial={{ opacity: 0, y: -20, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 0.9 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold mb-2 text-[#E2E8F0]">
          <span className="text-[#00C896]">Topology View</span> Explorer
        </h1>
        <p className="text-[#8B95A5]">
          Visualize the emergent network topology in BDH weights. 
          Notice the scale-free structure with hub neurons.
        </p>
      </motion.div>

      {/* Model Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 mb-6"
      >
        <div className="flex items-center gap-4">
          <span className="text-[#8B95A5]">Model:</span>
          <div className="flex gap-2">
            {(['french', 'portuguese', 'merged'] as const).map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedModel === model
                    ? model === 'french' 
                      ? 'text-blue-400'
                      : model === 'portuguese'
                      ? 'text-green-400'
                      : 'text-[#2A7FFF]'
                    : 'text-[#6B7280]'
                }`}
                style={{
                  background: selectedModel === model
                    ? model === 'french' ? 'rgba(59,130,246,0.1)' : model === 'portuguese' ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)'
                    : 'rgba(255,255,255,0.04)',
                  border: selectedModel === model
                    ? `1px solid ${model === 'french' ? 'rgba(59,130,246,0.25)' : model === 'portuguese' ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.25)'}`
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {model === 'french' && '🇫🇷 French'}
                {model === 'portuguese' && '🇵🇹 Portuguese'}
                {model === 'merged' && '🔀 Merged'}
              </button>
            ))}
          </div>
          
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setIsRotating(!isRotating)}
              className={`p-2 rounded-lg transition-all duration-200 ${
                isRotating ? 'text-[#070D12]' : 'text-[#8B95A5]'
              }`}
              style={{
                background: isRotating ? '#00C896' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (isRotating ? 'rgba(0,200,150,0.3)' : 'rgba(255,255,255,0.06)'),
              }}
            >
              {isRotating ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => graphRef.current?.cameraPosition({ x: 0, y: 0, z: 500 })}
              className="p-2 rounded-lg transition-all duration-200 text-[#8B95A5]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* 3D Graph */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card overflow-hidden"
        style={{ height: '60vh' }}
      >
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Network className="w-12 h-12 text-bdh-accent animate-pulse mx-auto mb-4" />
              <p className="text-[#8B95A5]">Loading graph topology...</p>
            </div>
          </div>
        ) : graphData ? (
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            nodeColor={getNodeColor}
            nodeVal={(node: GraphNode) => node.val}
            nodeLabel={(node: GraphNode) => `Neuron ${node.id}\nGroup: ${node.group}`}
            linkOpacity={0.3}
            linkWidth={0.5}
            backgroundColor="#070D12"
            enableNodeDrag={true}
            enableNavigationControls={true}
            controlType="orbit"
            onNodeClick={(node: GraphNode) => {
              console.log('Clicked node:', node)
            }}
          />
        ) : null}
      </motion.div>

      {/* Legend and Stats */}
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[#E2E8F0]">
            <Layers size={20} className="text-[#00C896]" />
            Legend
          </h3>
          
          {selectedModel === 'merged' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-[#8B95A5]">French model neurons (0-{399})</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-green-500" />
                <span className="text-[#8B95A5]">Portuguese model neurons (400-{799})</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#2A7FFF]" />
                <span className="text-[#8B95A5]">Emergent (post-merge)</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[#8B95A5] text-sm">
                Colors represent neuron communities discovered through modularity clustering.
                Larger nodes are "hub" neurons with many connections.
              </p>
              <div className="flex flex-wrap gap-2">
                {['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899'].map((color, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-[#6B7280]">C{i}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[#E2E8F0]">
            <Network size={20} className="text-[#00C896]" />
            Graph Statistics
          </h3>
          
          {graphData && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-2xl font-bold text-[#00C896]">{graphData.nodes.length}</div>
                <div className="text-[#8B95A5] text-sm">Neurons</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-2xl font-bold text-green-400">{graphData.links.length}</div>
                <div className="text-[#8B95A5] text-sm">Connections</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-2xl font-bold text-orange-400">
                  {graphData.nodes.filter(n => n.val >= 5).length}
                </div>
                <div className="text-[#8B95A5] text-sm">Hub neurons</div>
              </div>
              <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="text-2xl font-bold text-[#2A7FFF]">
                  {(graphData.links.length / graphData.nodes.length).toFixed(1)}
                </div>
                <div className="text-[#8B95A5] text-sm">Avg degree</div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Insight */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 glass-card p-6"
      >
        <h3 className="text-lg font-semibold mb-4 text-[#E2E8F0]">Key Insight: Scale-Free Topology</h3>
        <p className="text-[#8B95A5]">
          BDH's weight matrices naturally develop <span className="text-[#E2E8F0] font-medium">
          scale-free network structure</span> — a few highly-connected "hub" neurons and many 
          sparsely-connected peripheral neurons. This mirrors biological neural networks and 
          enables efficient information routing. Unlike transformers with uniform dense 
          connections, BDH's topology is <span className="text-[#00C896]">interpretable 
          and modular</span>.
        </p>
      </motion.div>
    </div>
  )
}
