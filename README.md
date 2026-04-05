# dotfiles-installer

The easiest way to make a dotfiles repository installable. A browser-based manifest generator plus a zero-preinstall bootstrap installer.

## How it works

**For authors:** paste a GitHub repo URL into the web UI, review the proposed install plan, and download a generated JSON manifest to commit to your repo.

**For consumers:** install any manifest-enabled repo with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/schnej7/dotfiles-installer/main/installer/install.sh | bash -s -- user/dotfiles
```

## Architecture

| Component | Description |
|---|---|
| **Web UI** (`web/`) | React + Vite SPA. Analyzes public GitHub repos via the REST API, detects dotfiles and dependencies, generates a manifest. |
| **Manifest schema** (`schema/`) | JSON Schema defining the installation contract between the web UI and the installer. |
| **Installer** (`installer/`) | Bash script that clones a repo, reads the manifest, previews actions, and applies them with backup. |

## Manifest

The manifest (`.dotfiles-manifest.json`) is the contract between the repository and the installer. It declares:

- **Actions** — symlink, copy, mkdir, and hook operations in execution order
- **Dependencies** — packages to install via Homebrew or APT, with confidence levels
- **Platforms** — macOS and/or Linux targeting
- **Hooks** — pre-install and post-install shell commands

## Installer options

```
install.sh [OPTIONS] <owner/repo>

Options:
  --yes          Skip confirmation prompt
  --dry-run      Preview actions without executing
  --no-deps      Skip dependency installation
  --no-color     Disable colored output
  --ref <branch> Git ref to clone (default: from manifest or main)
  -h, --help     Show help
  -v, --version  Show version
```

## Web UI development

```bash
cd web
npm install
npm run dev
```

The SPA is a 4-step wizard:

1. **Repository** — paste a GitHub URL, validate, fetch metadata
2. **Analyze** — scan file tree, detect dotfiles and dependencies
3. **Review** — edit actions, approve dependencies, add hooks, set platforms
4. **Export** — preview manifest, download, copy install command

## Project structure

```
dotfiles-installer/
├── web/                            React + Vite SPA
│   ├── src/
│   │   ├── components/             Step components (wizard UI)
│   │   ├── lib/                    GitHub client, analyzer, detector, manifest builder
│   │   └── types/                  TypeScript types for manifest schema
│   └── package.json
├── installer/
│   └── install.sh                  Bootstrap installer
├── schema/
│   └── manifest.schema.json        JSON Schema for manifest validation
├── README.md
└── LICENSE
```

## License

MIT
