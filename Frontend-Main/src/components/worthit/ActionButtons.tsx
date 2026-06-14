import { Button } from '@/components/ui/Button';
import { Undo2, SkipForward } from 'lucide-react';
import type { WorthItRatingValue } from '@/types';

interface ActionButtonsProps {
  onCut: () => void;
  onKeep: () => void;
  onSkip: () => void;
  onSkipSession: () => void;
  onUndo?: () => void;
  disabled?: boolean;
  canUndo?: boolean;
  existingRating?: WorthItRatingValue;
}

export function ActionButtons({
  onCut,
  onKeep,
  onSkip,
  onSkipSession,
  onUndo,
  disabled,
  canUndo,
  existingRating,
}: ActionButtonsProps) {
  const isReRate = Boolean(existingRating);
  const cutDisabled = disabled || existingRating === 'cut';
  const keepDisabled = disabled || existingRating === 'keep';
  const cutLabel = isReRate ? 'Change to Cut' : 'Cut';
  const keepLabel = isReRate ? 'Change to Keep' : 'Keep';

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        {/* Cut */}
        <Button
          onClick={onCut}
          disabled={cutDisabled}
          variant="secondary"
          className="w-[140px] !bg-red-500/10 !border-red-500/30 !text-red-400 hover:!bg-red-500/20 hover:ring-2 hover:ring-red-400/40 transition-all"
        >
          <span className="text-[15px] font-bold tracking-wide">{cutLabel}</span>
        </Button>

        {/* Skip / Undo */}
        {canUndo ? (
          <Button
            onClick={onUndo}
            disabled={disabled}
            variant="ghost"
            size="sm"
            className="w-[110px] flex-col gap-1"
          >
            <Undo2 size={18} />
            <span className="text-xs font-semibold">Undo</span>
          </Button>
        ) : (
          <Button
            onClick={onSkip}
            disabled={disabled || isReRate}
            variant="ghost"
            className="w-[110px] flex-col gap-1"
          >
            <SkipForward size={18} />
            <span className="text-[13px] font-semibold">Skip</span>
          </Button>
        )}

        {/* Keep */}
        <Button
          onClick={onKeep}
          disabled={keepDisabled}
          variant="primary"
          className="w-[140px] hover:ring-2 hover:ring-altrion-400/40 transition-all"
        >
          <span className="text-[15px] font-bold tracking-wide">{keepLabel}</span>
        </Button>
      </div>

      <button
        onClick={onSkipSession}
        className="text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        Skip this week's session
      </button>
    </div>
  );
}
