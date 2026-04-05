#!/usr/bin/env bash
set -euo pipefail

MANIFEST_FILE=".dotfiles-manifest.json"
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d_%H%M%S)"
VERSION="1.0.0"
DEFAULT_CLONE_DIR="$HOME/.dotfiles"

# --- Color helpers --------------------------------------------------------- #

USE_COLOR=true

red()    { $USE_COLOR && printf '\033[0;31m%s\033[0m' "$*" || printf '%s' "$*"; }
green()  { $USE_COLOR && printf '\033[0;32m%s\033[0m' "$*" || printf '%s' "$*"; }
yellow() { $USE_COLOR && printf '\033[0;33m%s\033[0m' "$*" || printf '%s' "$*"; }
blue()   { $USE_COLOR && printf '\033[0;34m%s\033[0m' "$*" || printf '%s' "$*"; }
cyan()   { $USE_COLOR && printf '\033[0;36m%s\033[0m' "$*" || printf '%s' "$*"; }
bold()   { $USE_COLOR && printf '\033[1m%s\033[0m' "$*" || printf '%s' "$*"; }

info()  { printf " %s %s\n" "$(blue "●")" "$*"; }
ok()    { printf " %s %s\n" "$(green "✔")" "$*"; }
warn()  { printf " %s %s\n" "$(yellow "!")" "$*"; }
err()   { printf " %s %s\n" "$(red "✖")" "$*" >&2; }

# --- JSON helper ----------------------------------------------------------- #
# We need to parse JSON. Try jq first, fall back to python3.

JSON_CMD=""

detect_json_parser() {
  if command -v jq >/dev/null 2>&1; then
    JSON_CMD="jq"
  elif command -v python3 >/dev/null 2>&1; then
    JSON_CMD="python3"
  else
    err "Neither jq nor python3 found. One is required to parse the manifest."
    err "Install jq:  brew install jq  OR  sudo apt install jq"
    exit 1
  fi
}

json_get() {
  local file="$1" query="$2"
  if [ "$JSON_CMD" = "jq" ]; then
    jq -r "$query" "$file"
  else
    python3 -c "
import json, sys
with open('$file') as f:
    data = json.load(f)
def resolve(obj, path):
    for p in path:
        if isinstance(obj, list):
            obj = obj[int(p)]
        else:
            obj = obj[p]
    return obj
path = '$query'.strip('.').split('.')
path = [p for p in path if p]
val = resolve(data, path) if path else data
if isinstance(val, (dict, list)):
    print(json.dumps(val))
else:
    print(val if val is not None else 'null')
"
  fi
}

json_array_len() {
  local file="$1" query="$2"
  if [ "$JSON_CMD" = "jq" ]; then
    jq "$query | length" "$file"
  else
    python3 -c "
import json
with open('$file') as f:
    data = json.load(f)
path = '$query'.strip('.').split('.')
path = [p for p in path if p]
obj = data
for p in path:
    obj = obj[int(p)] if isinstance(obj, list) else obj[p]
print(len(obj))
"
  fi
}

json_action_field() {
  local file="$1" index="$2" field="$3"
  if [ "$JSON_CMD" = "jq" ]; then
    jq -r ".actions[$index].$field // empty" "$file"
  else
    python3 -c "
import json
with open('$file') as f:
    data = json.load(f)
val = data['actions'][$index].get('$field')
print(val if val is not None else '')
"
  fi
}

json_dep_field() {
  local file="$1" index="$2" field="$3"
  if [ "$JSON_CMD" = "jq" ]; then
    jq -r ".dependencies[$index].$field // empty" "$file"
  else
    python3 -c "
import json
with open('$file') as f:
    data = json.load(f)
val = data.get('dependencies', [])[$index].get('$field')
print(val if val is not None else '')
"
  fi
}

json_dep_install() {
  local file="$1" index="$2" mgr="$3"
  if [ "$JSON_CMD" = "jq" ]; then
    jq -r ".dependencies[$index].install.$mgr // empty" "$file"
  else
    python3 -c "
import json
with open('$file') as f:
    data = json.load(f)
val = data.get('dependencies', [])[$index].get('install', {}).get('$mgr')
print(val if val is not None else '')
"
  fi
}

# --- OS / package manager detection ---------------------------------------- #

CURRENT_OS=""
PKG_MANAGER=""

