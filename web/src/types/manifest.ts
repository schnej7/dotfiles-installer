export type Platform = "macos" | "linux";
export type ActionType = "symlink" | "copy" | "mkdir" | "hook";
export type HookWhen = "pre" | "post";
export type Confidence = "high" | "medium" | "low";

export interface SymlinkAction {
  type: "symlink";
  source: string;
  target: string;
  platform?: Platform;
  overwrite?: boolean;
}

export interface CopyAction {
  type: "copy";
  source: string;
  target: string;
  platform?: Platform;
  overwrite?: boolean;
}

export interface MkdirAction {
  type: "mkdir";
  target: string;
  platform?: Platform;
}

export interface HookAction {
  type: "hook";
  name: string;
  command: string;
  when: HookWhen;
  platform?: Platform;
}

export type Action = SymlinkAction | CopyAction | MkdirAction | HookAction;

export interface DependencyInstall {
  brew?: string;
  apt?: string;
}

export interface Dependency {
  name: string;
  install: DependencyInstall;
}

export interface Repository {
  url: string;
  ref?: string;
}

export interface Manifest {
  schemaVersion: "1.0.0";
  generatedBy: string;
  generatedAt: string;
  repository: Repository;
  platforms: Platform[];
  actions: Action[];
  dependencies?: Dependency[];
}

export interface RepoActionDraft extends Omit<Action, "type"> {
  type: ActionType;
  enabled: boolean;
  id: string;
}

export interface DependencyDraft extends Dependency {
  confidence: Confidence;
  evidence?: string;
  enabled: boolean;
  id: string;
}
