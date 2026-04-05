import type { Confidence, DependencyInstall } from "../types/manifest";

export interface DetectedDependency {
  id: string;
  name: string;
  confidence: Confidence;
  evidence: string;
  install: DependencyInstall;
  enabled: boolean;
}

interface ToolDefinition {
  command: string;
  brew: string;
  apt: string;
  aliases?: string[];
}

const KNOWN_TOOLS: ToolDefinition[] = [
  // Search & filter
  { command: "fzf", brew: "fzf", apt: "fzf" },
  { command: "rg", brew: "ripgrep", apt: "ripgrep", aliases: ["ripgrep"] },
  { command: "fd", brew: "fd", apt: "fd-find", aliases: ["fdfind"] },
  { command: "ag", brew: "the_silver_searcher", apt: "silversearcher-ag", aliases: ["the_silver_searcher"] },
  { command: "ack", brew: "ack", apt: "ack" },
  { command: "sd", brew: "sd", apt: "sd" },

  // Modern CLI replacements
  { command: "bat", brew: "bat", apt: "bat", aliases: ["batcat"] },
  { command: "eza", brew: "eza", apt: "eza", aliases: ["exa"] },
  { command: "lsd", brew: "lsd", apt: "lsd" },
  { command: "dust", brew: "dust", apt: "du-dust" },
  { command: "duf", brew: "duf", apt: "duf" },
  { command: "procs", brew: "procs", apt: "procs" },

  // JSON / data tools
  { command: "jq", brew: "jq", apt: "jq" },
  { command: "yq", brew: "yq", apt: "yq" },

  // Terminal multiplexers
  { command: "tmux", brew: "tmux", apt: "tmux" },
  { command: "screen", brew: "screen", apt: "screen" },
  { command: "zellij", brew: "zellij", apt: "zellij" },

  // Shell enhancements
  { command: "zoxide", brew: "zoxide", apt: "zoxide" },
  { command: "starship", brew: "starship", apt: "starship" },
  { command: "direnv", brew: "direnv", apt: "direnv" },
  { command: "thefuck", brew: "thefuck", apt: "thefuck" },

  // Git tools
  { command: "delta", brew: "git-delta", apt: "git-delta" },
  { command: "lazygit", brew: "lazygit", apt: "lazygit" },
  { command: "gh", brew: "gh", apt: "gh" },

  // System monitoring
  { command: "htop", brew: "htop", apt: "htop" },
  { command: "btop", brew: "btop", apt: "btop" },
  { command: "neofetch", brew: "neofetch", apt: "neofetch" },
  { command: "fastfetch", brew: "fastfetch", apt: "fastfetch" },

  // File managers
  { command: "nnn", brew: "nnn", apt: "nnn" },
  { command: "ranger", brew: "ranger", apt: "ranger" },
  { command: "yazi", brew: "yazi", apt: "yazi" },

  // Containers & orchestration
  { command: "docker", brew: "docker", apt: "docker.io", aliases: ["docker-compose"] },
  { command: "kubectl", brew: "kubectl", apt: "kubectl" },
  { command: "terraform", brew: "terraform", apt: "terraform" },
  { command: "ansible", brew: "ansible", apt: "ansible" },

  // Cloud CLIs
  { command: "aws", brew: "awscli", apt: "awscli", aliases: ["awscli"] },

  // Networking & HTTP
  { command: "httpie", brew: "httpie", apt: "httpie", aliases: ["http", "https"] },
  { command: "xh", brew: "xh", apt: "xh" },
  { command: "dog", brew: "dog", apt: "dog" },
  { command: "wget", brew: "wget", apt: "wget" },
  { command: "curl", brew: "curl", apt: "curl" },

  // System utilities
  { command: "tree", brew: "tree", apt: "tree" },
  { command: "lsof", brew: "lsof", apt: "lsof" },
  { command: "trash", brew: "trash-cli", apt: "trash-cli", aliases: ["trash-put"] },
  { command: "shellcheck", brew: "shellcheck", apt: "shellcheck" },

  // Editors & shells
  { command: "nvim", brew: "neovim", apt: "neovim", aliases: ["neovim"] },
  { command: "vim", brew: "vim", apt: "vim" },
  { command: "zsh", brew: "zsh", apt: "zsh" },
  { command: "fish", brew: "fish", apt: "fish" },
  { command: "git", brew: "git", apt: "git" },

  // Build tools & compilers
  { command: "make", brew: "make", apt: "make" },
  { command: "cmake", brew: "cmake", apt: "cmake" },
  { command: "gcc", brew: "gcc", apt: "gcc" },

  // Language runtimes & version managers
  { command: "node", brew: "node", apt: "nodejs", aliases: ["nodejs"] },
  { command: "python3", brew: "python@3", apt: "python3", aliases: ["python"] },
  { command: "ruby", brew: "ruby", apt: "ruby" },
  { command: "nvm", brew: "nvm", apt: "nvm" },
  { command: "pyenv", brew: "pyenv", apt: "pyenv" },
  { command: "rbenv", brew: "rbenv", apt: "rbenv" },
  { command: "mise", brew: "mise", apt: "mise" },
  { command: "fnm", brew: "fnm", apt: "fnm" },

  // Docs & media
  { command: "glow", brew: "glow", apt: "glow" },
  { command: "tokei", brew: "tokei", apt: "tokei" },
  { command: "hyperfine", brew: "hyperfine", apt: "hyperfine" },
  { command: "tldr", brew: "tldr", apt: "tldr" },
  { command: "ffmpeg", brew: "ffmpeg", apt: "ffmpeg" },
  { command: "pandoc", brew: "pandoc", apt: "pandoc" },
  { command: "stow", brew: "stow", apt: "stow" },
];

