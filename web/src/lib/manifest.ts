import type {
  Manifest,
  Action,
  Dependency,
  Platform,
  HookAction,
} from "../types/manifest";
import type { ProposedAction, FileCategory } from "./analyzer";
import type { DetectedDependency } from "./dependency-detector";

const TOOL_VERSION = "dotfiles-installer@1.0.0";

function inferCategory(target: string): FileCategory {
  const t = target.toLowerCase();
  if (t.startsWith("~/.config/")) return "xdg-config";
  if (/\/\.?(bash|zsh|profile|inputrc|aliases|functions|exports|fish)/.test(t)) return "shell-config";
  if (/\/\.?(vim|gvim|nvim|editor)/.test(t)) return "editor-config";
  if (/\/\.?(tmux|screen|wezterm|alacritty|kitty)/.test(t)) return "terminal-config";
  if (/\/\.?git(config|ignore|attributes)/.test(t)) return "git-config";
  if (/\/\.local\/(bin|scripts)\//.test(t)) return "script";
  return "other-dotfile";
}

export interface LoadedManifestState {
  actions: ProposedAction[];
  dependencies: DetectedDependency[];
  hooks: HookDraft[];
  platforms: Platform[];
}

export function parseManifestToState(jsonStr: string): LoadedManifestState | null {
  try {
    const manifest: Manifest = JSON.parse(jsonStr);
    if (manifest.schemaVersion !== "1.0.0") return null;

    let actionId = 0;
    let depId = 0;
    let hookId = 0;

    const actions: ProposedAction[] = [];
    const hooks: HookDraft[] = [];

    for (const action of manifest.actions ?? []) {
      if (action.type === "hook") {
        const h = action as HookAction;
        hooks.push({
          id: `mhook-${++hookId}`,
          name: h.name,
          command: h.command,
          when: h.when,
          platform: h.platform,
          enabled: true,
        });
      } else {
        const source = "source" in action ? (action as { source: string }).source : "";
        const target = action.target;
        actions.push({
          id: `mact-${++actionId}`,
          type: action.type,
          source,
          target,
          platform: action.platform,
          overwrite: "overwrite" in action ? !!(action as { overwrite?: boolean }).overwrite : false,
          enabled: true,
          category: inferCategory(target),
        });
      }
    }

    const dependencies: DetectedDependency[] = (manifest.dependencies ?? []).map(
      (d: Dependency) => ({
        id: `mdep-${++depId}`,
        name: d.name,
        confidence: "high" as const,
        evidence: "From existing manifest",
        install: d.install,
        enabled: true,
      }),
    );

    return {
      actions,
      dependencies,
      hooks,
      platforms: manifest.platforms ?? ["macos", "linux"],
    };
  } catch {
    return null;
  }
}

export interface HookDraft {
  id: string;
  name: string;
  command: string;
  when: "pre" | "post";
  platform?: Platform;
  enabled: boolean;
}

export function buildManifest(options: {
  repoUrl: string;
  ref: string;
  platforms: Platform[];
  actions: ProposedAction[];
  dependencies: DetectedDependency[];
  hooks: HookDraft[];
}): Manifest {
  const fileActions: Action[] = options.actions
    .filter((a) => a.enabled)
    .map((a) => {
      const base = { platform: a.platform, overwrite: a.overwrite };
      switch (a.type) {
        case "symlink":
          return { type: "symlink" as const, source: a.source, target: a.target, ...base };
        case "copy":
          return { type: "copy" as const, source: a.source, target: a.target, ...base };
        case "mkdir":
          return { type: "mkdir" as const, target: a.target, ...base };
        case "hook":
          return null;
      }
    })
    .filter((a): a is Action => a !== null);

  const hookActions: HookAction[] = options.hooks
    .filter((h) => h.enabled)
    .map((h) => ({
      type: "hook" as const,
      name: h.name,
      command: h.command,
      when: h.when,
      platform: h.platform,
    }));

  const preHooks = hookActions.filter((h) => h.when === "pre");
  const postHooks = hookActions.filter((h) => h.when === "post");
  const allActions: Action[] = [...preHooks, ...fileActions, ...postHooks];

  const deps: Dependency[] = options.dependencies
    .filter((d) => d.enabled)
    .map((d) => ({
      name: d.name,
      install: d.install,
    }));

  const manifest: Manifest = {
    schemaVersion: "1.0.0",
    generatedBy: TOOL_VERSION,
    generatedAt: new Date().toISOString(),
    repository: {
      url: options.repoUrl,
      ref: options.ref,
    },
    platforms: options.platforms,
    actions: allActions,
  };

  if (deps.length > 0) {
    manifest.dependencies = deps;
  }

  return manifest;
}

export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function generateInstallCommand(repoSlug: string): string {
  return `curl -fsSL https://raw.githubusercontent.com/schnej7/dotfiles-installer/main/installer/install.sh | bash -s -- ${repoSlug}`;
}

function stripUndefined(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    );
  }
  return obj;
}

export function cleanManifest(manifest: Manifest): Manifest {
  return stripUndefined(manifest) as Manifest;
}
