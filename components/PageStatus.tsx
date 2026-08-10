import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { PageShell } from "@/components/ui";

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center gap-2.5 py-16 text-[13px] text-muted">
        <CircleNotchIcon
          size={22}
          weight="regular"
          aria-hidden
          className="animate-spin text-brand-600"
        />
        <span>{label}</span>
      </div>
    </PageShell>
  );
}

export function PageError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <PageShell>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-serious-soft bg-serious-soft px-4 py-3 text-[13px] text-[color:var(--color-serious)]">
        <WarningCircleIcon
          size={18}
          weight="fill"
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span>{message}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="w-fit rounded-md border border-[color:var(--color-serious)]/30 bg-white/70 px-2.5 py-1 text-[12px] font-medium text-[color:var(--color-serious)] transition hover:bg-white"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
