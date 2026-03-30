import type { GitHubTreeEntry } from "./github";
import type { ActionType, Platform } from "../types/manifest";

export interface ProposedAction {
  id: string;
  type: ActionType;
  source: string;
  target: string;
  platform?: Platform;
  overwrite: boolean;
  enabled: boolean;
  category: FileCategory;
}

export type FileCategory =
  | "shell-config"
  | "git-config"
  | "editor-config"
  | "terminal-config"
  | "xdg-config"
  | "script"
  | "other-dotfile"
  | "ignored";

interface PatternRule {
  match: (path: string, depth: number) => boolean;
  category: FileCategory;
  targetFn: (path: string) => string;
  type: "symlink" | "copy";
}

const KNOWN_DOTFILES: Record<string, { category: FileCategory; target: string }> = {
  ".zshrc": { category: "shell-config", target: "~/.zshrc" },
  ".bashrc": { category: "shell-config", target: "~/.bashrc" },
  ".bash_profile": { category: "shell-config", target: "~/.bash_profile" },
  ".profile": { category: "shell-config", target: "~/.profile" },
  ".zshenv": { category: "shell-config", target: "~/.zshenv" },
  ".zprofile": { category: "shell-config", target: "~/.zprofile" },
  ".aliases": { category: "shell-config", target: "~/.aliases" },
  ".functions": { category: "shell-config", target: "~/.functions" },
  ".exports": { category: "shell-config", target: "~/.exports" },
  ".inputrc": { category: "shell-config", target: "~/.inputrc" },
  ".gitconfig": { category: "git-config", target: "~/.gitconfig" },
  ".gitignore_global": { category: "git-config", target: "~/.gitignore_global" },
  ".gitattributes_global": { category: "git-config", target: "~/.gitattributes_global" },
  ".vimrc": { category: "editor-config", target: "~/.vimrc" },
  ".gvimrc": { category: "editor-config", target: "~/.gvimrc" },
  ".editorconfig": { category: "editor-config", target: "~/.editorconfig" },
  ".tmux.conf": { category: "terminal-config", target: "~/.tmux.conf" },
  ".screenrc": { category: "terminal-config", target: "~/.screenrc" },
  ".wezterm.lua": { category: "terminal-config", target: "~/.wezterm.lua" },
  ".ripgreprc": { category: "other-dotfile", target: "~/.ripgreprc" },
  ".curlrc": { category: "other-dotfile", target: "~/.curlrc" },
  ".wgetrc": { category: "other-dotfile", target: "~/.wgetrc" },
  ".hushlogin": { category: "other-dotfile", target: "~/.hushlogin" },
  ".gemrc": { category: "other-dotfile", target: "~/.gemrc" },
  ".npmrc": { category: "other-dotfile", target: "~/.npmrc" },
  ".yarnrc": { category: "other-dotfile", target: "~/.yarnrc" },
  "starship.toml": { category: "shell-config", target: "~/.config/starship.toml" },
  ".starship.toml": { category: "shell-config", target: "~/.config/starship.toml" },
};

const IGNORED_PATHS = new Set([
  ".git",
  ".github",
  ".gitignore",
  ".gitmodules",
  ".gitattributes",
  "README.md",
  "README",
  "readme.md",
  "LICENSE",
  "LICENSE.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  ".dotfiles-manifest.json",
  ".editorconfig",
  ".vscode",
  ".idea",
  "Makefile",
  "Brewfile",
  "Brewfile.lock.json",
  "install.sh",
  "setup.sh",
  "bootstrap.sh",
]);

const IGNORED_EXTENSIONS = new Set([".md", ".txt", ".png", ".jpg", ".gif", ".svg"]);

const XDG_CONFIG_DIRS = new Set([
  "nvim",
  "alacritty",
  "kitty",
  "wezterm",
  "hyper",
  "fish",
  "tmux",
  "starship",
  "bat",
  "htop",
  "lazygit",
  "lsd",
  "zellij",
  "yabai",
  "skhd",
  "karabiner",
  "gh",
  "neofetch",
  "fastfetch",
  "ranger",
  "yazi",
  "rofi",
  "i3",
  "sway",
  "waybar",
  "dunst",
  "picom",
  "polybar",
]);

function isIgnored(path: string): boolean {
  const basename = path.split("/").pop() ?? "";
  if (IGNORED_PATHS.has(path) || IGNORED_PATHS.has(basename)) return true;
  const ext = basename.includes(".") ? "." + basename.split(".").pop() : "";
  if (IGNORED_EXTENSIONS.has(ext)) return true;
  if (path.startsWith(".git/")) return true;
  return false;
}

function depth(path: string): number {
  return path.split("/").length - 1;
}

