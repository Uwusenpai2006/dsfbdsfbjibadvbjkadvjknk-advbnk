/**
 * BDH Neural Observatory — Motion System
 *
 * Principle: Motion = meaning. Every transition carries semantic weight.
 * Physics-based springs with biological feel.
 */
import type { Transition, Variants } from "framer-motion";

/* ═══════════════════════════════════════════════════════════════
   SPRING CONFIGS — physics-based, never tween
   ═══════════════════════════════════════════════════════════════ */
export const spring = {
  /** Default — biologically-weighted, "neuron firing" feel */
  default: {
    type: "spring",
    stiffness: 120,
    damping: 18,
    mass: 0.9,
  } as Transition,
  /** Snappy — quick micro-interactions */
  snappy: {
    type: "spring",
    stiffness: 300,
    damping: 24,
    mass: 0.6,
  } as Transition,
  /** Slow — page-level, dramatic reveals */
  slow: { type: "spring", stiffness: 60, damping: 20, mass: 1.2 } as Transition,
  /** Bouncy — playful, for CTAs and pills */
  bouncy: {
    type: "spring",
    stiffness: 200,
    damping: 12,
    mass: 0.8,
  } as Transition,
  /** Gentle — inspector panels, slide-ins */
  gentle: {
    type: "spring",
    stiffness: 80,
    damping: 22,
    mass: 1.0,
  } as Transition,
};

/* ═══════════════════════════════════════════════════════════════
   CARD INTERACTION RULES
   Tier 1: Surface (static info)
   Tier 2: Interactive (hoverable, tappable)
   Tier 3: Focus / Inspector (pinned, strong glow)
   ═══════════════════════════════════════════════════════════════ */

/** Tier 2 card hover/tap — use on interactive cards */
export const cardInteraction = {
  whileHover: { y: -6, transition: spring.snappy },
  whileTap: { scale: 0.98, transition: spring.snappy },
};

/** Tier 3 focus card — inspector / detail panel */
export const focusCardInteraction = {
  whileHover: { y: -3, transition: spring.snappy },
  whileTap: { scale: 0.99, transition: spring.snappy },
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS — Liquid reveal system
   ═══════════════════════════════════════════════════════════════ */

/** Fade up with spring — standard reveal */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32, filter: "blur(4px)" },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      ...spring.default,
      delay: i * 0.08,
    },
  }),
};

/** Fade in from left — sidebar items */
export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    x: 0,
    transition: { ...spring.default, delay: i * 0.05 },
  }),
};

/** Scale up — cards, modals */
export const scaleUp: Variants = {
  hidden: { opacity: 0, scale: 0.92, filter: "blur(6px)" },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { ...spring.default, delay: i * 0.06 },
  }),
};

/** Stagger container */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07 },
  },
};

/** Page transition — used in AnimatePresence around Outlet */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 16, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: spring.default,
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(4px)",
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/* ═══════════════════════════════════════════════════════════════
   THEME COLORS — Neural Observatory palette
   ═══════════════════════════════════════════════════════════════ */
export const theme = {
  bg: "#070D12",
  surface: "#0B1216",
  card: "rgba(255,255,255,0.02)",
  cardBorder: "rgba(255,255,255,0.06)",
  cardHover: "rgba(255,255,255,0.04)",
  glow: "#00C896",
  glowDim: "rgba(0,200,150,0.08)",
  glowMid: "rgba(0,200,150,0.15)",
  secondary: "#2A7FFF",
  secondaryDim: "rgba(42,127,255,0.08)",
  text: "#E2E8F0",
  textMuted: "#8B95A5",
  textDim: "#4A5568",
  border: "rgba(255,255,255,0.06)",
};

/* ═══════════════════════════════════════════════════════════════
   CSS CLASS HELPERS (Tailwind-compatible inline strings)
   ═══════════════════════════════════════════════════════════════ */

/** Tier 1 surface card */
export const surfaceCard =
  "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl backdrop-blur-sm";

/** Tier 2 interactive card */
export const interactiveCard =
  "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl backdrop-blur-sm transition-all duration-300 hover:border-[rgba(0,200,150,0.2)] hover:bg-[rgba(255,255,255,0.04)] hover:shadow-[0_0_30px_rgba(0,200,150,0.06)]";

/** Tier 3 focus card */
export const focusCard =
  "bg-[rgba(255,255,255,0.03)] border border-[rgba(0,200,150,0.15)] rounded-xl backdrop-blur-md shadow-[0_0_40px_rgba(0,200,150,0.08)]";
