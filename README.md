# pi-config

A personal configuration and data repository for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

This repository contains custom agent definitions, extensions, skills, and settings for a personalized `pi` development environment.

## Directory Structure

- `agents/`: Custom agent profiles that define specialized roles (e.g., `scout`, `researcher`, `worker`, `reviewer`).
- `extensions/`: Custom pi extensions that add new capabilities and commands to the agent environment.
- `skills/`: Reusable agent skills that provide specialized instructions for specific tasks (see below).
- `settings.json`: Global configuration for the pi coding agent.
- `sessions/`: (Ignored) Local history of agent sessions and artifacts.
- `git/`: (Ignored) Externally managed resources and cloned repositories.

## Usage

To use this configuration, ensure your `pi` environment is configured to point to this directory or its components.

### Agents

The `agents/` directory contains various specialized agent personas:
- **scout**: Exploratory agent for codebase discovery and initial context gathering.
- **worker**: Hands-on implementation, debugging, and task execution.
- **code-reviewer**: Automated code review and feedback.
- **quality-reviewer**: Comprehensive quality and standards review.
- **planner**: Orchestrates multi-step projects and breaks down complex goals into actionable tasks.
- **oracle**: Specialized agent for deep investigation and knowledge synthesis.

### Extensions

New commands and capabilities are defined in the `extensions/` directory:
- **cmux**: Terminal and browser surface management.
- **context7**: Context7 documentation lookup and library resolution.
- **todos**: File-based task management and tracking.
- **wakelock.ts**: Prevents system sleep during long-running tasks.
- **agent-models**: Management and selection of model presets for different tasks.
- **execute-command**: Provides programmatic slash commands and self-invokes.
- **english-teacher**: Language learning and correction assistant.
- **exa-mcp.json**: Exa MCP server configuration.
- **guardrails.json**: Safety and guardrails configuration.

### Skills

Reusable skills for specialized tasks in the `skills/` directory:

**Development & Code Quality:**
- **add-mcp-server**: Add and configure MCP servers to pi.
- **code-simplifier**: Refactor code for clarity and maintainability.
- **commit**: Git commit conventions and helpers.
- **frontend-design**: Create production-grade frontend interfaces.
- **iterate-pr**: Iterate on PRs until CI passes.
- **learn-codebase**: Discover project conventions and security patterns.
- **task-verify**: Verify completed non-web tasks.
- **web-verify**: Verify completed web UI tasks using browser automation.

**Project Management:**
- **cmux**: Terminal and browser surface management.
- **dokploy**: Deploy and manage applications using Dokploy.
- **github**: GitHub CLI interactions (issues, PRs, CI runs).
- **write-todos**: Create clear, actionable todos.

**Agent & Tooling:**
- **session-reader**: Read and analyze pi agent session files.
- **skill-creator**: Create new agent skills following the specification.
- **zsh-config-manager**: Manage zsh configuration (aliases, functions, prompts).
- **peerasak-presentation-creator**: Create data-driven presentations with React and Recharts.

### Packages

The following pi packages are currently installed and managed:
- `pi-mcp-adapter`: Adapter for Model Context Protocol servers (`npm:pi-mcp-adapter`).
- `chrome-cdp-skill`: Local Chrome browser interaction via CDP (`git:github.com/pasky/chrome-cdp-skill@v1.0.1`).
- `pi-guardrails`: Safety and compliance checks (`git:github.com/aliou/pi-guardrails`).
- `pi-ask-user`: Interactive decision handshake and tool-based user feedback (`npm:pi-ask-user`).
- `pi-context`: Context management utilities (`npm:pi-context`).
- `pi-exa-mcp`: Exa MCP server integration (`npm:@benvargas/pi-exa-mcp`).
- `pi-context7`: Context7 library documentation (`npm:@dreki-gg/pi-context7`).

## License

Personal configuration. Use at your own risk.