const RULES: PatternRule[] = [
  // .config/<app>/ directories -> ~/.config/<app>/
  {
    match: (p, d) => p.startsWith(".config/") && d === 1 && !isIgnored(p),
    category: "xdg-config",
    targetFn: (p) => `~/${p}`,
    type: "symlink",
  },
  // config/<known-app>/ directories (without dot prefix)
  {
    match: (p) => {
      if (!p.startsWith("config/")) return false;
      const app = p.split("/")[1];
      return app !== undefined && XDG_CONFIG_DIRS.has(app);
    },
    category: "xdg-config",
    targetFn: (p) => `~/.config/${p.replace(/^config\//, "")}`,
    type: "symlink",
  },
  // bin/ or scripts/ -> ~/bin/ or ~/.local/bin/
  {
    match: (p) => p.startsWith("bin/") || p.startsWith("scripts/"),
    category: "script",
    targetFn: (p) => `~/.local/${p}`,
    type: "symlink",
  },
];

let actionIdCounter = 0;

function makeId(): string {
  return `action-${++actionIdCounter}`;
}

export function analyzeTree(entries: GitHubTreeEntry[]): ProposedAction[] {
  actionIdCounter = 0;
  const actions: ProposedAction[] = [];
  const handledPrefixes = new Set<string>();

  const blobs = entries.filter((e) => e.type === "blob");
  const dirs = new Set(entries.filter((e) => e.type === "tree").map((e) => e.path));

  // Pass 1: XDG config directories — symlink entire dirs rather than individual files
  for (const dir of dirs) {
    if (dir.startsWith(".config/") && depth(dir) === 1) {
      const app = dir.split("/")[1]!;
      if (XDG_CONFIG_DIRS.has(app)) {
        actions.push({
          id: makeId(),
          type: "symlink",
          source: dir,
          target: `~/${dir}`,
          overwrite: false,
          enabled: true,
          category: "xdg-config",
        });
        handledPrefixes.add(dir + "/");
        handledPrefixes.add(dir);
      }
    }
    if (dir.startsWith("config/") && depth(dir) === 1) {
      const app = dir.split("/")[1]!;
      if (XDG_CONFIG_DIRS.has(app)) {
        actions.push({
          id: makeId(),
          type: "symlink",
          source: dir,
          target: `~/.config/${app}`,
          overwrite: false,
          enabled: true,
          category: "xdg-config",
        });
        handledPrefixes.add(dir + "/");
        handledPrefixes.add(dir);
      }
    }
  }

  // Pass 2: Individual files
  for (const blob of blobs) {
    const { path } = blob;
    if (isIgnored(path)) continue;

    const alreadyHandled = [...handledPrefixes].some((prefix) =>
      path.startsWith(prefix),
    );
    if (alreadyHandled) continue;

    const basename = path.split("/").pop()!;
    const d = depth(path);

    // Known dotfiles at root
    if (d === 0 && KNOWN_DOTFILES[basename]) {
      const info = KNOWN_DOTFILES[basename]!;
      actions.push({
        id: makeId(),
        type: "symlink",
        source: path,
        target: info.target,
        overwrite: false,
        enabled: true,
        category: info.category,
      });
      continue;
    }

    // Pattern rules
    let matched = false;
    for (const rule of RULES) {
      if (rule.match(path, d)) {
        actions.push({
          id: makeId(),
          type: rule.type,
          source: path,
          target: rule.targetFn(path),
          overwrite: false,
          enabled: true,
          category: rule.category,
        });
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Generic dotfile at root
    if (d === 0 && basename.startsWith(".")) {
      actions.push({
        id: makeId(),
        type: "symlink",
        source: path,
        target: `~/${basename}`,
        overwrite: false,
        enabled: true,
        category: "other-dotfile",
      });
    }
  }

  return actions;
}

export function getShellFiles(entries: GitHubTreeEntry[]): string[] {
  const shellExtensions = new Set([".sh", ".bash", ".zsh", ".fish"]);
  const shellBasenames = new Set(
    Object.keys(KNOWN_DOTFILES).filter(
      (k) => KNOWN_DOTFILES[k]!.category === "shell-config",
    ),
  );

  return entries
    .filter((e) => {
      if (e.type !== "blob") return false;
      const basename = e.path.split("/").pop() ?? "";
      if (shellBasenames.has(basename)) return true;
      const ext = basename.includes(".")
        ? "." + basename.split(".").pop()
        : "";
      return shellExtensions.has(ext);
    })
    .map((e) => e.path);
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  "shell-config": "Shell Configuration",
  "git-config": "Git Configuration",
  "editor-config": "Editor Configuration",
  "terminal-config": "Terminal Configuration",
  "xdg-config": "XDG Config Directory",
  script: "Scripts",
  "other-dotfile": "Other Dotfiles",
  ignored: "Ignored",
};
