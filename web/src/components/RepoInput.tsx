import { useState } from "react";
import type { Step, WizardState } from "../App";
import { parseRepoUrl, fetchRepo, GitHubApiError } from "../lib/github";
import { cn } from "../lib/utils";

interface Props {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (s: Step) => void;
}

export default function RepoInput({ state, update, goTo }: Props) {
  const [url, setUrl] = useState(
    state.owner && state.repo
      ? `https://github.com/${state.owner}/${state.repo}`
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = parseRepoUrl(url);
    if (!parsed) {
      setError(
        "Invalid repository URL. Use a GitHub URL or owner/repo format.",
      );
      return;
    }

    setLoading(true);
    try {
      const result = await fetchRepo(parsed.owner, parsed.repo);
      update({
        owner: parsed.owner,
        repo: parsed.repo,
        repoMeta: result.repo,
        rateLimit: result.rateLimit,
      });
      goTo(2);
    } catch (err) {
      if (err instanceof GitHubApiError) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold tracking-tight">
          Make your dotfiles installable
        </h2>
        <p className="mt-3 text-zinc-400 text-lg">
          Paste a public GitHub repository URL. We'll analyze it and generate a
          manifest for one-line installation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/dotfiles"
            className={cn(
              "w-full rounded-xl border bg-zinc-900 px-5 py-4 text-lg",
              "placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500",
              "transition-colors",
              error
                ? "border-red-500/50 focus:ring-red-500"
                : "border-zinc-700 hover:border-zinc-600",
            )}
            autoFocus
            disabled={loading}
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-brand-400" />
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className={cn(
            "w-full rounded-xl bg-brand-600 px-5 py-4 text-lg font-medium text-white",
            "hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-zinc-950",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all",
          )}
        >
          {loading ? "Fetching repository..." : "Analyze Repository"}
        </button>
      </form>

      {state.repoMeta && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center gap-3">
            <img
              src={state.repoMeta.owner.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full"
            />
            <div>
              <p className="font-medium">{state.repoMeta.full_name}</p>
              {state.repoMeta.description && (
                <p className="text-sm text-zinc-400">
                  {state.repoMeta.description}
                </p>
              )}
            </div>
            <span className="ml-auto text-sm text-zinc-500">
              {state.repoMeta.stargazers_count.toLocaleString()} stars
            </span>
          </div>
        </div>
      )}

      <div className="mt-12 rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-6">
        <h3 className="font-medium text-zinc-300 mb-4">How it works</h3>
        <ol className="space-y-3 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
              1
            </span>
            <span>
              Paste your repository URL and we scan its structure using the
              GitHub API.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
              2
            </span>
            <span>
              Review detected dotfiles, config directories, and dependencies.
              Edit the install plan.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
              3
            </span>
            <span>
              Download the generated manifest and commit it to your repo root as{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-brand-400">
                .dotfiles-manifest.json
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
              4
            </span>
            <span>
              Anyone can install with a single command:{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-brand-400">
                curl ... | bash -s -- user/repo
              </code>
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