detect_platform() {
  case "$(uname -s)" in
    Darwin) CURRENT_OS="macos" ;;
    Linux)  CURRENT_OS="linux" ;;
    *)      CURRENT_OS="unknown" ;;
  esac

  if command -v brew >/dev/null 2>&1; then
    PKG_MANAGER="brew"
  elif command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  fi
}

platform_matches() {
  local action_platform="$1"
  [ -z "$action_platform" ] || [ "$action_platform" = "$CURRENT_OS" ]
}

# --- Path expansion -------------------------------------------------------- #

expand_path() {
  local p="$1"
  echo "${p/#\~/$HOME}"
}

# --- Backup helper --------------------------------------------------------- #

backup_if_exists() {
  local target="$1"
  if [ -e "$target" ] || [ -L "$target" ]; then
    mkdir -p "$BACKUP_DIR"
    local rel
    rel="${target#$HOME/}"
    local dest="$BACKUP_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    mv "$target" "$dest"
    warn "Backed up $(cyan "$target") → $(cyan "$dest")"
  fi
}

# --- Action executors ------------------------------------------------------ #

do_symlink() {
  local source_rel="$1" target_raw="$2" overwrite="$3"
  local source_abs="$REPO_DIR/$source_rel"
  local target
  target="$(expand_path "$target_raw")"

  mkdir -p "$(dirname "$target")"

  if [ -e "$target" ] || [ -L "$target" ]; then
    if [ "$overwrite" = "true" ]; then
      backup_if_exists "$target"
    else
      warn "Skipped symlink $(cyan "$target") (already exists, overwrite=false)"
      return 0
    fi
  fi

  ln -s "$source_abs" "$target"
  ok "Symlink $(cyan "$source_rel") → $(cyan "$target")"
}

do_copy() {
  local source_rel="$1" target_raw="$2" overwrite="$3"
  local source_abs="$REPO_DIR/$source_rel"
  local target
  target="$(expand_path "$target_raw")"

  mkdir -p "$(dirname "$target")"

  if [ -e "$target" ]; then
    if [ "$overwrite" = "true" ]; then
      backup_if_exists "$target"
    else
      warn "Skipped copy $(cyan "$target") (already exists, overwrite=false)"
      return 0
    fi
  fi

  if [ -d "$source_abs" ]; then
    cp -R "$source_abs" "$target"
  else
    cp "$source_abs" "$target"
  fi
  ok "Copied $(cyan "$source_rel") → $(cyan "$target")"
}

do_mkdir() {
  local target_raw="$1"
  local target
  target="$(expand_path "$target_raw")"
  mkdir -p "$target"
  ok "Created directory $(cyan "$target")"
}

do_hook() {
  local name="$1" command="$2"
  info "Running hook: $(bold "$name")"
  if ! bash -c "cd \"$REPO_DIR\" && $command"; then
    err "Hook failed: $name"
    return 1
  fi
  ok "Hook completed: $(bold "$name")"
}

# --- Dependency installer -------------------------------------------------- #

install_dependency() {
  local name="$1" pkg="$2"
  if [ -z "$pkg" ]; then
    warn "No $PKG_MANAGER package name for $(bold "$name"), skipping"
    return 0
  fi

  if command -v "$name" >/dev/null 2>&1; then
    ok "$(bold "$name") already installed"
    return 0
  fi

  info "Installing $(bold "$name") via $PKG_MANAGER..."
  case "$PKG_MANAGER" in
    brew)
      brew install "$pkg" || {
        warn "Failed to install $(bold "$name") via brew"
        return 0
      }
      ;;
    apt)
      if sudo -n true 2>/dev/null; then
        sudo apt-get install -y "$pkg" || {
          warn "Failed to install $(bold "$name") via apt"
          return 0
        }
      else
        warn "Skipping $(bold "$name") — sudo access required for apt. Install manually: sudo apt install $pkg"
        return 0
      fi
      ;;
    *)
      warn "No supported package manager found, skipping $(bold "$name")"
      return 0
      ;;
  esac
  ok "Installed $(bold "$name")"
}

# --- Preview --------------------------------------------------------------- #

