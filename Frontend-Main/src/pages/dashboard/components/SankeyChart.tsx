import { memo, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ITEM_VARIANTS } from '@/constants';
import { Card } from '@/components/ui/Card';
import {
  buildSankeyLayout,
  buildIncomeSourcesLayout,
  ribbon,
  fmtCurrency,
  SANKEY_VW,
  SANKEY_VH,
  SANKEY_XSRC,
  SANKEY_XI,
  SANKEY_XC,
  SANKEY_XS,
  SANKEY_NW,
} from '@/constants/cashflow';
import type { CashFlowCategory, SankeyLayoutNode, SankeyLayoutSub } from '@/types/cashflow.types';

interface SankeyChartProps {
  categories: CashFlowCategory[];
  income: number;
  incomeSources?: { id: string; name: string; amount: number }[];
  highlightedCat: string | null;
  onHighlight: (catId: string | null) => void;
  isLoading?: boolean;
}

const PY = 24;
const AVAIL_H = SANKEY_VH - PY * 2;
const R_OP = 0.22;
const SR_OP = 0.15;
const N_OP = 0.55;

function RightLabel({ x, y0, h, name, amount, color, dimmed }: {
  x: number; y0: number; h: number; name: string; amount: number; color: string; dimmed: boolean;
}) {
  const mid = y0 + h / 2;
  const tall = h > 28;
  const opacity = dimmed ? 0.07 : 0.88;

  if (tall) {
    return (
      <g style={{ opacity, transition: 'opacity .28s ease' }}>
        <text x={x} y={mid - 8} dominantBaseline="auto" fontFamily="var(--font-display)" fontSize="13" fontWeight="500" fill="#f9fafb">
          {name}
        </text>
        <text x={x} y={mid + 7} fontFamily="var(--font-display)" fontSize="10" fontWeight="400" fill={color}>
          {fmtCurrency(amount)}
        </text>
      </g>
    );
  }

  return (
    <g style={{ opacity, transition: 'opacity .28s ease' }}>
      <text x={x} y={mid} dominantBaseline="middle" fontFamily="var(--font-display)" fontSize="12" fontWeight="500" fill="#f9fafb">
        {name}
        <tspan fontFamily="var(--font-display)" fontSize="10" fontWeight="400" fill={color} dx="4">
          {fmtCurrency(amount)}
        </tspan>
      </text>
    </g>
  );
}

