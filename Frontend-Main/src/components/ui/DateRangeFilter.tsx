import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TODAY_YEAR = new Date().getFullYear();
const TODAY_MONTH = new Date().getMonth();
const MIN_YEAR = 2020;

function monthPreset(year: number, monthIndex: number): { startDate: string; endDate: string } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const todayCap = new Date();
  todayCap.setHours(23, 59, 59, 999);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: (end > todayCap ? todayCap : end).toISOString().split('T')[0],
  };
}

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

interface DateRangeFilterProps {
  onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(TODAY_YEAR);
  const [activeMonth, setActiveMonth] = useState<number | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isFuture = (monthIndex: number) =>
    year > TODAY_YEAR || (year === TODAY_YEAR && monthIndex > TODAY_MONTH);

  const selectMonth = (monthIndex: number) => {
    if (isFuture(monthIndex)) return;
    const range = monthPreset(year, monthIndex);
    setActiveMonth(monthIndex);
    setActiveYear(year);
    onChange(range);
    setOpen(false);
  };

  const clearSelection = () => {
    setActiveMonth(null);
    setActiveYear(null);
    onChange({ startDate: null, endDate: null });
  };

  const prevYear = () => { if (year > MIN_YEAR) setYear(y => y - 1); };
  const nextYear = () => { if (year < TODAY_YEAR) setYear(y => y + 1); };

  const isActive = activeYear !== null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Filter by month"
        className={`
          flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-150 focus:outline-none
          ${isActive
            ? 'bg-altrion-500/20 border-altrion-500/60 text-altrion-400'
            : 'bg-dark-elevated border-dark-border text-text-muted hover:border-altrion-500/30 hover:text-text-primary'
          }
        `}
      >
        <Calendar size={14} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-dark-border bg-[#0f172a] shadow-2xl shadow-black/50 p-4"
          >
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={prevYear}
                disabled={year <= MIN_YEAR}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-dark-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>

              <span className="text-sm font-semibold text-text-primary tabular-nums">{year}</span>

              <button
                type="button"
                onClick={nextYear}
                disabled={year >= TODAY_YEAR}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-dark-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((month, i) => {
                const future = isFuture(i);
                const selected = activeMonth === i && activeYear === year;
                return (
                  <button
                    key={month}
                    type="button"
                    disabled={future}
                    onClick={() => selectMonth(i)}
                    className={`
                      rounded-lg py-2 text-xs font-medium transition-all
                      ${future
                        ? 'cursor-not-allowed text-text-muted opacity-30'
                        : selected
                        ? 'bg-altrion-500 text-white shadow shadow-altrion-500/30'
                        : 'bg-dark-elevated text-text-secondary hover:bg-altrion-500/10 hover:text-altrion-400'
                      }
                    `}
                  >
                    {month.slice(0, 3)}
                  </button>
                );
              })}
            </div>

            {/* Clear */}
            {isActive && (
              <button
                type="button"
                onClick={clearSelection}
                className="mt-3 w-full text-center text-[0.7rem] text-text-muted hover:text-altrion-400 transition-colors"
              >
                Clear filter
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
