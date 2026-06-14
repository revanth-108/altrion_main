import { useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { analysisService } from '@/services';

// ── Minimal Markdown renderer (paragraphs, bullets, **bold**, ### headings) ──
function inlineText(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-text-primary">{part}</strong> : part,
  );
}

function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (!bullets.length) return;
    nodes.push(
      <ul key={`ul-${key++}`} className="my-1 space-y-1 pl-4">
        {bullets.map((b, i) => (
          <li key={i} className="list-disc text-sm leading-relaxed text-text-secondary">
            {inlineText(b)}
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((line) => {
    const k = key++;
    if (line.startsWith('### ')) {
      flush();
      nodes.push(
        <h4 key={k} className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-altrion-300">
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      nodes.push(
        <p key={k} className="mt-1 text-sm leading-relaxed text-text-secondary">
          {inlineText(line)}
        </p>,
      );
    }
  });
  flush();

  return <div className="space-y-0.5">{nodes}</div>;
}

interface AiExplainProps {
  kind: 'monte_carlo' | 'financial_analysis';
  title?: string;
  /** Precomputed analysis result to summarize. */
  context: unknown;
  /** Disable when there is nothing to explain yet. */
  disabled?: boolean;
  /** Optional one-line description of what gets summarized. */
  hint?: string;
}

/**
 * One-click Claude summary of an analysis graph. Uses the server-configured
 * Claude API key — no key entry required.
 */
export function AiExplain({ kind, title, context, disabled = false, hint }: AiExplainProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (disabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analysisService.explainAnalysis({ kind, title, context });
      setExplanation(res.explanation);
    } catch (e) {
      const message =
        e instanceof Error && 'response' in e
          ? ((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? e.message)
          : e instanceof Error
            ? e.message
            : 'Failed to generate summary';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card variant="bordered" className="border-altrion-500/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-altrion-400" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Explain in plain English</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {hint ?? 'A clear, jargon-free summary of this chart — what happened, why, and how much.'}
            </p>
          </div>
        </div>
        <Button
          onClick={run}
          disabled={loading || disabled}
          className="flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? 'Summarizing…' : explanation ? 'Regenerate' : 'Summarize results'}
        </Button>
      </div>

      {disabled && (
        <p className="mt-3 text-xs text-text-muted">Run the analysis first, then generate a summary.</p>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {explanation && !loading && (
        <div className="mt-4 border-t border-dark-border pt-4">
          <MiniMarkdown text={explanation} />
          <p className="mt-3 border-t border-dark-border pt-3 text-[11px] leading-relaxed text-text-muted">
            For educational purposes only — not financial advice.
          </p>
        </div>
      )}
    </Card>
  );
}

export default AiExplain;
