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

// ── Known dotfiles (at repo root, with dot prefix) ──────────────────────────

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

// ── Tool-organized subdirectories ───────────────────────────────────────────
// Repos like schnej7/dotfiles organize files by tool: bash/, vim/, screen/, etc.
// Map known filenames inside these dirs to their home-directory targets.

interface ToolDirMapping {
  category: FileCategory;
  knownFiles: Record<string, string>;
  defaultTarget: (filename: string) => string;
}

const TOOL_DIRECTORIES: Record<string, ToolDirMapping> = {
  bash: {
    category: "shell-config",
    knownFiles: {
      "bashrc": "~/.bashrc",
      "bash_profile": "~/.bash_profile",
      "profile": "~/.profile",
      "profile.bash": "~/.bash_profile",
      "aliases": "~/.bash_aliases",
      "aliases.bash": "~/.bash_aliases",
      "bash_aliases": "~/.bash_aliases",
      "bash_colors": "~/.bash_colors",
      "bash_colors.bash": "~/.bash_colors",
      "colors.bash": "~/.bash_colors",
      "exports": "~/.bash_exports",
      "exports.bash": "~/.bash_exports",
      "bash_exports": "~/.bash_exports",
      "functions": "~/.bash_functions",
      "functions.bash": "~/.bash_functions",
      "bash_functions": "~/.bash_functions",
      "inputrc": "~/.inputrc",
      "bash_completion": "~/.bash_completion",
      "bash_logout": "~/.bash_logout",
    },
    defaultTarget: (f) => `~/.${f}`,
  },
  zsh: {
    category: "shell-config",
    knownFiles: {
      "zshrc": "~/.zshrc",
      "zshenv": "~/.zshenv",
      "zprofile": "~/.zprofile",
      "zlogin": "~/.zlogin",
      "zlogout": "~/.zlogout",
      "aliases.zsh": "~/.zsh_aliases",
      "functions.zsh": "~/.zsh_functions",
    },
    defaultTarget: (f) => `~/.${f}`,
  },
  fish: {
    category: "shell-config",
    knownFiles: {
      "config.fish": "~/.config/fish/config.fish",
    },
    defaultTarget: (f) => `~/.config/fish/${f}`,
  },
  vim: {
    category: "editor-config",
    knownFiles: {
      "vimrc": "~/.vimrc",
      "gvimrc": "~/.gvimrc",
    },
    defaultTarget: (f) => `~/.vim/${f}`,
  },
  neovim: {
    category: "editor-config",
    knownFiles: {},
    defaultTarget: (f) => `~/.config/nvim/${f}`,
  },
  nvim: {
    category: "editor-config",
    knownFiles: {},
    defaultTarget: (f) => `~/.config/nvim/${f}`,
  },
  screen: {
    category: "terminal-config",
    knownFiles: {
      "screenrc": "~/.screenrc",
    },
    defaultTarget: (f) => `~/.${f}`,
  },
  tmux: {
    category: "terminal-config",
    knownFiles: {
      "tmux.conf": "~/.tmux.conf",
    },
    defaultTarget: (f) => `~/.tmux/${f}`,
  },
  git: {
    category: "git-config",
    knownFiles: {
      "gitconfig": "~/.gitconfig",
      "gitignore": "~/.gitignore_global",
      "gitignore_global": "~/.gitignore_global",
      "gitattributes": "~/.gitattributes_global",
    },
    defaultTarget: (f) => `~/.${f}`,
  },
  ssh: {
    category: "other-dotfile",
    knownFiles: {
      "config": "~/.ssh/config",
    },
    defaultTarget: (f) => `~/.ssh/${f}`,
  },
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
  "makefile",
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
  if (path.startsWith(".git/") || path.startsWith(".github/")) return true;
  return false;
}

function pathDepth(path: string): number {
  return path.split("/").length - 1;
}

// ── Source / include parsing ────────────────────────────────────────────────
// Discover extra files that shell configs source, so we know they need symlinking.

export interface SourceHint {
  sourcedPath: string;
  fromFile: string;
}

