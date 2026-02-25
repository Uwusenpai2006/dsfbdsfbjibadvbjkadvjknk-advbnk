import { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Cpu,
  BarChart3,
  Network,
  Brain,
  Zap,
  GitMerge,
  FileText,
  BookOpen,
  Github,
  ExternalLink,
  WifiOff,
  Loader2,
} from "lucide-react";
import { onBackendStatus, startHealthPoll } from "../utils/api";
import { spring } from "../utils/motion";

/* ─── Nav items — "different lenses on the same brain" ─── */
const navItems = [
  { path: "/", icon: Home, label: "Observatory", sub: "Home" },
  {
    path: "/architecture",
    icon: Cpu,
    label: "Structural View",
    sub: "Architecture",
  },
  {
    path: "/sparsity",
    icon: BarChart3,
    label: "Sparsity View",
    sub: "Sparse Brain",
  },
  { path: "/graph", icon: Network, label: "Topology View", sub: "Graph Brain" },
  {
    path: "/monosemanticity",
    icon: Brain,
    label: "Concept View",
    sub: "Monosemanticity",
  },
  { path: "/hebbian", icon: Zap, label: "Dynamics View", sub: "Hebbian" },
  {
    path: "/merge",
    icon: GitMerge,
    label: "Composition View",
    sub: "Model Merge",
  },
  { path: "/findings", icon: FileText, label: "Findings", sub: "Summary" },
  { path: "/learn", icon: BookOpen, label: "Learn BDH", sub: "Tutorial" },
];

export function Layout() {
  const [backendUp, setBackendUp] = useState(true);

  useEffect(() => {
    startHealthPoll();
    return onBackendStatus(setBackendUp);
  }, []);

  return (
    <div
      className="min-h-screen flex noise-overlay vignette"
      style={{ background: "#070D12" }}
    >
      {/* ─── Sidebar ─── */}
      <aside
        className="w-60 flex flex-col shrink-0 border-r"
        style={{ background: "#0B1216", borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Logo */}
        <div
          className="p-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <NavLink to="/" className="flex items-center gap-3 group">
            <motion.span
              className="text-xl"
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={spring.bouncy}
            >
              🐉
            </motion.span>
            <div>
              <h1 className="font-semibold text-[#E2E8F0] text-sm tracking-tight">
                BDH Suite
              </h1>
              <p className="text-[10px] text-[#4A5568] tracking-wider uppercase">
                Neural Observatory
              </p>
            </div>
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className="relative block"
            >
              {({ isActive }) => (
                <motion.div
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                    isActive
                      ? "text-[#E2E8F0]"
                      : "text-[#6B7280] hover:text-[#A0AEC0]"
                  }`}
                  whileHover={!isActive ? { x: 3 } : undefined}
                  transition={spring.snappy}
                >
                  {/* Active indicator — shared layout for smooth morph */}
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "rgba(0,200,150,0.08)",
                        border: "1px solid rgba(0,200,150,0.12)",
                      }}
                      transition={spring.default}
                    />
                  )}
                  <item.icon
                    size={17}
                    className={`relative z-10 ${isActive ? "text-[#00C896]" : ""}`}
                  />
                  <div className="relative z-10">
                    <span className="font-medium block leading-tight">
                      {item.label}
                    </span>
                    {item.sub !== item.label && (
                      <span className="text-[10px] text-[#4A5568] block">
                        {item.sub}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="p-4 space-y-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <a
            href="https://github.com/pathwaycom/bdh"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[#4A5568] hover:text-[#8B95A5] text-sm transition-colors"
          >
            <Github size={15} />
            <span>BDH Paper</span>
            <ExternalLink size={11} className="ml-auto" />
          </a>
          <div className="text-[10px] text-[#2D3748] tracking-wider uppercase">
            KRITI 2026 · AI Interpretability
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-auto flex flex-col">
        {/* Backend banner */}
        <AnimatePresence>
          {!backendUp && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.snappy}
              className="overflow-hidden"
            >
              <div
                className="flex items-center gap-3 px-5 py-2.5 text-amber-400 text-sm"
                style={{
                  background: "rgba(245,158,11,0.06)",
                  borderBottom: "1px solid rgba(245,158,11,0.12)",
                }}
              >
                <WifiOff size={15} />
                <span>
                  <span className="font-semibold">Backend offline</span>
                  {" — "}run{" "}
                  <code
                    className="px-1.5 py-0.5 rounded text-xs font-mono text-amber-300"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    uvicorn backend.main:app --reload --port 8000
                  </code>{" "}
                  from the project root
                </span>
                <Loader2
                  size={14}
                  className="animate-spin ml-auto opacity-50"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Page content — each page handles its own entry animation */}
        <div className="flex-1" style={{ minHeight: 0 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