const UBIQUITOUS = new Set(["git", "curl", "wget", "vim", "zsh"]);

interface Match {
  tool: ToolDefinition;
  evidence: string;
  confidence: Confidence;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanContent(content: string, filePath: string): Match[] {
  const matches: Match[] = [];
  const seen = new Set<string>();

  for (const tool of KNOWN_TOOLS) {
    const names = [tool.command, ...(tool.aliases ?? [])];

    for (const name of names) {
      if (seen.has(tool.command)) break;

      const esc = escapeRegex(name);

      // Primary detection: word-boundary match
      if (!new RegExp(`\\b${esc}\\b`).test(content)) {
        // Fallback: check for TOOL_* environment variable pattern (e.g. FZF_DEFAULT_OPTS)
        if (name.length >= 3 && new RegExp(`\\b${escapeRegex(name.toUpperCase())}_\\w+`).test(content)) {
          // env-var reference only — medium confidence
        } else {
          continue;
        }
      }

      seen.add(tool.command);

      let confidence: Confidence = "medium";
      let evidence = `Referenced in ${filePath}`;

      const highPatterns = [
        new RegExp(`eval\\s+"?\\$\\(${esc}`),
        new RegExp(`alias\\s+\\w+=['"]?${esc}`),
        new RegExp(`^\\s*${esc}\\s`, "m"),
        new RegExp(`command\\s+-v\\s+${esc}`),
        new RegExp(`which\\s+${esc}`),
        new RegExp(`\\|\\s*${esc}(?:\\s|$)`, "m"),
        new RegExp(`\\$\\(${esc}\\s`),
        new RegExp(`type\\s+(?:-[tpPa]\\s+)?${esc}\\b`),
      ];

      for (const hp of highPatterns) {
        if (hp.test(content)) {
          confidence = "high";
          const matchLine = content
            .split("\n")
            .find((l) => hp.test(l))
            ?.trim();
          if (matchLine) {
            evidence = `${filePath}: \`${matchLine.slice(0, 80)}\``;
          }
          break;
        }
      }

      if (confidence === "medium" && UBIQUITOUS.has(tool.command)) {
        confidence = "low";
      }

      matches.push({ tool, evidence, confidence });
      break;
    }
  }

  return matches;
}

export function parseBrEwfile(content: string): Match[] {
  const matches: Match[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;

    const brewMatch = trimmed.match(/^brew\s+["']([^"']+)["']/);
    const caskMatch = trimmed.match(/^cask\s+["']([^"']+)["']/);

    const pkg = brewMatch?.[1] ?? caskMatch?.[1];
    if (!pkg) continue;

    const tool = KNOWN_TOOLS.find(
      (t) => t.brew === pkg || t.command === pkg || t.aliases?.includes(pkg),
    );

    if (tool) {
      matches.push({
        tool,
        evidence: `Brewfile: \`${trimmed.slice(0, 80)}\``,
        confidence: "high",
      });
    }
  }

  return matches;
}

let depIdCounter = 0;

export function detectDependencies(
  fileContents: Map<string, string>,
): DetectedDependency[] {
  depIdCounter = 0;
  const allMatches = new Map<string, Match>();

  for (const [path, content] of fileContents) {
    const basename = path.split("/").pop() ?? "";

    if (basename === "Brewfile") {
      for (const m of parseBrEwfile(content)) {
        const existing = allMatches.get(m.tool.command);
        if (!existing || confidenceRank(m.confidence) > confidenceRank(existing.confidence)) {
          allMatches.set(m.tool.command, m);
        }
      }
      continue;
    }

    for (const m of scanContent(content, path)) {
      const existing = allMatches.get(m.tool.command);
      if (!existing || confidenceRank(m.confidence) > confidenceRank(existing.confidence)) {
        allMatches.set(m.tool.command, m);
      }
    }
  }

  return [...allMatches.values()]
    .filter((m) => m.confidence !== "low")
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))
    .map((m) => ({
      id: `dep-${++depIdCounter}`,
      name: m.tool.command,
      confidence: m.confidence,
      evidence: m.evidence,
      install: { brew: m.tool.brew, apt: m.tool.apt },
      enabled: m.confidence === "high",
    }));
}

function confidenceRank(c: Confidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}
