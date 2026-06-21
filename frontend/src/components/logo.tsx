import { cn } from "@/lib/utils";

export function Logo({ showText = true, className }: { showText?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          {/* A calendar with a confirming check — the booking + confirm idea. */}
          <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M3 9h18M8 3v3M16 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8.5 14.5l2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && <span className="text-[15px] font-semibold tracking-tight">Reservo</span>}
    </div>
  );
}