preview_actions() {
  local manifest="$1"
  local count
  count="$(json_array_len "$manifest" ".actions")"

  printf "\n"
  bold "  Install Plan"
  printf "\n  %s\n\n" "$(cyan "repo: $REPO_SLUG  ·  os: $CURRENT_OS  ·  actions: $count")"

  local i=0
  while [ "$i" -lt "$count" ]; do
    local atype asource atarget aplatform aname acmd awhen
    atype="$(json_action_field "$manifest" "$i" "type")"
    aplatform="$(json_action_field "$manifest" "$i" "platform")"

    if ! platform_matches "$aplatform"; then
      i=$((i + 1))
      continue
    fi

    case "$atype" in
      symlink)
        asource="$(json_action_field "$manifest" "$i" "source")"
        atarget="$(json_action_field "$manifest" "$i" "target")"
        printf "  %s  %s → %s\n" "$(blue "symlink")" "$asource" "$atarget"
        ;;
      copy)
        asource="$(json_action_field "$manifest" "$i" "source")"
        atarget="$(json_action_field "$manifest" "$i" "target")"
        printf "  %s     %s → %s\n" "$(green "copy")" "$asource" "$atarget"
        ;;
      mkdir)
        atarget="$(json_action_field "$manifest" "$i" "target")"
        printf "  %s    %s\n" "$(green "mkdir")" "$atarget"
        ;;
      hook)
        aname="$(json_action_field "$manifest" "$i" "name")"
        acmd="$(json_action_field "$manifest" "$i" "command")"
        awhen="$(json_action_field "$manifest" "$i" "when")"
        printf "  %s  [%s] %s: %s\n" "$(yellow "hook")" "$awhen" "$aname" "$acmd"
        ;;
    esac
    i=$((i + 1))
  done

  local dep_count
  dep_count="$(json_array_len "$manifest" ".dependencies" 2>/dev/null || echo 0)"
  if [ "$dep_count" -gt 0 ] && [ "$INSTALL_DEPS" = true ]; then
    printf "\n"
    bold "  Dependencies"
    printf "\n\n"
    local d=0
    while [ "$d" -lt "$dep_count" ]; do
      local dname dpkg
      dname="$(json_dep_field "$manifest" "$d" "name")"
      dpkg="$(json_dep_install "$manifest" "$d" "$PKG_MANAGER")"
      if [ -n "$dpkg" ]; then
        printf "  %s  %s (%s: %s)\n" "$(cyan "pkg")" "$dname" "$PKG_MANAGER" "$dpkg"
      fi
      d=$((d + 1))
    done
  fi

  printf "\n"
}

# --- Main ------------------------------------------------------------------ #

usage() {
  cat <<'USAGE'
dotfiles-installer — manifest-driven dotfiles bootstrap

Usage:
  install.sh [OPTIONS] <owner/repo>

Arguments:
  <owner/repo>     GitHub repository slug (e.g. user/dotfiles)

Options:
  --dir <path>     Clone destination (default: ~/.dotfiles)
  --yes            Skip confirmation prompt
  --dry-run        Preview actions without executing
  --no-deps        Skip dependency installation
  --no-color       Disable colored output
  --ref <branch>   Git ref to clone (default: from manifest or main)
  -h, --help       Show this help message
  -v, --version    Show version
USAGE
}

REPO_SLUG=""
REPO_DIR=""
CLONE_DIR=""
AUTO_YES=false
DRY_RUN=false
INSTALL_DEPS=true
GIT_REF=""

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)      shift; CLONE_DIR="$1" ;;
      --yes)      AUTO_YES=true ;;
      --dry-run)  DRY_RUN=true ;;
      --no-deps)  INSTALL_DEPS=false ;;
      --no-color) USE_COLOR=false ;;
      --ref)      shift; GIT_REF="$1" ;;
      -h|--help)  usage; exit 0 ;;
      -v|--version) echo "dotfiles-installer $VERSION"; exit 0 ;;
      -*)         err "Unknown option: $1"; usage; exit 1 ;;
      *)
        if [ -z "$REPO_SLUG" ]; then
          REPO_SLUG="$1"
        else
          err "Unexpected argument: $1"; usage; exit 1
        fi
        ;;
    esac
    shift
  done

  if [ -z "$REPO_SLUG" ]; then
    err "Missing required argument: <owner/repo>"
    usage
    exit 1
  fi

  # Normalise: strip https://github.com/ prefix if provided
  REPO_SLUG="${REPO_SLUG#https://github.com/}"
  REPO_SLUG="${REPO_SLUG#http://github.com/}"
  REPO_SLUG="${REPO_SLUG#github.com/}"
  REPO_SLUG="${REPO_SLUG%.git}"
}

