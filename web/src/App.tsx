import { useState, useCallback } from "react";
import type { GitHubRepo, RateLimitInfo } from "./lib/github";
import type { ProposedAction } from "./lib/analyzer";
import type { DetectedDependency } from "./lib/dependency-detector";
import type { HookDraft } from "./lib/manifest";
import type { Platform } from "./types/manifest";
import StepIndicator from "./components/StepIndicator";
import RepoInput from "./components/RepoInput";
import ReviewEditor from "./components/ReviewEditor";
import ManifestExport from "./components/ManifestExport";

export type Step = 1 | 2 | 3;

export interface WizardState {
  owner: string;
  repo: string;
  repoMeta: GitHubRepo | null;
  rateLimit: RateLimitInfo | null;
  actions: ProposedAction[];
  dependencies: DetectedDependency[];
  hooks: HookDraft[];
  platforms: Platform[];
  githubToken: string;
}

const INITIAL_STATE: WizardState = {
  owner: "",
  repo: "",
  repoMeta: null,
  rateLimit: null,
  actions: [],
  dependencies: [],
  hooks: [],
  platforms: ["macos", "linux"],
  githubToken: "",
};

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [maxVisited, setMaxVisited] = useState<Step>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  const updateState = useCallback(
    (patch: Partial<WizardState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    [],
  );

  const goTo = useCallback((s: Step) => {
    setStep(s);
    setMaxVisited((prev) => Math.max(prev, s) as Step);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <svg
                viewBox="0 0 32 32"
                fill="none"
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 16l4 4 8-8"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              dotfiles-installer
            </h1>
          </div>
          <a
            href="https://github.com/jeromesch/dotfiles-installer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <StepIndicator current={step} maxVisited={maxVisited} goTo={goTo} />

          <div className="mt-8">
            {step === 1 && (
              <RepoInput state={state} update={updateState} goTo={goTo} />
            )}
            {step === 2 && (
              <ReviewEditor state={state} update={updateState} goTo={goTo} />
            )}
            {step === 3 && (
              <ManifestExport state={state} update={updateState} goTo={goTo} />
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-xs text-zinc-500">
        dotfiles-installer v1.0.0 &middot; Manifest-driven dotfiles
        installation
        {state.rateLimit && (
          <span className="ml-4">
            GitHub API: {state.rateLimit.remaining}/{state.rateLimit.limit}{" "}
            requests remaining
          </span>
        )}
      </footer>
    </div>
  );
}
