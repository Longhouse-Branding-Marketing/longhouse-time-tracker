import { ChartBarIcon } from "@phosphor-icons/react/ssr";

export function ChartEmpty({ message = "No data for this selection" }: { message?: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-line bg-tint/40 px-6 text-center">
      <ChartBarIcon
        size={28}
        weight="regular"
        aria-hidden
        className="text-brand-600"
      />
      <p className="text-[13px] text-muted">{message}</p>
    </div>
  );
}
