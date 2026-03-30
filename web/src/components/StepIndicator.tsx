import type { Step } from "../App";
import { cn } from "../lib/utils";

const STEPS: { num: Step; label: string }[] = [
  { num: 1, label: "Repository" },
  { num: 2, label: "Review" },
  { num: 3, label: "Export" },
];

export default function StepIndicator({ current }: { current: Step }) {
  return (
    <nav className="flex items-center justify-center gap-2">
      {STEPS.map(({ num, label }, i) => (
        <div key={num} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                num < current &&
                  "bg-brand-600 text-white",
                num === current &&
                  "bg-brand-600 text-white ring-2 ring-brand-400 ring-offset-2 ring-offset-zinc-950",
                num > current &&
                  "bg-zinc-800 text-zinc-500",
              )}
            >
              {num < current ? (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                num
              )}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                num <= current ? "text-zinc-200" : "text-zinc-500",
              )}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-2 h-px w-12",
                num < current ? "bg-brand-600" : "bg-zinc-800",
              )}
            />
          )}
        </div>
      ))}
    </nav>
  );
}
