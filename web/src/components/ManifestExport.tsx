import { useMemo, useState } from "react";
import type { Step, WizardState } from "../App";
import {
  buildManifest,
  serializeManifest,
  cleanManifest,
  generateInstallCommand,
} from "../lib/manifest";
import { createManifestPR, GitHubApiError } from "../lib/github";
import { cn } from "../lib/utils";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (s: Step) => void;
}

export default function ManifestExport({ state, update, goTo }: Props) {
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [prState, setPrState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState(state.githubToken);

  const hasToken = !!tokenInput.trim();

  const manifest = useMemo(() => {
    const raw = buildManifest({
      repoUrl: state.repoMeta
        ? state.repoMeta.html_url
        : `https://github.com/${state.owner}/${state.repo}`,
      ref: state.repoMeta?.default_branch ?? "main",
      platforms: state.platforms,
      actions: state.actions,
      dependencies: state.dependencies,
      hooks: state.hooks,
    });
    return cleanManifest(raw);
  }, [state]);

  const json = useMemo(() => serializeManifest(manifest), [manifest]);

  const installCmd = useMemo(
    () => generateInstallCommand(`${state.owner}/${state.repo}`),
    [state.owner, state.repo],
  );

  async function copyManifest() {
    await navigator.clipboard.writeText(json);
    setCopiedManifest(true);
    setTimeout(() => setCopiedManifest(false), 2000);
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(installCmd);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  }

  function download() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".dotfiles-manifest.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function openPR() {
    if (!hasToken) return;
    setPrState("loading");
    setPrError(null);
    try {
      const url = await createManifestPR(
        state.owner,
        state.repo,
        state.repoMeta?.default_branch ?? "main",
        json,
        tokenInput.trim(),
      );
      setPrUrl(url);
      setPrState("done");
      update({ githubToken: tokenInput.trim() });
      window.open(url, "_blank");
    } catch (err) {
      setPrState("error");
      if (err instanceof GitHubApiError) {
        if (err.status === 401 || err.status === 403) {
          setPrError(
            "Authentication failed. Make sure your token has the 'repo' scope.",
          );
        } else {
          setPrError(err.message);
        }
      } else {
        setPrError(
          err instanceof Error ? err.message : "Failed to create PR",
        );
      }
    }
  }

  const enabledActions = state.actions.filter((a) => a.enabled).length;
  const enabledDeps = state.dependencies.filter((d) => d.enabled).length;
  const enabledHooks = state.hooks.filter((h) => h.enabled).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        Your Manifest is Ready
      </h2>
      <p className="text-zinc-400 mb-8">
        Open a pull request to add the manifest to your repository, or download
        it manually.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledActions}</p>
          <p className="text-sm text-zinc-400">
            file operation{enabledActions !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledDeps}</p>
          <p className="text-sm text-zinc-400">
            package{enabledDeps !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledHooks}</p>
          <p className="text-sm text-zinc-400">
            shell command{enabledHooks !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Open PR section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
        <h3 className="font-medium text-zinc-200 mb-3">
          Add manifest to your repository
        </h3>

        {prState === "done" && prUrl ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            PR created successfully!{" "}
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-green-300"
            >
              View pull request
            </a>
          </div>
        ) : (
          <>
            {!state.githubToken && (
              <div className="mb-4 space-y-2">
                <label className="text-sm text-zinc-400">
                  GitHub personal access token with{" "}
                  <code className="text-zinc-300">repo</code> scope
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ghp_..."
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                  />
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=dotfiles-installer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  >
                    Create token
                  </a>
                </div>
                <p className="text-xs text-zinc-600">
                  Used only in your browser to create a PR. Never stored or sent
                  to any server.
                </p>
              </div>
            )}

            {prError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {prError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={openPR}
                disabled={!hasToken || prState === "loading"}
                className={cn(
                  "flex-1 rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white",
                  "hover:bg-brand-500 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "flex items-center justify-center gap-2",
                )}
              >
                {prState === "loading" ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating PR...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
                    </svg>
                    Open Pull Request
                  </>
                )}
              </button>
              <button
                onClick={download}
                className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Download manifest file instead"
              >
                Download
              </button>
            </div>
          </>
        )}
      </div>

      {/* Manifest preview */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden mb-6">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 bg-zinc-900">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-zinc-300">
              .dotfiles-manifest.json
            </span>
            <span className="text-xs text-zinc-600">
              {(new TextEncoder().encode(json).length / 1024).toFixed(1)} KB
            </span>
          </div>
          <button
            onClick={copyManifest}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              copiedManifest
                ? "border-green-500/50 bg-green-500/10 text-green-400"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
            )}
          >
            {copiedManifest ? "Copied!" : "Copy JSON"}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code>
            <ManifestHighlight json={json} />
          </code>
        </pre>
      </div>

      {/* Install command */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8">
        <h3 className="font-medium text-zinc-200 mb-3">
          One-line install command
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          After the manifest is merged, anyone can install with:
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-sm text-zinc-300">
            {installCmd}
          </pre>
          <button
            onClick={copyCommand}
            className={cn(
              "absolute right-2 top-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              copiedCommand
                ? "border-green-500/50 bg-green-500/10 text-green-400"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {copiedCommand ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => goTo(2)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Back to Edit
        </button>
        <button
          onClick={() => goTo(1)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}

function ManifestHighlight({ json }: { json: string }) {
  const lines = json.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="inline-block w-8 shrink-0 select-none text-right text-zinc-700 mr-4">
            {i + 1}
          </span>
          <span>{highlightLine(line)}</span>
        </div>
      ))}
    </>
  );
}

function highlightLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  const keyMatch = remaining.match(/^(\s*)"([^"]+)"(\s*:\s*)/);
  if (keyMatch) {
    parts.push(<span key={key++} className="text-zinc-500">{keyMatch[1]}</span>);
    parts.push(<span key={key++} className="text-brand-400">&quot;{keyMatch[2]}&quot;</span>);
    parts.push(<span key={key++} className="text-zinc-500">{keyMatch[3]}</span>);
    remaining = remaining.slice(keyMatch[0].length);
  }

  const strMatch = remaining.match(/^"([^"]*)"(.*)/);
  if (strMatch) {
    parts.push(<span key={key++} className="text-green-400">&quot;{strMatch[1]}&quot;</span>);
    parts.push(<span key={key++} className="text-zinc-500">{strMatch[2]}</span>);
    return parts;
  }

  const valMatch = remaining.match(/^(true|false|null|\d+)(.*)/);
  if (valMatch) {
    parts.push(<span key={key++} className="text-yellow-400">{valMatch[1]}</span>);
    parts.push(<span key={key++} className="text-zinc-500">{valMatch[2]}</span>);
    return parts;
  }

  parts.push(<span key={key++} className="text-zinc-400">{remaining}</span>);
  return parts;
}
