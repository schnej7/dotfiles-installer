import type {
  Manifest,
  Action,
  Dependency,
  Platform,
  HookAction,
} from "../types/manifest";
import type { ProposedAction } from "./analyzer";
import type { DetectedDependency } from "./dependency-detector";

const TOOL_VERSION = "dotfiles-installer@1.0.0";

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