export function parseSourceDirectives(
  content: string,
  filePath: string,
): SourceHint[] {
  const hints: SourceHint[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    // Match: source ~/.foo  |  . ~/.bar  |  source "$HOME/.baz"
    const m = trimmed.match(
      /^(?:source|\.) +["']?(?:\$HOME|~)\/([\w./_-]+)["']?/,
    );
    if (m) {
      hints.push({ sourcedPath: m[1]!, fromFile: filePath });
    }
  }

  return hints;
}

// Match a sourced target path to a file in the repo
export function matchSourceHints(
  hints: SourceHint[],
  repoFiles: string[],
): Map<string, string> {
  const targetToRepo = new Map<string, string>();

  for (const hint of hints) {
    const targetBasename = hint.sourcedPath.split("/").pop()!;
    const targetWithDot = `~/.${hint.sourcedPath.replace(/^\./, "")}`;
    const fullTarget = hint.sourcedPath.startsWith(".")
      ? `~/${hint.sourcedPath}`
      : `~/.${hint.sourcedPath}`;

    for (const repoPath of repoFiles) {
      const repoBasename = repoPath.split("/").pop()!;

      // Exact basename match or close variant
      if (
        repoBasename === targetBasename ||
        repoBasename === targetBasename.replace(/^\./, "") ||
        `.${repoBasename}` === targetBasename ||
        repoBasename.replace(/\.bash$/, "") === targetBasename.replace(/^\.?bash_?/, "") ||
        `bash_${repoBasename.replace(/\.bash$/, "")}` === targetBasename.replace(/^\./, "")
      ) {
        const target = hint.sourcedPath.startsWith(".")
          ? `~/${hint.sourcedPath}`
          : fullTarget;
        targetToRepo.set(repoPath, target);
      }
    }

    void targetWithDot; // used for matching logic above
  }

  return targetToRepo;
}

// ── Main analysis ───────────────────────────────────────────────────────────

let actionIdCounter = 0;

function makeId(): string {
  return `action-${++actionIdCounter}`;
}

export function analyzeTree(
  entries: GitHubTreeEntry[],
  sourceHints?: Map<string, string>,
): ProposedAction[] {
  actionIdCounter = 0;
  const actions: ProposedAction[] = [];
  const handledPaths = new Set<string>();

  const blobs = entries.filter((e) => e.type === "blob");
  const dirs = new Set(
    entries.filter((e) => e.type === "tree").map((e) => e.path),
  );

  // Pass 1: XDG config directories — symlink entire dirs
  for (const dir of dirs) {
    if (dir.startsWith(".config/") && pathDepth(dir) === 1) {
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
        markHandled(handledPaths, dir, blobs);
      }
    }
    if (dir.startsWith("config/") && pathDepth(dir) === 1) {
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
        markHandled(handledPaths, dir, blobs);
      }
    }
  }

  // Pass 2: Tool-organized subdirectories (bash/, vim/, screen/, etc.)
  for (const dir of dirs) {
    if (pathDepth(dir) !== 0) continue;
    const mapping = TOOL_DIRECTORIES[dir];
    if (!mapping) continue;

    const filesInDir = blobs.filter(
      (b) => b.path.startsWith(dir + "/") && pathDepth(b.path) === 1,
    );
    const subDirs = [...dirs].filter(
      (d) => d.startsWith(dir + "/") && pathDepth(d) === 1,
    );

    for (const file of filesInDir) {
      if (handledPaths.has(file.path)) continue;
      if (isIgnored(file.path)) continue;

      const basename = file.path.split("/").pop()!;

      // Check source hints first (most accurate)
      if (sourceHints?.has(file.path)) {
        actions.push({
          id: makeId(),
          type: "symlink",
          source: file.path,
          target: sourceHints.get(file.path)!,
          overwrite: false,
          enabled: true,
          category: mapping.category,
        });
        handledPaths.add(file.path);
        continue;
      }

      // Then check known file mappings
      if (mapping.knownFiles[basename]) {
        actions.push({
          id: makeId(),
          type: "symlink",
          source: file.path,
          target: mapping.knownFiles[basename]!,
          overwrite: false,
          enabled: true,
          category: mapping.category,
        });
        handledPaths.add(file.path);
        continue;
      }

      // Fall back to the directory's default target mapping
      actions.push({
        id: makeId(),
        type: "symlink",
        source: file.path,
        target: mapping.defaultTarget(basename),
        overwrite: false,
        enabled: true,
        category: mapping.category,
      });
      handledPaths.add(file.path);
    }

    // Symlink sub-directories within tool dirs (e.g. vim/pack/)
    for (const subDir of subDirs) {
      if (handledPaths.has(subDir)) continue;
      const subName = subDir.split("/").pop()!;
      actions.push({
        id: makeId(),
        type: "symlink",
        source: subDir,
        target: mapping.defaultTarget(subName),
        overwrite: false,
        enabled: true,
        category: mapping.category,
      });
      markHandled(handledPaths, subDir, blobs);
    }
  }

  // Pass 3: Individual files at root or unhandled locations
  for (const blob of blobs) {
    const { path } = blob;
    if (handledPaths.has(path)) continue;
    if (isIgnored(path)) continue;

    const basename = path.split("/").pop()!;
    const d = pathDepth(path);

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
      handledPaths.add(path);
      continue;
    }

    // Source-hint matched files anywhere in the tree
    if (sourceHints?.has(path)) {
      actions.push({
        id: makeId(),
        type: "symlink",
        source: path,
        target: sourceHints.get(path)!,
        overwrite: false,
        enabled: true,
        category: "shell-config",
      });
      handledPaths.add(path);
      continue;
    }

    // bin/ or scripts/ directories
    if (path.startsWith("bin/") || path.startsWith("scripts/")) {
      actions.push({
        id: makeId(),
        type: "symlink",
        source: path,
        target: `~/.local/${path}`,
        overwrite: false,
        enabled: true,
        category: "script",
      });
      handledPaths.add(path);
      continue;
    }

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
      handledPaths.add(path);
    }
  }

  return actions;
}

function markHandled(
  handled: Set<string>,
  dirPath: string,
  blobs: GitHubTreeEntry[],
) {
  handled.add(dirPath);
  const prefix = dirPath + "/";
  for (const b of blobs) {
    if (b.path.startsWith(prefix)) handled.add(b.path);
  }
}

export function getShellFiles(entries: GitHubTreeEntry[]): string[] {
  const shellExtensions = new Set([".sh", ".bash", ".zsh", ".fish"]);
  const shellBasenames = new Set([
    ...Object.keys(KNOWN_DOTFILES).filter(
      (k) => KNOWN_DOTFILES[k]!.category === "shell-config",
    ),
    "bashrc", "bash_profile", "profile", "zshrc", "zshenv", "zprofile",
    "aliases", "functions", "exports", "inputrc",
    "aliases.bash", "functions.bash", "exports.bash",
    "bash_aliases", "bash_functions", "bash_exports",
    "bash_colors", "bash_colors.bash", "colors.bash",
    "config.fish",
  ]);

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
