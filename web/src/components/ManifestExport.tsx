import { useMemo, useState } from "react";
import type { Step, WizardState } from "../App";
import {
  buildManifest,
  serializeManifest,
  cleanManifest,
  generateInstallCommand,
} from "../lib/manifest";
import { cn } from "../lib/utils";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (s: Step) => void;
}

export default function ManifestExport({ state, update: _, goTo }: Props) {
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);

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

  const enabledActions = state.actions.filter((a) => a.enabled).length;
  const enabledDeps = state.dependencies.filter((d) => d.enabled).length;
  const enabledHooks = state.hooks.filter((h) => h.enabled).length;

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-2xl font-bold tracking-tight mb-2">
        Your Manifest is Ready
      </h2>
      <p className="text-zinc-400 mb-8">
        Download the manifest, commit it to your repository root, and share the
        install command.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledActions}</p>
          <p className="text-sm text-zinc-400">
            action{enabledActions !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledDeps}</p>
          <p className="text-sm text-zinc-400">
            dependenc{enabledDeps !== 1 ? "ies" : "y"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <p className="text-2xl font-bold text-brand-400">{enabledHooks}</p>
          <p className="text-sm text-zinc-400">
            hook{enabledHooks !== 1 ? "s" : ""}
          </p>
        </div>
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
          <div className="flex items-center gap-2">
            <button
              onClick={copyManifest}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                copiedManifest
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
              )}
            >
              {copiedManifest ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={download}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
            >
              Download
            </button>
          </div>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code>
            <ManifestHighlight json={json} />
          </code>
        </pre>
      </div>

      {/* Install command */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
        <h3 className="font-medium text-zinc-200 mb-3">
          One-line install command
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          After committing the manifest to your repo, anyone can install with:
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

      {/* Next steps */}
      <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-5 mb-8">
        <h3 className="font-medium text-zinc-300 mb-3">Next steps</h3>
        <ol className="space-y-2 text-sm text-zinc-400 list-decimal list-inside">
          <li>
            Download{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-xs text-brand-400">
              .dotfiles-manifest.json
            </code>{" "}
            and place it at the root of your repository.
          </li>
          <li>Commit and push the manifest file.</li>
          <li>Share the install command with your users or in your README.</li>
        </ol>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => goTo(3)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Back to Edit
        </button>
        <button
          onClick={() => {
            goTo(1);
          }}
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
          <span>
            {highlightLine(line)}
          </span>
        </div>
      ))}
    </>
  );
}

function highlightLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  // Match JSON key
  const keyMatch = remaining.match(/^(\s*)"([^"]+)"(\s*:\s*)/);
  if (keyMatch) {
    parts.push(
      <span key={key++} className="text-zinc-500">{keyMatch[1]}</span>,
    );
    parts.push(
      <span key={key++} className="text-brand-400">&quot;{keyMatch[2]}&quot;</span>,
    );
    parts.push(
      <span key={key++} className="text-zinc-500">{keyMatch[3]}</span>,
    );
    remaining = remaining.slice(keyMatch[0].length);
  }

  // Match string value
  const strMatch = remaining.match(/^"([^"]*)"(.*)/);
  if (strMatch) {
    parts.push(
      <span key={key++} className="text-green-400">&quot;{strMatch[1]}&quot;</span>,
    );
    parts.push(
      <span key={key++} className="text-zinc-500">{strMatch[2]}</span>,
    );
    return parts;
  }

  // Match boolean/number
  const valMatch = remaining.match(/^(true|false|null|\d+)(.*)/);
  if (valMatch) {
    parts.push(
      <span key={key++} className="text-yellow-400">{valMatch[1]}</span>,
    );
    parts.push(
      <span key={key++} className="text-zinc-500">{valMatch[2]}</span>,
    );
    return parts;
  }

  // Everything else (brackets, commas, whitespace)
  parts.push(
    <span key={key++} className="text-zinc-400">{remaining}</span>,
  );

  return parts;
}
