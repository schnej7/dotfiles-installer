import { useState, useEffect, useRef } from "react";
import type { Step, WizardState } from "../App";
import { fetchTree, fetchFileContent } from "../lib/github";
import { analyzeTree, getShellFiles, CATEGORY_LABELS, type ProposedAction, type FileCategory } from "../lib/analyzer";
import { detectDependencies } from "../lib/dependency-detector";
import { cn } from "../lib/utils";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (s: Step) => void;
}

type Phase = "tree" | "files" | "deps" | "done" | "error";

export default function Analysis({ state, update, goTo }: Props) {
  const [phase, setPhase] = useState<Phase>("tree");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalysis() {
    const { owner, repo, repoMeta } = state;
    if (!repoMeta) return;
    const ref = repoMeta.default_branch;

    try {
      setPhase("tree");
      setProgress("Fetching repository file tree...");
      const { tree, rateLimit } = await fetchTree(owner, repo, ref);
      update({ rateLimit });

      setPhase("files");
      setProgress(`Found ${tree.tree.length} entries. Analyzing structure...`);
      const proposedActions = analyzeTree(tree.tree);
      setActions(proposedActions);

      const shellFiles = getShellFiles(tree.tree);
      const hasBrEwfile = tree.tree.some(
        (e) => e.type === "blob" && e.path === "Brewfile",
      );
      const filesToFetch = [...shellFiles];
      if (hasBrEwfile) filesToFetch.push("Brewfile");

      setProgress(
        `Scanning ${filesToFetch.length} file(s) for dependencies...`,
      );
      const fileContents = new Map<string, string>();

      const BATCH_SIZE = 5;
      for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
        const batch = filesToFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (path) => {
            const content = await fetchFileContent(owner, repo, ref, path);
            return { path, content };
          }),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            fileContents.set(r.value.path, r.value.content);
          }
        }
        setProgress(
          `Scanned ${Math.min(i + BATCH_SIZE, filesToFetch.length)}/${filesToFetch.length} files...`,
        );
      }

      setPhase("deps");
      setProgress("Detecting dependencies...");
      const deps = detectDependencies(fileContents);

      update({
        actions: proposedActions,
        dependencies: deps,
      });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  const grouped = actions.reduce<Record<string, ProposedAction[]>>(
    (acc, action) => {
      const cat = action.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(action);
      return acc;
    },
    {},
  );

  const isDone = phase === "done";

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        Analyzing {state.repoMeta?.full_name}
      </h2>
      <p className="text-zinc-400 mb-8">
        Scanning repository structure and detecting dependencies.
      </p>

      {/* Progress */}
      <div className="mb-8 space-y-3">
        <PhaseRow
          label="Fetch file tree"
          done={phase !== "tree"}
          active={phase === "tree"}
          error={phase === "error" && !actions.length}
        />
        <PhaseRow
          label="Analyze structure"
          done={phase === "deps" || isDone}
          active={phase === "files"}
          error={false}
        />
        <PhaseRow
          label="Detect dependencies"
          done={isDone}
          active={phase === "deps"}
          error={false}
        />

        {progress && !isDone && (
          <p className="text-sm text-zinc-500 pl-8">{progress}</p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button
            className="ml-4 underline hover:text-red-300"
            onClick={() => goTo(1)}
          >
            Go back
          </button>
        </div>
      )}

      {/* Results preview */}
      {actions.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="font-medium mb-4">
              Detected {actions.length} installable item(s)
            </h3>
            <div className="space-y-4">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">
                    {CATEGORY_LABELS[cat as FileCategory] ?? cat}
                  </h4>
                  <ul className="space-y-1">
                    {items.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 text-sm py-1 px-3 rounded-lg hover:bg-zinc-800/50"
                      >
                        <span
                          className={cn(
                            "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                            a.type === "symlink"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-green-500/20 text-green-400",
                          )}
                        >
                          {a.type}
                        </span>
                        <span className="font-mono text-zinc-300">
                          {a.source}
                        </span>
                        <span className="text-zinc-600">&rarr;</span>
                        <span className="font-mono text-zinc-400">
                          {a.target}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {state.dependencies.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h3 className="font-medium mb-4">
                Detected {state.dependencies.length} dependenc
                {state.dependencies.length === 1 ? "y" : "ies"}
              </h3>
              <ul className="space-y-2">
                {state.dependencies.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 text-sm py-1 px-3 rounded-lg hover:bg-zinc-800/50"
                  >
                    <span className="font-mono font-medium text-zinc-200">
                      {d.name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                        d.confidence === "high"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400",
                      )}
                    >
                      {d.confidence}
                    </span>
                    <span className="text-xs text-zinc-500 truncate max-w-[300px]">
                      {d.evidence}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={() => goTo(1)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        {isDone && (
          <button
            onClick={() => goTo(3)}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Review &amp; Edit
          </button>
        )}
      </div>
    </div>
  );
}

function PhaseRow({
  label,
  done,
  active,
  error,
}: {
  label: string;
  done: boolean;
  active: boolean;
  error: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 items-center justify-center">
        {error ? (
          <div className="h-4 w-4 rounded-full bg-red-500" />
        ) : done ? (
          <svg
            className="h-5 w-5 text-brand-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : active ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-brand-400" />
        ) : (
          <div className="h-3 w-3 rounded-full bg-zinc-700" />
        )}
      </div>
      <span
        className={cn(
          "text-sm font-medium",
          done
            ? "text-zinc-300"
            : active
              ? "text-zinc-100"
              : "text-zinc-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}
