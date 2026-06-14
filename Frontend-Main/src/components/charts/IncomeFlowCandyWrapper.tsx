import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowNode {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface CandyWrapperData {
  incomes: FlowNode[];
  totalPool: { label?: string; value: number };
  expenses: FlowNode[];
}

interface Props {
  data: CandyWrapperData;
  width?: number;
  height?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INCOME_COLORS = [
  "#00F5D4", // neon teal
  "#00BBFF", // electric blue
  "#7DF9FF", // baby blue
  "#39FF14", // neon green
  "#ADFF02", // lime
];

const EXPENSE_COLORS = [
  "#FF6B35", // sunset orange
  "#FF3E96", // hot pink
  "#FF9F1C", // amber
  "#E040FB", // electric purple
  "#FF4D6D", // coral red
];

const CENTER_COLOR = "#7B2FBE";
const CENTER_GLOW = "#A855F7";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cubicBezierPath(
  x1: number, y1: number,
  x2: number, y2: number,
  curvature = 0.5
): string {
  const cpX1 = x1 + (x2 - x1) * curvature;
  const cpX2 = x2 - (x2 - x1) * curvature;
  return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
}

function ribbonPath(
  x1: number, yTop1: number, yBot1: number,
  x2: number, yTop2: number, yBot2: number,
  curvature = 0.5
): string {
  const cpX1 = x1 + (x2 - x1) * curvature;
  const cpX2 = x2 - (x2 - x1) * curvature;
  return [
    `M ${x1} ${yTop1}`,
    `C ${cpX1} ${yTop1}, ${cpX2} ${yTop2}, ${x2} ${yTop2}`,
    `L ${x2} ${yBot2}`,
    `C ${cpX2} ${yBot2}, ${cpX1} ${yBot1}, ${x1} ${yBot1}`,
    "Z",
  ].join(" ");
}

// ─── Animated Flow Ribbon ─────────────────────────────────────────────────────

interface RibbonProps {
  path: string;
  gradientId: string;
  delay?: number;
}

function FlowRibbon({ path, gradientId, delay = 0 }: RibbonProps) {
  return (
    <motion.path
      d={path}
      fill={`url(#${gradientId})`}
      opacity={0}
      animate={{ opacity: [0, 0.72, 0.6] }}
      transition={{ duration: 1.2, delay, ease: "easeOut" }}
    />
  );
}

// ─── Flowing Center Line (animated stroke) ────────────────────────────────────

interface FlowLineProps {
  d: string;
  color: string;
  strokeWidth: number;
  delay?: number;
  reverse?: boolean;
}

function FlowLine({ d, color, strokeWidth, delay = 0, reverse = false }: FlowLineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(300);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, [d]);

  const dash = length * 0.3;
  const gap = length * 0.7;

  return (
    <motion.path
      ref={pathRef}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={`${dash} ${gap}`}
      initial={{ strokeDashoffset: reverse ? -length : length, opacity: 0 }}
      animate={{
        strokeDashoffset: [
          reverse ? -length : length,
          reverse ? length * 0.5 : -length * 0.5,
        ],
        opacity: [0, 0.9],
      }}
      transition={{
        strokeDashoffset: {
          duration: 2.5,
          repeat: Infinity,
          ease: "linear",
          delay,
        },
        opacity: { duration: 0.6, delay },
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IncomeFlowCandyWrapper({
  data,
  width = 800,
  height = 480,
}: Props) {
  const uid = useId().replace(/:/g, "");

  const { incomes, totalPool, expenses } = data;
  const totalIncome = incomes.reduce((s, n) => s + n.value, 0);
  const totalExpense = expenses.reduce((s, n) => s + n.value, 0);

  // Layout constants
  const padV = 48;
  const nodeW = 18;
  const nodeH = Math.min((height - padV * 2) / Math.max(incomes.length, expenses.length) - 10, 72);
  const centerX = width / 2;
  const centerY = height / 2;
  const centerR = 54;

  const leftX = 60;
  const rightX = width - 60 - nodeW;

  // Vertical positions for left nodes
  function nodePositions(nodes: FlowNode[], xOffset: number) {
    const total = nodes.length;
    const span = height - padV * 2;
    const step = span / total;
    return nodes.map((n, i) => ({
      ...n,
      x: xOffset,
      y: padV + step * i + step / 2 - nodeH / 2,
      cy: padV + step * i + step / 2,
    }));
  }

  const leftNodes = nodePositions(incomes, leftX);
  const rightNodes = nodePositions(expenses, rightX);

  // Ribbon thickness proportional to value
  function ribbonThickness(value: number, total: number) {
    return Math.max(6, (value / total) * (centerR * 1.6));
  }

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxWidth: width, display: "block", margin: "0 auto" }}
        aria-label="Income Flow Candy Wrapper Diagram"
      >
        <defs>
          {/* Center glow filter */}
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Income ribbon gradients */}
          {leftNodes.map((n, i) => {
            const color = n.color ?? INCOME_COLORS[i % INCOME_COLORS.length];
            return (
              <linearGradient
                key={`${uid}-ig-${i}`}
                id={`${uid}-ig-${i}`}
                x1="0%" y1="0%" x2="100%" y2="0%"
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.9" />
                <stop offset="100%" stopColor={CENTER_GLOW} stopOpacity="0.5" />
              </linearGradient>
            );
          })}

          {/* Expense ribbon gradients */}
          {rightNodes.map((n, i) => {
            const color = n.color ?? EXPENSE_COLORS[i % EXPENSE_COLORS.length];
            return (
              <linearGradient
                key={`${uid}-eg-${i}`}
                id={`${uid}-eg-${i}`}
                x1="0%" y1="0%" x2="100%" y2="0%"
              >
                <stop offset="0%" stopColor={CENTER_GLOW} stopOpacity="0.5" />
                <stop offset="100%" stopColor={color} stopOpacity="0.9" />
              </linearGradient>
            );
          })}

          {/* Center radial gradient */}
          <radialGradient id={`${uid}-center`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C084FC" />
            <stop offset="60%" stopColor={CENTER_COLOR} />
            <stop offset="100%" stopColor="#4C1D95" />
          </radialGradient>
        </defs>

        {/* ── Income ribbons (left → center) ── */}
        {leftNodes.map((n, i) => {
          const color = n.color ?? INCOME_COLORS[i % INCOME_COLORS.length];
          const thick = ribbonThickness(n.value, totalIncome);
          const halfT = thick / 2;

          const x1 = n.x + nodeW;
          const y1c = n.cy;
          const x2 = centerX - centerR;
          // Spread ribbons at center edge
          const centerSpread = (centerR * 1.5 * (i - (leftNodes.length - 1) / 2)) / leftNodes.length;
          const y2c = centerY + centerSpread;

          const rPath = ribbonPath(
            x1, y1c - halfT, y1c + halfT,
            x2, y2c - halfT * 0.6, y2c + halfT * 0.6,
            0.55
          );

          const cPath = cubicBezierPath(x1, y1c, x2, y2c, 0.55);

          return (
            <g key={`income-${i}`}>
              <FlowRibbon path={rPath} gradientId={`${uid}-ig-${i}`} delay={i * 0.12} />
              <FlowLine d={cPath} color={color} strokeWidth={1.5} delay={i * 0.12} />
            </g>
          );
        })}

        {/* ── Expense ribbons (center → right) ── */}
        {rightNodes.map((n, i) => {
          const color = n.color ?? EXPENSE_COLORS[i % EXPENSE_COLORS.length];
          const thick = ribbonThickness(n.value, totalExpense);
          const halfT = thick / 2;

          const x1 = centerX + centerR;
          const centerSpread = (centerR * 1.5 * (i - (rightNodes.length - 1) / 2)) / rightNodes.length;
          const y1c = centerY + centerSpread;

          const x2 = rightNodes[i].x;
          const y2c = n.cy;

          const rPath = ribbonPath(
            x1, y1c - halfT * 0.6, y1c + halfT * 0.6,
            x2, y2c - halfT, y2c + halfT,
            0.45
          );

          const cPath = cubicBezierPath(x1, y1c, x2, y2c, 0.45);

          return (
            <g key={`expense-${i}`}>
              <FlowRibbon path={rPath} gradientId={`${uid}-eg-${i}`} delay={0.6 + i * 0.12} />
              <FlowLine d={cPath} color={color} strokeWidth={1.5} delay={0.6 + i * 0.12} reverse />
            </g>
          );
        })}

        {/* ── Center node ── */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={centerR}
          fill={`url(#${uid}-center)`}
          filter={`url(#${uid}-glow)`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.3, type: "spring", stiffness: 120 }}
          style={{ transformOrigin: `${centerX}px ${centerY}px` }}
        />

        {/* Pulsing ring */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={centerR}
          fill="none"
          stroke="#C084FC"
          strokeWidth={2}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: [1, 1.22, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: `${centerX}px ${centerY}px` }}
        />

        {/* Center label */}
        <text
          x={centerX}
          y={centerY - 10}
          textAnchor="middle"
          fill="white"
          fontSize={10}
          fontWeight="600"
          letterSpacing="0.04em"
          opacity={0.85}
        >
          {totalPool.label ?? "Total Liquidity"}
        </text>
        <text
          x={centerX}
          y={centerY + 8}
          textAnchor="middle"
          fill="white"
          fontSize={13}
          fontWeight="700"
        >
          ${totalPool.value.toLocaleString()}
        </text>

        {/* ── Income node bars + labels ── */}
        {leftNodes.map((n, i) => {
          const color = n.color ?? INCOME_COLORS[i % INCOME_COLORS.length];
          return (
            <motion.g
              key={`lnode-${i}`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={nodeW}
                height={nodeH}
                rx={4}
                fill={color}
                opacity={0.9}
              />
              <text
                x={n.x + nodeW + 6}
                y={n.cy + 1}
                dominantBaseline="middle"
                fill={color}
                fontSize={11}
                fontWeight="600"
              >
                {n.label}
              </text>
              <text
                x={n.x + nodeW + 6}
                y={n.cy + 14}
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.55)"
                fontSize={10}
              >
                ${n.value.toLocaleString()}
              </text>
            </motion.g>
          );
        })}

        {/* ── Expense node bars + labels ── */}
        {rightNodes.map((n, i) => {
          const color = n.color ?? EXPENSE_COLORS[i % EXPENSE_COLORS.length];
          return (
            <motion.g
              key={`rnode-${i}`}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.1, duration: 0.5 }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={nodeW}
                height={nodeH}
                rx={4}
                fill={color}
                opacity={0.9}
              />
              {/* Label to the left of the right node */}
              <text
                x={n.x - 6}
                y={n.cy + 1}
                dominantBaseline="middle"
                textAnchor="end"
                fill={color}
                fontSize={11}
                fontWeight="600"
              >
                {n.label}
              </text>
              <text
                x={n.x - 6}
                y={n.cy + 14}
                dominantBaseline="middle"
                textAnchor="end"
                fill="rgba(255,255,255,0.55)"
                fontSize={10}
              >
                ${n.value.toLocaleString()}
              </text>
            </motion.g>
          );
        })}

        {/* ── Column headers ── */}
        <text x={leftX + nodeW / 2} y={24} textAnchor="middle" fill="#00F5D4" fontSize={12} fontWeight="700" letterSpacing="0.06em">
          INCOME
        </text>
        <text x={rightX + nodeW / 2} y={24} textAnchor="middle" fill="#FF6B35" fontSize={12} fontWeight="700" letterSpacing="0.06em">
          EXPENSES
        </text>
      </svg>
    </div>
  );
}

// ─── Default demo data (used when no prop is passed) ─────────────────────────

export const defaultCandyData: CandyWrapperData = {
  incomes: [
    { id: "salary",     label: "Salary",       value: 5200 },
    { id: "freelance",  label: "Freelance",    value: 1400 },
    { id: "dividends",  label: "Dividends",    value: 620  },
    { id: "transfers",  label: "Transfers In", value: 300  },
    { id: "refunds",    label: "Refunds",      value: 180  },
  ],
  totalPool: { label: "Month's Pot", value: 7700 },
  expenses: [
    { id: "rent",          label: "Rent",          value: 2100 },
    { id: "investments",   label: "Investments",   value: 1500 },
    { id: "groceries",     label: "Groceries",     value: 650  },
    { id: "entertainment", label: "Entertainment", value: 400  },
    { id: "savings",       label: "Savings",       value: 1050 },
  ],
};
