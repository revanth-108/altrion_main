import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ScrollableListProps {
  children: ReactNode;
  maxHeight: number;
  className?: string;
}

/**
 * Scroll container with a custom always-visible green scroll indicator.
 * Bypasses macOS overlay scrollbars by hiding the native bar and rendering
 * our own indicator (track + thumb) in JSX. Works in any browser/OS.
 */
export function ScrollableList({ children, maxHeight, className = '' }: ScrollableListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const visible = el.clientHeight;
      const total = el.scrollHeight;
      if (total <= visible + 1) {
        // Content fits — show a faint full-height "thumb" so users still
        // perceive the bar as a UI element, not a void.
        setThumb({ top: 0, height: visible, visible: false });
        return;
      }
      const ratio = visible / total;
      const thumbHeight = Math.max(28, visible * ratio);
      const trackSpace = visible - thumbHeight;
      const scrollableSpace = total - visible;
      const thumbTop = scrollableSpace > 0 ? (el.scrollTop / scrollableSpace) * trackSpace : 0;
      setThumb({ top: thumbTop, height: thumbHeight, visible: true });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [children]);

  return (
    <div className="relative" style={{ height: maxHeight }}>
      <div
        ref={scrollRef}
        className={`scrollbar-hidden absolute inset-0 overflow-y-auto pr-3 ${className}`}
      >
        {children}
      </div>

      {/* Always-visible track */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-full w-1.5 rounded-full bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30"
      />
      {/* Thumb — vivid when scrollable, faint full-height when content fits */}
      <div
        aria-hidden
        className={`pointer-events-none absolute right-0 w-1.5 rounded-full transition-[height,top,opacity] duration-150 ease-out ${
          thumb.visible
            ? 'bg-gradient-to-b from-emerald-300 to-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)]'
            : 'bg-emerald-500/25'
        }`}
        style={{ top: thumb.top, height: thumb.height }}
      />
    </div>
  );
}
