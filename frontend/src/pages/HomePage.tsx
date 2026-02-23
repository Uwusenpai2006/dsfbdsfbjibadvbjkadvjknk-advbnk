import { useRef, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Cpu,
  BarChart3,
  Network,
  Brain,
  Zap,
  GitMerge,
  FileText,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { spring, fadeUp, scaleUp, stagger, cardInteraction } from '../utils/motion';

/* ═══════════════════════════════════════════════════════════════
   WIREFRAME TERRAIN — full-bleed green mesh hills
   ═══════════════════════════════════════════════════════════════ */
function WireframeTerrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) { animRef.current = requestAnimationFrame(draw); return; }
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    timeRef.current += 0.003;
    const t = timeRef.current;

    const cols = 100;
    const rows = 55;
    const cellW = (w + 40) / cols;
    const cellH = h / rows;
    const startX = -20;

    const getH = (gx: number, gz: number) => {
      const nx = gx / cols;
      const nz = gz / rows;
      const s1 = Math.sin(gx * 0.06 + t * 0.8) * Math.cos(gz * 0.045 + t * 0.5) * 55;
      const s2 = Math.sin(gx * 0.13 + t * 1.2) * Math.sin(gz * 0.1 - t * 0.3) * 28;
      const s3 = Math.cos(gx * 0.025 - t * 0.6) * Math.sin(gz * 0.035 + t * 0.25) * 70;
      const envX = Math.sin(nx * Math.PI);
      const envZ = Math.pow(Math.sin(nz * Math.PI), 0.75);
      return (s1 + s2 + s3) * envX * envZ;
    };

    // Horizontal lines
    for (let z = 0; z < rows; z++) {
      const nz = z / rows;
      const alpha = 0.03 + nz * 0.32;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(0,200,150,${alpha})`;
      ctx.lineWidth = 0.3 + nz * 0.5;
      for (let x = 0; x <= cols; x++) {
        const px = startX + x * cellW;
        const py = z * cellH + getH(x, z);
        if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Vertical lines (thinner)
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      for (let z = 0; z < rows; z++) {
        const nz = z / rows;
        const px = startX + x * cellW;
        const py = z * cellH + getH(x, z);
        ctx.strokeStyle = `rgba(0,200,150,${0.015 + nz * 0.15})`;
        ctx.lineWidth = 0.2 + nz * 0.25;
        if (z === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.7 }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════
   LIQUID BLOBS — floating, morphing orbs with spring feel
   ═══════════════════════════════════════════════════════════════ */
function LiquidBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0,200,150,0.10) 0%, transparent 70%)',
          filter: 'blur(80px)',
          top: '-10%',
          right: '-12%',
        }}
        animate={{ x: [0, 40, -25, 0], y: [0, 50, 15, 0], scale: [1, 1.08, 0.94, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[450px] h-[450px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(42,127,255,0.07) 0%, transparent 70%)',
          filter: 'blur(70px)',
          top: '35%',
          left: '-8%',
        }}
        animate={{ x: [0, -30, 20, 0], y: [0, -35, 25, 0], scale: [1, 0.92, 1.06, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[350px] h-[350px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0,200,150,0.06) 0%, transparent 70%)',
          filter: 'blur(50px)',
          top: '60%',
          left: '45%',
        }}
        animate={{ x: [0, 35, -25, 0], y: [0, -25, 35, 0], scale: [1, 1.12, 0.88, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */
const features = [
  { path: '/architecture', icon: Cpu, title: 'Structural View', desc: 'Animated data flow through every BDH layer', tag: 'Architecture' },
  { path: '/sparsity', icon: BarChart3, title: 'Sparsity View', desc: "Compare BDH's ~5% activation vs Transformer's ~95%", tag: 'Analysis' },
  { path: '/graph', icon: Network, title: 'Topology View', desc: '3D force-directed graph of neural connectivity', tag: 'Visualization' },
  { path: '/monosemanticity', icon: Brain, title: 'Concept View', desc: 'Discover synapses that encode specific concepts', tag: 'Analysis' },
  { path: '/hebbian', icon: Zap, title: 'Dynamics View', desc: 'Watch memory form in real-time during inference', tag: 'Live' },
  { path: '/merge', icon: GitMerge, title: 'Composition View', desc: 'Combine French + Portuguese into a polyglot', tag: 'Experiment' },
  { path: '/findings', icon: FileText, title: 'Findings', desc: 'Key results, metrics, and measurement methods', tag: 'Summary' },
  { path: '/learn', icon: BookOpen, title: 'Learn BDH', desc: 'Step-by-step architecture walkthrough', tag: 'Tutorial' },
];

const stats = [
  { value: '~5%', label: 'Neurons Active', sub: 'vs ~95% in transformers' },
  { value: 'O(T)', label: 'Attention', sub: 'linear, not quadratic' },
  { value: '∞', label: 'Context Length', sub: 'constant memory' },
  { value: '1:1', label: 'Synapse ≈ Concept', sub: 'monosemantic' },
];

const differentiators = [
  { title: 'Sparse by Design', text: "BDH achieves ~95% sparsity through ReLU after expanding to neuron space. Not regularization — it's architectural." },
  { title: 'Monosemantic Neurons', text: 'Individual synapses reliably encode specific concepts. Point to a synapse and say "this is the currency neuron."' },
  { title: 'Hebbian Learning', text: '"Neurons that fire together wire together" — BDH implements this during inference through co-activation, no backprop.' },
  { title: 'Composable Intelligence', text: 'Train specialists separately, merge freely. French + Portuguese → polyglot. Transformers cannot do this.' },
];

/* ═══════════════════════════════════════════════════════════════
   HOME PAGE
   ═══════════════════════════════════════════════════════════════ */
export function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#070D12' }}>

      {/* ═══ HERO ═══ */}
      <section className="relative h-screen min-h-[700px] flex flex-col items-center justify-center overflow-hidden">
        <WireframeTerrain />
        <LiquidBlobs />

        {/* Gradient scrims */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom,
              rgba(7,13,18,0.88) 0%,
              rgba(7,13,18,0.20) 28%,
              rgba(7,13,18,0.04) 48%,
              rgba(7,13,18,0.12) 72%,
              rgba(7,13,18,0.96) 100%
            )`,
          }}
        />

        {/* Content */}
        <motion.div
          className="relative z-10 text-center px-6 max-w-5xl mx-auto"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          {/* Pill */}
          <motion.div
            custom={0}
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-8"
            style={{
              background: 'rgba(0,200,150,0.06)',
              border: '1px solid rgba(0,200,150,0.15)',
              color: '#00C896',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C896] animate-pulse" />
            KRITI 2026 &middot; AI Interpretability Challenge
          </motion.div>

          {/* Headline */}
          <motion.h1
            custom={1}
            variants={fadeUp}
            className="text-6xl sm:text-7xl md:text-8xl lg:text-[6.5rem] font-extrabold tracking-tight leading-[0.93] mb-7"
          >
            <span className="text-[#E2E8F0]">Explore </span>
            <span className="text-[#00C896]">BDH</span>
            <br />
            <span className="text-[#E2E8F0]">Interpretability</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            custom={2}
            variants={fadeUp}
            className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            style={{ color: '#8B95A5' }}
          >
            A biologically-inspired architecture where AI reasoning becomes{' '}
            <span className="text-[#E2E8F0] font-medium">visible and understandable</span>.
            From sparse activations to Hebbian learning — every neuron tells a story.
          </motion.p>

          {/* CTAs */}
          <motion.div custom={3} variants={fadeUp} className="flex items-center justify-center gap-4 mb-12">
            <NavLink
              to="/architecture"
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-semibold text-base transition-all duration-300"
              style={{
                background: '#00C896',
                color: '#070D12',
                boxShadow: '0 0 24px rgba(0,200,150,0.15)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.boxShadow = '0 0 48px rgba(0,200,150,0.35)';
                e.currentTarget.style.background = '#34D399';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.boxShadow = '0 0 24px rgba(0,200,150,0.15)';
                e.currentTarget.style.background = '#00C896';
              }}
            >
              Start Exploring
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </NavLink>
            <NavLink
              to="/learn"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-medium text-base transition-all duration-300 hover:bg-white/5"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#E2E8F0',
              }}
            >
              Learn BDH
            </NavLink>
          </motion.div>

          {/* Feature pills */}
          <motion.div
            custom={4}
            variants={fadeUp}
            className="inline-flex items-center gap-4 px-6 py-3 rounded-full backdrop-blur-md"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {[
              { icon: '⚡', label: '~5% Active', accent: true },
              { icon: '🧠', label: 'Monosemantic', accent: false },
              { icon: '∑', label: 'O(T) Attention', accent: false },
            ].map((p, i) => (
              <span key={i} className="flex items-center gap-1.5 text-sm">
                <span>{p.icon}</span>
                <span style={{ color: p.accent ? '#00C896' : '#8B95A5', fontWeight: p.accent ? 500 : 400 }}>{p.label}</span>
                {i < 2 && <span className="ml-2" style={{ color: '#2D3748' }}>·</span>}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-5 h-9 rounded-full flex justify-center pt-1.5" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
            <motion.div
              className="w-1 h-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.2)' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </section>

      {/* ═══ STATS ═══ */}
      <motion.section
        className="py-16 px-8"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={stagger}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <motion.div key={s.label} custom={i} variants={fadeUp} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-[#E2E8F0] mb-1 tracking-tight">{s.value}</div>
              <div className="text-sm font-medium" style={{ color: '#8B95A5' }}>{s.label}</div>
              <div className="text-xs mt-0.5" style={{ color: '#4A5568' }}>{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ═══ FEATURES GRID ═══ */}
      <motion.section
        className="relative py-24 px-8 overflow-hidden"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        variants={stagger}
      >
        {/* Ambient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(0,200,150,0.03) 0%, transparent 70%)', filter: 'blur(80px)' }}
        />

        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.h2 custom={0} variants={fadeUp} className="text-3xl md:text-5xl font-extrabold text-center mb-3 tracking-tight">
            <span className="text-[#E2E8F0]">Explore the </span>
            <span className="text-[#00C896]">Problem Space</span>
          </motion.h2>
          <motion.p custom={1} variants={fadeUp} className="text-center mb-14 text-sm" style={{ color: '#4A5568' }}>
            8 interactive lenses into the BDH neural system.
          </motion.p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div key={f.path} custom={i + 2} variants={scaleUp}>
                <NavLink to={f.path} className="group relative block h-full">
                  <motion.div
                    className="relative p-5 h-full rounded-xl overflow-hidden transition-colors duration-300"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                    whileHover={{
                      y: -6,
                      borderColor: 'rgba(0,200,150,0.2)',
                      background: 'rgba(255,255,255,0.035)',
                      boxShadow: '0 12px 40px rgba(0,200,150,0.07)',
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={spring.snappy}
                  >
                    {/* Hover glow */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: 'radial-gradient(circle at 50% 0%, rgba(0,200,150,0.06) 0%, transparent 60%)' }}
                    />
                    <div className="relative z-10">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center mb-8"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <f.icon size={18} className="text-[#4A5568] group-hover:text-[#00C896] transition-colors duration-300" />
                      </div>
                      <span className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: '#4A5568' }}>{f.tag}</span>
                      <h3 className="text-base font-semibold text-[#E2E8F0] mb-1.5 tracking-tight">{f.title}</h3>
                      <p className="text-sm leading-relaxed mb-5" style={{ color: '#6B7280' }}>{f.desc}</p>
                      <ArrowRight size={14} className="text-[#2D3748] group-hover:text-[#6B7280] transition-all duration-300 group-hover:translate-x-1" />
                    </div>
                  </motion.div>
                </NavLink>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ═══ DIFFERENTIATORS ═══ */}
      <motion.section
        className="py-24 px-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        variants={stagger}
      >
        <div className="max-w-4xl mx-auto">
          <motion.h2 custom={0} variants={fadeUp} className="text-3xl md:text-5xl font-extrabold text-center mb-3 tracking-tight">
            <span className="text-[#E2E8F0]">What Makes BDH </span>
            <span className="text-[#00C896]">Different</span>
          </motion.h2>
          <motion.p custom={1} variants={fadeUp} className="text-center mb-16 text-sm" style={{ color: '#4A5568' }}>
            Not just another language model — a window into neural computation.
          </motion.p>

          <div className="space-y-4">
            {differentiators.map((d, i) => (
              <motion.div
                key={d.title}
                custom={i + 2}
                variants={fadeUp}
                className="group flex gap-5 p-5 rounded-xl transition-all duration-400"
                style={{
                  background: 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
                whileHover={{
                  borderColor: 'rgba(0,200,150,0.15)',
                  background: 'rgba(255,255,255,0.025)',
                }}
                transition={spring.snappy}
              >
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-mono text-sm font-semibold"
                  style={{ background: 'rgba(0,200,150,0.08)', color: '#00C896', border: '1px solid rgba(0,200,150,0.12)' }}
                >
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#E2E8F0] mb-1 tracking-tight">{d.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{d.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ═══ CTA FOOTER ═══ */}
      <section className="relative py-32 px-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,200,150,0.05) 0%, transparent 70%)',
        }} />

        <motion.div
          className="relative z-10 max-w-2xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 custom={0} variants={fadeUp} className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5">
            <span className="text-[#E2E8F0]">Start your </span>
            <span className="text-[#00C896]">BDH journey</span>
          </motion.h2>
          <motion.p custom={1} variants={fadeUp} className="mb-10 text-base" style={{ color: '#6B7280' }}>
            Dive into the architecture. See every neuron. Understand every gate.
          </motion.p>
          <motion.div custom={2} variants={fadeUp}>
            <NavLink
              to="/architecture"
              className="group inline-flex items-center gap-2 px-10 py-4 rounded-full font-semibold text-lg transition-all duration-300"
              style={{
                background: '#E2E8F0',
                color: '#070D12',
                boxShadow: '0 0 30px rgba(226,232,240,0.06)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.boxShadow = '0 0 50px rgba(226,232,240,0.15)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.boxShadow = '0 0 30px rgba(226,232,240,0.06)';
              }}
            >
              Explore Architecture
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </NavLink>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
