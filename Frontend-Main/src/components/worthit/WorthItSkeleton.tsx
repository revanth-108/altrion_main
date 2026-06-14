import { Skeleton } from '@/components/ui/Skeleton';

export function WorthItSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={160} height={12} />
          <Skeleton variant="text" width={120} height={28} />
        </div>
        <Skeleton variant="rounded" width={140} height={36} />
      </div>

      {/* Progress bar */}
      <div className="space-y-2.5">
        <div className="flex gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={3} />
          ))}
        </div>
        <div className="flex justify-between">
          <Skeleton variant="text" width={120} height={12} />
          <Skeleton variant="text" width={140} height={12} />
        </div>
      </div>

      {/* Card skeleton */}
      <div className="flex items-center justify-center py-10">
        <div className="w-full max-w-sm rounded-2xl border border-dark-border bg-dark-card p-6 space-y-6">
          <div className="flex justify-between">
            <Skeleton variant="rounded" width={100} height={24} />
            <Skeleton variant="text" width={80} height={14} />
          </div>
          <div className="flex justify-center">
            <Skeleton variant="rounded" width={72} height={72} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Skeleton variant="text" width={140} height={20} />
            <Skeleton variant="text" width={180} height={14} />
          </div>
          <div className="flex justify-center">
            <Skeleton variant="text" width={200} height={60} />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-3">
        <Skeleton variant="rounded" width={130} height={56} />
        <Skeleton variant="rounded" width={110} height={56} />
        <Skeleton variant="rounded" width={130} height={56} />
      </div>
    </div>
  );
}
