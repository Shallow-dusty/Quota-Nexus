export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={`skeleton inline-block ${className ?? ""}`.trim()}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="surface-stable p-4 flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <Skeleton className="!w-7 !h-7 rounded-lg" />
        <span className="flex flex-col gap-1.5 flex-1">
          <Skeleton className="!w-24 !h-3.5" />
          <Skeleton className="!w-16 !h-2.5" />
        </span>
        <Skeleton className="!w-12 !h-5 rounded-full" />
      </div>
      <span className="flex flex-col gap-3 mt-1">
        {[0, 1].map((i) => (
          <span key={i} className="flex flex-col gap-2">
            <span className="flex justify-between">
              <Skeleton className="!w-16 !h-3" />
              <Skeleton className="!w-10 !h-3" />
            </span>
            <Skeleton className="!w-full !h-[5px] rounded-full" />
            <Skeleton className="!w-32 !h-2.5" />
          </span>
        ))}
      </span>
    </div>
  );
}