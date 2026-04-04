# pi-config

A personal configuration and data repository for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

This repository contains custom agent definitions, extensions, skills, and settings for a personalized `pi` development environment.

## Directory Structure

- `agents/`: Custom agent profiles that define specialized roles (e.g., `scout`, `researcher`, `worker`, `reviewer`).
- `extensions/`: Custom pi extensions that add new capabilities and commands to the agent environment.
- `skills/`: Reusable agent skills that provide specialized instructions for specific tasks (e.g., `github`, `code-reviewer`, `skill-creator`).
- `settings.json`: Global configuration for the pi coding agent.
- `sessions/`: (Ignored) Local history of agent sessions and artifacts.
- `git/`: (Ignored) Externally managed resources and cloned repositories.

## Usage

To use this configuration, ensure your `pi` environment is configured to point to this directory or its components.

### Agents

The `agents/` directory contains various specialized agent personas:
- **scout**: Exploratory agent for codebase discovery.
- **researcher**: In-depth analysis and web research.
- **worker**: Hands-on implementation and debugging.
- **reviewer**: Automated code review and feedback.
- **spec**: Drafts technical specifications and plans.
- **autoresearch**: Autonomous experiment loop for optimization.

### Extensions

New commands and capabilities are defined in the `extensions/` directory:
- **cmux**: Terminal and browser surface management.
- **qwen-tool**: Integration with Qwen Code for deep investigations.
- **todos**: File-based task management.
- **wakelock**: Prevent system sleep during long-running tasks.

### Model Presets

The `settings.json` file contains several model presets for different agent roles:
- **antigravity**: High-performance Google Gemini and Claude models (default).
- **opencode-go**: Open-source models (GLM, Minimax, Kimi).
- **mixed**: A hybrid of the above.

## Packages

The following pi packages are currently installed and managed:
- `pi-interactive-subagents` (git)
- `pi-web-access` (npm)
- `pi-autoresearch` (github)
- `pi-mcp-adapter` (npm)
- `chrome-cdp-skill` (git)
- `pi-smart-sessions` (npm)
- `pi-powerline-footer` (npm)
- `pi-guardrails` (git)

## License

Personal configuration. Use at your own risk.
