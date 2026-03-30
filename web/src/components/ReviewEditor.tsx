import { useState, useEffect, useRef } from "react";
import type { Step, WizardState } from "../App";
import type { ProposedAction, FileCategory } from "../lib/analyzer";
import {
  analyzeTree,
  getShellFiles,
  parseSourceDirectives,
  matchSourceHints,
  CATEGORY_LABELS,
} from "../lib/analyzer";
import { fetchTree, fetchFileContent } from "../lib/github";
import { detectDependencies } from "../lib/dependency-detector";
import type { DetectedDependency } from "../lib/dependency-detector";
import type { HookDraft } from "../lib/manifest";
import type { Platform } from "../types/manifest";
import { cn } from "../lib/utils";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (s: Step) => void;
}

type Tab = "files" | "dependencies" | "commands" | "platforms";
type AnalysisPhase = "tree" | "files" | "deps" | "done" | "error";

export default function ReviewEditor({ state, update, goTo }: Props) {
  const [tab, setTab] = useState<Tab>("files");
  const [editingAction, setEditingAction] = useState<string | null>(null);

  // Analysis state
  const [phase, setPhase] = useState<AnalysisPhase>(
    state.actions.length > 0 ? "done" : "tree",
  );
  const [progress, setProgress] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const ran = useRef(state.actions.length > 0);

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
    const token = state.githubToken || undefined;

    try {
      setPhase("tree");
      setProgress("Fetching repository file tree...");
      const { tree, rateLimit } = await fetchTree(owner, repo, ref, token);
      update({ rateLimit });

      setPhase("files");
      setProgress(`Found ${tree.tree.length} entries. Scanning shell files...`);

      const shellFiles = getShellFiles(tree.tree);
      const hasBrEwfile = tree.tree.some(
        (e) => e.type === "blob" && e.path === "Brewfile",
      );
      const filesToFetch = [...shellFiles];
      if (hasBrEwfile) filesToFetch.push("Brewfile");

      const fileContents = new Map<string, string>();
      const BATCH_SIZE = 5;
      for (let i = 0; i < filesToFetch.length; i += BATCH_SIZE) {
        const batch = filesToFetch.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (path) => {
            const content = await fetchFileContent(owner, repo, ref, path, token);
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

      setProgress("Analyzing source/include directives...");
      const allHints = [];
      for (const [filePath, content] of fileContents) {
        allHints.push(...parseSourceDirectives(content, filePath));
      }
      const repoFilePaths = tree.tree
        .filter((e) => e.type === "blob")
        .map((e) => e.path);
      const sourceHintMap = matchSourceHints(allHints, repoFilePaths);

      setProgress("Building install plan...");
      const proposedActions = analyzeTree(tree.tree, sourceHintMap);

      setPhase("deps");
      setProgress("Detecting dependencies...");
      const deps = detectDependencies(fileContents);

      update({ actions: proposedActions, dependencies: deps });
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setAnalysisError(
        err instanceof Error ? err.message : "Analysis failed",
      );
    }
  }

  const isAnalyzing = phase !== "done" && phase !== "error";

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "files", label: "File Operations", count: state.actions.filter((a) => a.enabled).length },
    { id: "dependencies", label: "Packages", count: state.dependencies.filter((d) => d.enabled).length },
    { id: "commands", label: "Shell Commands", count: state.hooks.filter((h) => h.enabled).length },
    { id: "platforms", label: "Platforms" },
  ];

  function updateAction(id: string, patch: Partial<ProposedAction>) {
    update({
      actions: state.actions.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    });
  }

  function updateDep(id: string, patch: Partial<DetectedDependency>) {
    update({
      dependencies: state.dependencies.map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
    });
  }

  function addHook() {
    const hook: HookDraft = {
      id: `hook-${Date.now()}`,
      name: "",
      command: "",
      when: "post",
      enabled: true,
    };
    update({ hooks: [...state.hooks, hook] });
  }

  function updateHook(id: string, patch: Partial<HookDraft>) {
    update({
      hooks: state.hooks.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });
  }

  function removeHook(id: string) {
    update({ hooks: state.hooks.filter((h) => h.id !== id) });
  }

  function togglePlatform(p: Platform) {
    const has = state.platforms.includes(p);
    if (has && state.platforms.length === 1) return;
    update({
      platforms: has
        ? state.platforms.filter((x) => x !== p)
        : [...state.platforms, p],
    });
  }

  function moveAction(index: number, dir: -1 | 1) {
    const newActions = [...state.actions];
    const target = index + dir;
    if (target < 0 || target >= newActions.length) return;
    [newActions[index], newActions[target]] = [newActions[target]!, newActions[index]!];
    update({ actions: newActions });
  }

  const grouped = state.actions.reduce<Record<string, ProposedAction[]>>(
    (acc, action) => {
      const cat = action.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat]!.push(action);
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        {isAnalyzing
          ? `Analyzing ${state.repoMeta?.full_name ?? "repository"}...`
          : "Review Install Plan"}
      </h2>
      <p className="text-zinc-400 mb-6">
        {isAnalyzing
          ? "Scanning repository structure and detecting dependencies."
          : "Review and edit the install plan before generating the manifest."}
      </p>

      {/* Analysis progress */}
      {(isAnalyzing || analysisError) && (
        <div className="mb-8 space-y-3">
          <PhaseRow label="Fetch file tree" done={phase !== "tree"} active={phase === "tree"} />
          <PhaseRow label="Scan files & structure" done={phase === "deps" || phase === "done"} active={phase === "files"} />
          <PhaseRow label="Detect dependencies" done={phase === "done"} active={phase === "deps"} />
          {progress && isAnalyzing && (
            <p className="text-sm text-zinc-500 pl-8">{progress}</p>
          )}
          {analysisError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {analysisError}
              <button className="ml-4 underline hover:text-red-300" onClick={() => goTo(1)}>
                Go back
              </button>
            </div>
          )}
        </div>
      )}

      {/* Review UI (shown once analysis is done) */}
      {!isAnalyzing && !analysisError && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-zinc-800 mb-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.id
                    ? "border-brand-500 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-800 px-1.5 text-xs">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* File Operations tab */}
          {tab === "files" && (
            <div className="space-y-6">
              <p className="text-sm text-zinc-500 -mt-2 mb-2">
                Symlinks and copies that map repository files to paths on your system.
                Each row creates one symlink or copy during installation.
              </p>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900">
                    <h3 className="text-sm font-medium text-zinc-300">
                      {CATEGORY_LABELS[cat as FileCategory] ?? cat}
                    </h3>
                  </div>
                  <div className="divide-y divide-zinc-800/50">
                    {items.map((action) => {
                      const globalIdx = state.actions.indexOf(action);
                      const isEditing = editingAction === action.id;
                      return (
                        <div
                          key={action.id}
                          className={cn(
                            "px-4 py-3 transition-colors",
                            !action.enabled && "opacity-50",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={action.enabled}
                              onChange={(e) =>
                                updateAction(action.id, { enabled: e.target.checked })
                              }
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
                            />
                            <select
                              value={action.type}
                              onChange={(e) =>
                                updateAction(action.id, {
                                  type: e.target.value as ProposedAction["type"],
                                })
                              }
                              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 focus:ring-1 focus:ring-brand-500"
                            >
                              <option value="symlink">symlink</option>
                              <option value="copy">copy</option>
                            </select>
                            <span className="font-mono text-sm text-zinc-300 truncate">
                              {action.source}
                            </span>
                            <span className="text-zinc-600 text-sm">&rarr;</span>
                            {isEditing ? (
                              <input
                                type="text"
                                value={action.target}
                                onChange={(e) =>
                                  updateAction(action.id, { target: e.target.value })
                                }
                                onBlur={() => setEditingAction(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setEditingAction(null);
                                }}
                                className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 font-mono text-sm text-zinc-300 focus:ring-1 focus:ring-brand-500"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => setEditingAction(action.id)}
                                className="font-mono text-sm text-zinc-400 hover:text-zinc-200 truncate text-left"
                                title="Click to edit target path"
                              >
                                {action.target}
                              </button>
                            )}
                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => moveAction(globalIdx, -1)}
                                disabled={globalIdx === 0}
                                className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                                title="Move up"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                onClick={() => moveAction(globalIdx, 1)}
                                disabled={globalIdx === state.actions.length - 1}
                                className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                                title="Move down"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {action.platform && (
                            <span className="ml-11 mt-1 inline-block text-xs text-zinc-500">
                              Platform: {action.platform}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {state.actions.length === 0 && (
                <p className="text-center text-zinc-500 py-8">
                  No installable files detected. Go back and try a different repository.
                </p>
              )}
            </div>
          )}

          {/* Packages tab */}
          {tab === "dependencies" && (
            <div>
              <p className="text-sm text-zinc-500 -mt-2 mb-4">
                Packages detected from your shell configs and Brewfile.
                Confidence and evidence are shown here for review but are not included in the manifest.
                Only checked items will be listed in the manifest for installation.
              </p>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                {state.dependencies.length === 0 ? (
                  <p className="px-4 py-8 text-center text-zinc-500">
                    No dependencies detected.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-800/50">
                    {state.dependencies.map((dep) => (
                      <div
                        key={dep.id}
                        className={cn(
                          "px-4 py-3 transition-colors",
                          !dep.enabled && "opacity-50",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={dep.enabled}
                            onChange={(e) =>
                              updateDep(dep.id, { enabled: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
                          />
                          <span className="font-mono font-medium text-sm text-zinc-200 w-28">
                            {dep.name}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                              dep.confidence === "high"
                                ? "bg-green-500/20 text-green-400"
                                : dep.confidence === "medium"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-zinc-700 text-zinc-400",
                            )}
                          >
                            {dep.confidence}
                          </span>
                          <span className="text-xs text-zinc-500 truncate flex-1">
                            {dep.evidence}
                          </span>
                          <div className="shrink-0 text-xs text-zinc-600 space-x-2">
                            {dep.install.brew && (
                              <span>
                                brew:{" "}
                                <span className="text-zinc-400">{dep.install.brew}</span>
                              </span>
                            )}
                            {dep.install.apt && (
                              <span>
                                apt:{" "}
                                <span className="text-zinc-400">{dep.install.apt}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shell Commands tab */}
          {tab === "commands" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500 -mt-2 mb-2">
                Arbitrary shell commands that run before or after the file operations above.
                Use these for things like installing Vim plugins, sourcing a config, or running
                a setup script. These appear in the manifest and are shown to users before install.
              </p>
              {state.hooks.map((hook) => (
                <div
                  key={hook.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={hook.enabled}
                      onChange={(e) =>
                        updateHook(hook.id, { enabled: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
                    />
                    <input
                      type="text"
                      value={hook.name}
                      onChange={(e) =>
                        updateHook(hook.id, { name: e.target.value })
                      }
                      placeholder="Label (e.g. Install Vim plugins)"
                      className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-1 focus:ring-brand-500"
                    />
                    <select
                      value={hook.when}
                      onChange={(e) =>
                        updateHook(hook.id, {
                          when: e.target.value as "pre" | "post",
                        })
                      }
                      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-300 focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="pre">pre-install</option>
                      <option value="post">post-install</option>
                    </select>
                    <button
                      onClick={() => removeHook(hook.id)}
                      className="p-1 text-zinc-500 hover:text-red-400"
                      title="Remove"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={hook.command}
                    onChange={(e) =>
                      updateHook(hook.id, { command: e.target.value })
                    }
                    placeholder="Shell command to run"
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              ))}
              <button
                onClick={addHook}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Shell Command
              </button>
            </div>
          )}

          {/* Platforms tab */}
          {tab === "platforms" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <p className="text-sm text-zinc-400 mb-4">
                Select which operating systems this manifest supports.
              </p>
              <div className="flex gap-4">
                {(["macos", "linux"] as Platform[]).map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-5 py-4 cursor-pointer transition-colors",
                      state.platforms.includes(p)
                        ? "border-brand-500/50 bg-brand-500/10"
                        : "border-zinc-700 hover:border-zinc-600",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={state.platforms.includes(p)}
                      onChange={() => togglePlatform(p)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500"
                    />
                    <div>
                      <p className="font-medium text-zinc-200">
                        {p === "macos" ? "macOS" : "Linux"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {p === "macos"
                          ? "Homebrew package manager"
                          : "APT package manager"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={() => goTo(1)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        {!isAnalyzing && !analysisError && (
          <button
            onClick={() => goTo(3)}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Generate Manifest
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
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 items-center justify-center">
        {done ? (
          <svg className="h-5 w-5 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
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
          done ? "text-zinc-300" : active ? "text-zinc-100" : "text-zinc-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}
