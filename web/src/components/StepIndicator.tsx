import type { Step } from "../App";
import { cn } from "../lib/utils";

const STEPS: { num: Step; label: string }[] = [
  { num: 1, label: "Repository" },
  { num: 2, label: "Review" },
  { num: 3, label: "Export" },
];

interface Props {
  current: Step;
  maxVisited: Step;
  goTo: (s: Step) => void;
}

export default function StepIndicator({ current, maxVisited, goTo }: Props) {
  return (
    <nav className="flex items-center justify-center gap-2">
      {STEPS.map(({ num, label }, i) => {
        const clickable = num <= maxVisited;
        return (
          <div key={num} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && goTo(num)}
              className={cn(
                "flex items-center gap-2 transition-colors",
                clickable && num !== current && "cursor-pointer group",
                !clickable && "cursor-default",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  num < current &&
                    "bg-brand-600 text-white group-hover:bg-brand-500",
                  num === current &&
                    "bg-brand-600 text-white ring-2 ring-brand-400 ring-offset-2 ring-offset-zinc-950",
                  num > current && num <= maxVisited &&
                    "bg-brand-600/40 text-brand-200 group-hover:bg-brand-600",
                  num > maxVisited &&
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
                  "text-sm font-medium transition-colors",
                  num === current && "text-zinc-200",
                  num < current && "text-zinc-200 group-hover:text-white",
                  num > current && num <= maxVisited && "text-zinc-400 group-hover:text-zinc-200",
                  num > maxVisited && "text-zinc-500",
                )}
              >
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-px w-12",
                  num < current ? "bg-brand-600" : "bg-zinc-800",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