main() {
  parse_args "$@"

  printf "\n"
  bold "  dotfiles-installer v$VERSION"
  printf "\n\n"

  detect_json_parser
  detect_platform
  info "Detected OS: $(bold "$CURRENT_OS"), package manager: $(bold "${PKG_MANAGER:-none}")"

  if [ "$CURRENT_OS" = "unknown" ]; then
    err "Unsupported operating system. Only macOS and Linux are supported."
    exit 1
  fi

  # Determine permanent clone directory
  if [ -z "$CLONE_DIR" ]; then
    CLONE_DIR="$DEFAULT_CLONE_DIR"
  fi

  local repo_url="https://github.com/$REPO_SLUG.git"
  local clone_ref="${GIT_REF:-}"

  if [ -d "$CLONE_DIR/.git" ]; then
    info "Repository already exists at $(cyan "$CLONE_DIR"), pulling latest..."
    REPO_DIR="$CLONE_DIR"
    git -C "$REPO_DIR" pull --ff-only 2>/dev/null || {
      warn "Pull failed — using existing checkout"
    }
    ok "Using existing repository at $(cyan "$CLONE_DIR")"
  else
    info "Cloning $(bold "$REPO_SLUG") → $(cyan "$CLONE_DIR")..."
    if [ -n "$clone_ref" ]; then
      git clone --branch "$clone_ref" "$repo_url" "$CLONE_DIR" 2>/dev/null || {
        err "Failed to clone $repo_url (ref: $clone_ref)"
        exit 1
      }
    else
      git clone "$repo_url" "$CLONE_DIR" 2>/dev/null || {
        err "Failed to clone $repo_url"
        exit 1
      }
    fi
    REPO_DIR="$CLONE_DIR"
    ok "Cloned to $(cyan "$CLONE_DIR")"
  fi

  # Find and validate manifest
  local manifest="$REPO_DIR/$MANIFEST_FILE"
  if [ ! -f "$manifest" ]; then
    err "Manifest not found: $MANIFEST_FILE"
    err "This repository has not been configured with dotfiles-installer."
    err "Visit https://dotfiles-installer.dev to generate a manifest."
    exit 2
  fi

  local schema_version
  schema_version="$(json_get "$manifest" ".schemaVersion")"
  if [ "$schema_version" != "1.0.0" ]; then
    err "Unsupported manifest schema version: $schema_version (expected 1.0.0)"
    exit 3
  fi
  ok "Manifest validated (schema $schema_version)"

  # If no --ref was given, use the manifest's ref
  if [ -z "$GIT_REF" ]; then
    local manifest_ref
    manifest_ref="$(json_get "$manifest" ".repository.ref" 2>/dev/null || echo "")"
    if [ -n "$manifest_ref" ] && [ "$manifest_ref" != "null" ]; then
      GIT_REF="$manifest_ref"
    fi
  fi

  # Preview
  preview_actions "$manifest"

  if [ "$DRY_RUN" = true ]; then
    info "Dry run complete. No changes were made."
    exit 0
  fi

  # Confirm
  if [ "$AUTO_YES" = false ]; then
    printf "  Proceed with installation? [y/N] "
    read -r answer </dev/tty
    case "$answer" in
      y|Y|yes|Yes) ;;
      *) info "Installation cancelled."; exit 0 ;;
    esac
    printf "\n"
  fi

  # Execute pre-hooks
  local action_count
  action_count="$(json_array_len "$manifest" ".actions")"
  local i=0
  while [ "$i" -lt "$action_count" ]; do
    local atype aplatform
    atype="$(json_action_field "$manifest" "$i" "type")"
    aplatform="$(json_action_field "$manifest" "$i" "platform")"
    if [ "$atype" = "hook" ] && platform_matches "$aplatform"; then
      local awhen
      awhen="$(json_action_field "$manifest" "$i" "when")"
      if [ "$awhen" = "pre" ]; then
        local aname acmd
        aname="$(json_action_field "$manifest" "$i" "name")"
        acmd="$(json_action_field "$manifest" "$i" "command")"
        do_hook "$aname" "$acmd"
      fi
    fi
    i=$((i + 1))
  done

  # Execute file actions
  i=0
  while [ "$i" -lt "$action_count" ]; do
    local atype aplatform
    atype="$(json_action_field "$manifest" "$i" "type")"
    aplatform="$(json_action_field "$manifest" "$i" "platform")"

    if ! platform_matches "$aplatform"; then
      i=$((i + 1))
      continue
    fi

    case "$atype" in
      symlink)
        local src tgt ow
        src="$(json_action_field "$manifest" "$i" "source")"
        tgt="$(json_action_field "$manifest" "$i" "target")"
        ow="$(json_action_field "$manifest" "$i" "overwrite")"
        do_symlink "$src" "$tgt" "${ow:-false}"
        ;;
      copy)
        local src tgt ow
        src="$(json_action_field "$manifest" "$i" "source")"
        tgt="$(json_action_field "$manifest" "$i" "target")"
        ow="$(json_action_field "$manifest" "$i" "overwrite")"
        do_copy "$src" "$tgt" "${ow:-false}"
        ;;
      mkdir)
        local tgt
        tgt="$(json_action_field "$manifest" "$i" "target")"
        do_mkdir "$tgt"
        ;;
      hook) ;; # handled separately
    esac
    i=$((i + 1))
  done

  # Install dependencies
  if [ "$INSTALL_DEPS" = true ]; then
    local dep_count
    dep_count="$(json_array_len "$manifest" ".dependencies" 2>/dev/null || echo 0)"
    if [ "$dep_count" -gt 0 ] && [ -n "$PKG_MANAGER" ]; then
      local has_sudo=false
      if [ "$PKG_MANAGER" = "brew" ] || sudo -n true 2>/dev/null; then
        has_sudo=true
      fi

      if [ "$has_sudo" = true ]; then
        printf "\n"
        info "Installing dependencies..."
        local d=0
        while [ "$d" -lt "$dep_count" ]; do
          local dname dpkg
          dname="$(json_dep_field "$manifest" "$d" "name")"
          dpkg="$(json_dep_install "$manifest" "$d" "$PKG_MANAGER")"
          install_dependency "$dname" "$dpkg"
          d=$((d + 1))
        done
      else
        printf "\n"
        bold "  Dependency Status"
        printf "\n\n"
        local missing_pkgs=""
        local d=0
        while [ "$d" -lt "$dep_count" ]; do
          local dname dpkg
          dname="$(json_dep_field "$manifest" "$d" "name")"
          dpkg="$(json_dep_install "$manifest" "$d" "$PKG_MANAGER")"
          if [ -n "$dpkg" ]; then
            if command -v "$dname" >/dev/null 2>&1; then
              printf "  %s  %s\n" "$(green "✔")" "$dname"
            else
              printf "  %s  %s (%s: %s)\n" "$(red "✖")" "$dname" "$PKG_MANAGER" "$dpkg"
              missing_pkgs="$missing_pkgs $dpkg"
            fi
          fi
          d=$((d + 1))
        done
        if [ -n "$missing_pkgs" ]; then
          printf "\n"
          warn "No sudo access — install missing packages manually:"
          printf "\n  %s\n" "$(bold "sudo apt install$missing_pkgs")"
        else
          printf "\n"
          ok "All dependencies are already installed!"
        fi
      fi
    fi
  fi

  # Execute post-hooks
  i=0
  while [ "$i" -lt "$action_count" ]; do
    local atype aplatform
    atype="$(json_action_field "$manifest" "$i" "type")"
    aplatform="$(json_action_field "$manifest" "$i" "platform")"
    if [ "$atype" = "hook" ] && platform_matches "$aplatform"; then
      local awhen
      awhen="$(json_action_field "$manifest" "$i" "when")"
      if [ "$awhen" = "post" ]; then
        local aname acmd
        aname="$(json_action_field "$manifest" "$i" "name")"
        acmd="$(json_action_field "$manifest" "$i" "command")"
        do_hook "$aname" "$acmd"
      fi
    fi
    i=$((i + 1))
  done

  # Report
  printf "\n"
  ok "$(bold "Installation complete!")"
  info "Dotfiles repository: $(cyan "$REPO_DIR")"
  if [ -d "$BACKUP_DIR" ]; then
    info "Backups saved to $(cyan "$BACKUP_DIR")"
  fi
  printf "\n"
}

main "$@"
