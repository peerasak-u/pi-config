---
name: zsh-config-manager
description: Manage zsh configuration on this machine. Use when asked to "customize zsh", "add alias", "add zsh function", "change zsh prompt", "configure ls colors", "add zsh completion", "edit zsh config". Provides modular file structure and conventions.
---

# Zsh Config Manager

Manage and extend the zsh configuration on this machine.

## Structure

```
~/.zshrc                    # Entry point (sources all modules)
~/.config/zsh/
  ├── 00-path.zsh          # PATH exports
  ├── 01-aliases.zsh       # Aliases
  ├── 02-functions.zsh     # Shell functions
  ├── 03-completion.zsh     # Completion system + menu selection
  ├── 04-tools.zsh         # mise, bun, lmstudio
  └── 05-prompt.zsh        # PROMPT + vcs_info
```

**Rule**: One module per concern. Number prefix determines load order.

## Adding Aliases

Edit `~/.config/zsh/01-aliases.zsh`:

```zsh
# General
alias ll='ls -lh'

# Project-specific
alias myproject='cd ~/path/to/project'
```

## Adding Functions

Edit `~/.config/zsh/02-functions.zsh`:

```zsh
myfunc() {
  local arg=$1
  # do something
}
```

## Adding PATH

Edit `~/.config/zsh/00-path.zsh`:

```zsh
export PATH="$HOME/my/bin:$PATH"
```

## Completion Settings

Edit `~/.config/zsh/03-completion.zsh`:

```zsh
# Tab shows menu, arrows navigate, Enter selects
zstyle ':completion:*' menu select
setopt menucomplete

# Add custom completions
compdef _my_completion mycommand
```

## Changing Prompt

Edit `~/.config/zsh/05-prompt.zsh`:

```zsh
# Available colors: black, red, green, yellow, blue, magenta, cyan, white
# Formats: %F{color}, %f (reset), %B (bold), %b (reset bold)
PROMPT='%F{blue}%~%f
%(?.%F{green}→%f.%F{red}→%f) '
```

## Changing ls Colors

Edit `~/.config/zsh/01-aliases.zsh`:

```zsh
alias ls='ls -G'
export LSCOLORS="ExGxBxDxCxEgEdxbxgxcxd"
```

| Pair | File Type |
|------|-----------|
| 1st | directory |
| 2nd | symbolic link |
| 3rd | socket |
| 4th | pipe |
| 5th | executable |
| 6th | block device |
| 7th | char device |
| 8th | setuid |
| 9th | setgid |
| 10th | sticky writable dir |
| 11th | writable dir |

**Color codes**: a=black, b=red, c=green, d=brown, e=blue, f=magenta, g=cyan, h=lightgrey. Uppercase = bold.

## Disabling a Module

Rename the file with `.bak` extension:

```bash
mv ~/.config/zsh/04-tools.zsh ~/.config/zsh/04-tools.zsh.bak
```

## Reloading

```bash
source ~/.zshrc
```

## Existing Aliases

- `l` → `ls -a`
- `ccd`, `glmd`, `kcd`, `mmd`, `opcd` → Claude Code variants
- `luca`, `brain`, `indie`, `freelance` → Navigation shortcuts

## Existing Functions

- `cc`, `kc`, `opc` → Claude Code with different configs
- `mt5` → MetaTrader 5 folder
- `ghzip` → GitHub repo zip downloader