function SubGroup({ cat, sub, dimmed, onEnter, onLeave }: {
  cat: SankeyLayoutNode; sub: SankeyLayoutSub; dimmed: boolean;
  onEnter: (e: React.MouseEvent) => void; onLeave: () => void;
}) {
  return (
    <g style={{ cursor: 'pointer' }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <path
        d={ribbon(SANKEY_XC + SANKEY_NW, sub.srcY0, sub.srcY1, SANKEY_XS, sub.sY0, sub.sY1)}
        fill={cat.color}
        style={{ opacity: dimmed ? 0.02 : SR_OP, transition: 'opacity .28s ease' }}
      />
      <rect
        x={SANKEY_XS} y={sub.sY0} width={SANKEY_NW} height={sub.h}
        fill={cat.color} rx={1.5}
        style={{ opacity: dimmed ? N_OP * 0.07 : N_OP, transition: 'opacity .28s ease' }}
      />
      <RightLabel
        x={SANKEY_XS + SANKEY_NW + 12}
        y0={sub.sY0} h={sub.h}
        name={sub.name} amount={sub.amount} color={cat.color}
        dimmed={dimmed}
      />
    </g>
  );
}

export const SankeyChart = memo(function SankeyChart({ categories, income, incomeSources, highlightedCat, onHighlight, isLoading }: SankeyChartProps) {
  const layout = useMemo(() => buildSankeyLayout(categories, income), [categories, income]);
  const sourceLayout = useMemo(
    () => (incomeSources && incomeSources.length ? buildIncomeSourcesLayout(incomeSources, income) : []),
    [incomeSources, income],
  );
  const [tooltip, setTooltip] = useState<{ name: string; val: string; x: number; y: number } | null>(null);
  const [hoveredSrc, setHoveredSrc] = useState<string | null>(null);

  const handleEnter = useCallback((catId: string, name: string, val: string, e: React.MouseEvent) => {
    onHighlight(catId);
    setTooltip({ name, val, x: e.clientX + 16, y: e.clientY - 36 });
  }, [onHighlight]);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTooltip(prev => prev ? { ...prev, x: e.clientX + 16, y: e.clientY - 36 } : null);
  }, []);

  const handleLeave = useCallback(() => {
    onHighlight(null);
    setTooltip(null);
  }, [onHighlight]);

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered" padding="md" className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm animate-pulse">
            Loading…
          </div>
        ) : layout.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm">
            No transactions for this period
          </div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${SANKEY_VW} ${SANKEY_VH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ overflow: 'visible', display: 'block' }}
          >
            {/* ── Income source column (NEW leftmost) ───────────────────── */}
            {sourceLayout.length > 0 && (
              <>
                {sourceLayout.map((src) => {
                  const dimmed = hoveredSrc !== null && hoveredSrc !== src.id;
                  const tipVal = `${fmtCurrency(src.amount)} · ${src.pct}% of income`;
                  return (
                    <g
                      key={src.id}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => { setHoveredSrc(src.id); setTooltip({ name: src.name, val: tipVal, x: e.clientX + 16, y: e.clientY - 36 }); }}
                      onMouseMove={handleMove}
                      onMouseLeave={() => { setHoveredSrc(null); setTooltip(null); }}
                    >
                      {/* Ribbon: source -> income aggregator */}
                      <path
                        d={ribbon(SANKEY_XSRC + SANKEY_NW, src.srcY0, src.srcY1, SANKEY_XI, src.iY0, src.iY1)}
                        fill={src.color}
                        style={{
                          opacity: dimmed ? 0.05 : highlightedCat ? 0.12 : 0.32,
                          transition: 'opacity .28s ease',
                        }}
                      />
                      {/* Source node bar */}
                      <rect
                        x={SANKEY_XSRC} y={src.srcY0} width={SANKEY_NW} height={src.h}
                        fill={src.color} rx={2}
                        style={{ opacity: dimmed ? 0.18 : 1, transition: 'opacity .28s ease' }}
                      />
                      {/* Source label (left side) */}
                      <g style={{ opacity: dimmed ? 0.18 : 1, transition: 'opacity .28s ease' }}>
                        <text
                          x={SANKEY_XSRC - 10}
                          y={src.srcY0 + src.h / 2 - (src.h > 28 ? 6 : 0)}
                          textAnchor="end"
                          dominantBaseline={src.h > 28 ? 'auto' : 'middle'}
                          fontFamily="var(--font-display)"
                          fontSize="13"
                          fontWeight="500"
                          fill="#f9fafb"
                        >
                          {src.name}
                        </text>
                        {src.h > 28 && (
                          <text
                            x={SANKEY_XSRC - 10}
                            y={src.srcY0 + src.h / 2 + 9}
                            textAnchor="end"
                            fontFamily="var(--font-display)"
                            fontSize="10"
                            fontWeight="400"
                            fill={src.color}
                          >
                            {fmtCurrency(src.amount)}
                          </text>
                        )}
                      </g>
                    </g>
                  );
                })}
              </>
            )}

            {/* Income aggregator node — single tall white bar spanning the full chart height */}
            <rect
              x={SANKEY_XI - 1} y={PY} width={SANKEY_NW + 2} height={AVAIL_H}
              fill="#f9fafb" rx={4}
              style={{
                opacity: highlightedCat ? 0.25 : 1,
                transition: 'opacity .28s ease',
                filter: 'drop-shadow(0 0 4px rgba(249,250,251,0.18))',
              }}
            />
            <text
              x={SANKEY_XI + SANKEY_NW / 2} y={PY + AVAIL_H + 16}
              textAnchor="middle"
              fontFamily="var(--font-display)" fontSize="11" fontWeight="500" fill="#9ca3af"
            >
              {fmtCurrency(income)}
            </text>

            {/* Income slice tints */}
            {layout.map(cat => (
              <rect
                key={`inc-${cat.id}`}
                x={SANKEY_XI} y={cat.iY0} width={SANKEY_NW} height={cat.iY1 - cat.iY0}
                fill={cat.color} rx={0}
                style={{
                  opacity: highlightedCat && highlightedCat !== cat.id ? 0.03 : 0.22,
                  transition: 'opacity .28s ease',
                }}
              />
            ))}

            {/* Category groups */}
            {layout.map(cat => {
              const dimmed = !!highlightedCat && highlightedCat !== cat.id;
              const highlighted = highlightedCat === cat.id;
              const midY = cat.cY0 + cat.h / 2;
              const tall = cat.h > 28;
              const tipVal = `${fmtCurrency(cat.amount)} · ${cat.pct}% of income`;

              return (
                <g
                  key={cat.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleEnter(cat.id, cat.name, tipVal, e)}
                  onMouseMove={handleMove}
                  onMouseLeave={handleLeave}
                >
                  {/* Ribbon: income -> category */}
                  <path
                    d={ribbon(SANKEY_XI + SANKEY_NW, cat.iY0, cat.iY1, SANKEY_XC, cat.cY0, cat.cY1)}
                    fill={cat.color}
                    style={{
                      opacity: dimmed ? 0.02 : highlighted ? R_OP * 2.2 : R_OP,
                      transition: 'opacity .28s ease',
                    }}
                  />
                  {/* Category node */}
                  <rect
                    x={SANKEY_XC} y={cat.cY0} width={SANKEY_NW} height={cat.h}
                    fill={cat.color} rx={2}
                    style={{ opacity: dimmed ? 0.07 : 1, transition: 'opacity .28s ease' }}
                  />
                  {/* Category label */}
                  <g style={{ opacity: dimmed ? 0.07 : 1, transition: 'opacity .28s ease' }}>
                    <text
                      x={SANKEY_XC + SANKEY_NW + 14}
                      y={tall ? midY - 9 : midY}
                      dominantBaseline={tall ? 'auto' : 'middle'}
                      fontFamily="var(--font-display)"
                      fontSize={cat.h > 80 ? '16' : '14'}
                      fontWeight="600"
                      fill="#f9fafb"
                    >
                      {cat.name}
                    </text>
                    {tall && (
                      <text
                        x={SANKEY_XC + SANKEY_NW + 14}
                        y={midY + 8}
                        fontFamily="var(--font-display)"
                        fontSize="11" fontWeight="400"
                        fill="#6b7280"
                      >
                        {fmtCurrency(cat.amount)} · {cat.pct}%
                      </text>
                    )}
                  </g>

                  {/* Subcategories or pass-through */}
                  {cat.subs.length > 0 ? (
                    cat.subs.map(sub => (
                      <SubGroup
                        key={sub.name}
                        cat={cat}
                        sub={sub}
                        dimmed={dimmed}
                        onEnter={(e) => handleEnter(
                          cat.id,
                          sub.name,
                          `${fmtCurrency(sub.amount)} · ${((sub.amount / income) * 100).toFixed(1)}% of income`,
                          e,
                        )}
                        onLeave={handleLeave}
                      />
                    ))
                  ) : (
                    <>
                      <path
                        d={ribbon(SANKEY_XC + SANKEY_NW, cat.cY0, cat.cY1, SANKEY_XS, cat.cY0, cat.cY1)}
                        fill={cat.color}
                        style={{
                          opacity: dimmed ? 0.02 : highlighted ? SR_OP * 2.5 : SR_OP,
                          transition: 'opacity .28s ease',
                        }}
                      />
                      <rect
                        x={SANKEY_XS} y={cat.cY0} width={SANKEY_NW} height={cat.h}
                        fill={cat.color} rx={2}
                        style={{ opacity: dimmed ? N_OP * 0.07 : N_OP, transition: 'opacity .28s ease' }}
                      />
                      <RightLabel
                        x={SANKEY_XS + SANKEY_NW + 12}
                        y0={cat.cY0} h={cat.h}
                        name={cat.name} amount={cat.amount} color={cat.color}
                        dimmed={dimmed}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed bg-dark-card border border-dark-border px-4 py-2.5 rounded-xl pointer-events-none z-50 shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-display text-sm font-semibold text-text-primary">{tooltip.name}</div>
            <div className="text-xs text-text-muted mt-0.5">{tooltip.val}</div>
          </div>
        )}
      </Card>
    </motion.div>
  );
});
