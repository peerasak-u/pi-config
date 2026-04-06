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
- **scout**: Exploratory agent for codebase discovery and initial context gathering.
- **researcher**: In-depth analysis, web research, and library investigation.
- **worker**: Hands-on implementation, debugging, and task execution.
- **reviewer**: Automated code review, feedback, and adherence to standards.
- **spec**: Technical specifications and planning; utilizes the `ask_user` tool for interactive decision-making.
- **planner**: Orchestrates multi-step projects and breaks down complex goals into actionable tasks.
- **visual-tester**: Specialized in UI/UX testing and visual regressions.
- **autoresearch**: Autonomous experiment loop for optimization targets.

### Extensions

New commands and capabilities are defined in the `extensions/` directory:
- **cmux**: Terminal and browser surface management.
- **qwen-tool**: Integration with Qwen Code for deep investigations and hands-on experimentation.
- **todos**: File-based task management and tracking.
- **wakelock.ts**: Prevents system sleep during long-running tasks.
- **agent-models**: Management and selection of model presets for different tasks.
- **execute-command**: Provides programmatic slash commands and self-invokes (now uses `ask_user` for interaction instead of the legacy `/answer`).

### Packages

The following pi packages are currently installed and managed:
- `pi-interactive-subagents`: Orchestration of multiple agent sessions (`git:github.com/HazAT/pi-interactive-subagents`).
- `pi-autoresearch`: Autonomous optimization loop (`https://github.com/davebcn87/pi-autoresearch`).
- `pi-mcp-adapter`: Adapter for Model Context Protocol servers (`npm:pi-mcp-adapter`).
- `chrome-cdp-skill`: Local Chrome browser interaction via CDP (`git:github.com/pasky/chrome-cdp-skill@v1.0.1`).
- `pi-guardrails`: Safety and compliance checks (`git:github.com/aliou/pi-guardrails`).
- `pi-web-access`: High-quality web research and content extraction (`npm:pi-web-access`).
- `pi-ask-user`: Interactive decision handshake and tool-based user feedback (`npm:pi-ask-user`).

## License

Personal configuration. Use at your own risk.
