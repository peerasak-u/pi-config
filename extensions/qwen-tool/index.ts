/**
 * Qwen Tool — Invoke Qwen Code from within pi (cmux-based async version)
 *
 * Registers a `qwen` tool that launches Qwen Code CLI in a cmux pane.
 * Returns immediately — results delivered via steer message when Qwen exits.
 *
 * Completion detection uses two layers:
 *   1. Sentinel file: PI_QWEN_SENTINEL=/tmp/pi-qwen-<id>-done is set in env.
 *      Qwen Code can create this file when it finishes (via the plugin).
 *   2. Screen sentinel: the command appends `; echo '__SUBAGENT_DONE_<exit>__'`
 *      which appears in the terminal output when the process exits.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Box, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { dirname, join } from "node:path";
import { existsSync, unlinkSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isMuxAvailable,
  muxSetupHint,
  createSurface,
  sendCommand,
  closeSurface,
  readScreen,
  shellEscape,
  exitStatusVar,
} from "../../git/github.com/HazAT/pi-interactive-subagents/pi-extension/subagents/cmux.ts";

// ── State ──

interface RunningQwen {
  id: string;
  name: string;
  prompt: string;
  surface: string;
  startTime: number;
  sentinelFile: string;
  abortController: AbortController;
}

const runningQwen = new Map<string, RunningQwen>();

// ── Widget helpers ──

let latestCtx: ExtensionContext | null = null;
let widgetInterval: ReturnType<typeof setInterval> | null = null;

const ACCENT = "\x1b[38;2;77;163;255m";
const RST = "\x1b[0m";

function formatElapsedMMSS(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function borderTop(title: string, info: string, width: number): string {
  const inner = Math.max(0, width - 2);
  const titlePart = `─ ${title} `;
  const infoPart = ` ${info} ─`;
  const fillLen = Math.max(0, inner - titlePart.length - infoPart.length);
  const fill = "─".repeat(fillLen);
  const content = `${titlePart}${fill}${infoPart}`.slice(0, inner).padEnd(inner, "─");
  return `${ACCENT}╭${content}╮${RST}`;
}

function borderLine(left: string, right: string, width: number): string {
  const contentWidth = Math.max(0, width - 2);
  const rightVis = visibleWidth(right);
  const maxLeft = Math.max(0, contentWidth - rightVis);
  const truncLeft = truncateToWidth(left, maxLeft);
  const leftVis = visibleWidth(truncLeft);
  const pad = Math.max(0, contentWidth - leftVis - rightVis);
  return `${ACCENT}│${RST}${truncLeft}${" ".repeat(pad)}${right}${ACCENT}│${RST}`;
}

function borderBottom(width: number): string {
  const inner = Math.max(0, width - 2);
  return `${ACCENT}╰${"─".repeat(inner)}╯${RST}`;
}

function updateWidget() {
  if (!latestCtx?.hasUI) return;

  if (runningQwen.size === 0) {
    latestCtx.ui.setWidget("qwen-status", undefined);
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = null;
    }
    return;
  }

  latestCtx.ui.setWidget(
    "qwen-status",
    (_tui: any, _theme: any) => ({
      invalidate() {},
      render(width: number) {
        const count = runningQwen.size;
        const lines: string[] = [borderTop("Qwen Code", `${count} running`, width)];
        for (const [, session] of runningQwen) {
          const elapsed = formatElapsedMMSS(session.startTime);
          const firstLine = session.prompt.split("\n").find((l) => l.trim()) ?? session.prompt;
          const label = ` ${elapsed}  `;
          const nameAvail = Math.max(0, width - 2 - visibleWidth(label));
          const name = truncateToWidth(firstLine, nameAvail);
          lines.push(borderLine(label + name, "", width));
        }
        lines.push(borderBottom(width));
        return lines;
      },
    }),
    { placement: "aboveEditor" },
  );
}

function startWidgetRefresh() {
  if (widgetInterval) return;
  updateWidget();
  widgetInterval = setInterval(updateWidget, 1000);
}

// ── Copy Qwen session ──

const QWEN_SESSIONS_DIR = join(
  process.env.HOME ?? "/tmp",
  ".pi",
  "agent",
  "sessions",
  "qwen-code",
);

function copyQwenSession(sentinelFile: string): string | null {
  try {
    const transcriptFile = sentinelFile + ".transcript";
    if (!existsSync(transcriptFile)) return null;

    const transcriptPath = readFileSync(transcriptFile, "utf-8").trim();
    if (!transcriptPath || !existsSync(transcriptPath)) return null;

    mkdirSync(QWEN_SESSIONS_DIR, { recursive: true });
    const filename = transcriptPath.split("/").pop() ?? `qwen-${Date.now()}.jsonl`;
    const dest = join(QWEN_SESSIONS_DIR, filename);
    copyFileSync(transcriptPath, dest);
    return filename;
  } catch {
    return null;
  }
}

// ── watchQwen ──

async function watchQwen(running: RunningQwen, signal: AbortSignal, pi: ExtensionAPI): Promise<void> {
  const { surface, sentinelFile } = running;
  console.log(`[qwen-tool] Watching session ${running.id}, sentinel: ${sentinelFile}`);

  try {
    // Poll for completion via sentinel file or screen sentinel
    while (!signal.aborted) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (signal.aborted) break;

      // Check sentinel file (created by Qwen plugin)
      if (existsSync(sentinelFile)) break;

      // Check screen buffer for exit marker
      const screen = readScreen(surface, 5);
      if (/__SUBAGENT_DONE_\d+__/.test(screen)) break;
    }

    if (signal.aborted) {
      closeSurface(surface);
      try { unlinkSync(sentinelFile); } catch {}
      runningQwen.delete(running.id);
      updateWidget();
      return;
    }

    const startTime = running.startTime;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    // Try to read result from sentinel file first (contains last_assistant_message)
    // Fall back to screen buffer if sentinel has no content
    let resultContent = "";
    try {
      resultContent = readFileSync(sentinelFile, "utf-8").trim();
    } catch {}

    if (!resultContent) {
      resultContent = readScreen(surface, 200)
        .replace(/__SUBAGENT_DONE_\d+__/, "")
        .trimEnd();
    }

    closeSurface(surface);

    // Copy Qwen session file to pi sessions folder
    const sessionId = copyQwenSession(sentinelFile);

    try { unlinkSync(sentinelFile); } catch {}
    try { unlinkSync(sentinelFile + ".transcript"); } catch {}
    runningQwen.delete(running.id);
    updateWidget();

    pi.sendMessage(
      {
        customType: "qwen_result",
        content: resultContent,
        display: true,
        details: {
          name: running.name,
          prompt: running.prompt,
          elapsed,
          id: running.id,
          ...(sessionId ? { sessionFile: sessionId } : {}),
        },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
  } catch (err: any) {
    try { closeSurface(surface); } catch {}
    try { unlinkSync(sentinelFile); } catch {}
    try { unlinkSync(sentinelFile + ".transcript"); } catch {}
    runningQwen.delete(running.id);
    updateWidget();

    pi.sendMessage(
      {
        customType: "qwen_result",
        content: `Qwen Code error: ${err?.message ?? String(err)}`,
        display: true,
        details: { name: running.name, prompt: running.prompt, elapsed: 0, id: running.id, error: err?.message },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
  }
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
  });

  pi.on("session_shutdown", (_event, _ctx) => {
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = null;
    }
    for (const [, session] of runningQwen) {
      session.abortController.abort();
      try { closeSurface(session.surface); } catch {}
      try { unlinkSync(session.sentinelFile); } catch {}
    }
    runningQwen.clear();
  });

  pi.registerTool({
    name: "qwen",
    label: "Qwen Code",
    description:
      "Spawn a self-driving Qwen Code session for deep hands-on investigation, experimentation, and code exploration. " +
      "Qwen Code has full autonomy: bash, file access, git clone, code editing, running tests, building projects — everything. " +
      "Use it for tasks that require checking out code, trying things, running experiments, and multi-step hands-on work. " +
      "NOT for web research or URL fetching — use parallel_search/parallel_research/parallel_extract for those. " +
      "IMPORTANT: This tool returns IMMEDIATELY — the session runs asynchronously in the background. " +
      "Results are delivered later via a steer message. Do NOT fabricate or assume results.",

    promptSnippet:
      "Spawn a self-driving Qwen Code session for deep hands-on investigation and experimentation. " +
      "Full autonomy: bash, git clone, code editing, running tests, building projects — everything a developer can do in a terminal. " +
      "Use for: cloning and exploring repos, trying out libraries, running experiments, multi-file investigations, prototyping approaches. " +
      "NOT for web research or URL fetching — use parallel_search/parallel_research/parallel_extract for those. " +
      "IMPORTANT: Returns IMMEDIATELY — results delivered via steer message. " +
      "Do NOT fabricate or assume results. Set resumeSessionId to continue a previous session.",

    promptGuidelines: [
      "Use qwen for deep hands-on investigation that requires running code, cloning repos, building projects, or experimenting with approaches — it's a fully autonomous coding agent.",
      "Delegate to qwen when: exploring a repo's internals, trying out a library hands-on, prototyping an approach, running multi-step experiments, debugging complex issues, or any task that needs a terminal and file system access.",
      "Do NOT use qwen for web research, searching the web, fetching URLs, or reading documentation online — use parallel_search, parallel_research, and parallel_extract for those. Qwen is for code-level, hands-on work.",
      "For simple file reads, single edits, or quick commands you already know the answer to — use your own tools directly, don't spawn a full session.",
      "Give qwen clear investigation goals and let it drive — it will clone repos, read code, try things, run tests, and report back with concrete findings.",
    ],

    parameters: Type.Object({
      prompt: Type.String({ description: "The task or question for Qwen Code" }),
      model: Type.Optional(
        Type.String({
          description: 'Model to use (default: "qwen"). Examples: "qwen", "qwen-max", "qwen-turbo"',
        }),
      ),
      systemPrompt: Type.Optional(
        Type.String({ description: "Additional system prompt instructions to append" }),
      ),
      resumeSessionId: Type.Optional(
        Type.String({
          description:
            "Resume a previous Qwen Code session by its ID. " +
            "Loads the conversation history and continues where it left off. " +
            "The session ID is returned in details of every qwen tool call. " +
            "Use this to retry cancelled runs or ask follow-up questions.",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (!isMuxAvailable()) {
        return {
          content: [{ type: "text", text: `Qwen Code requires a terminal multiplexer. ${muxSetupHint()}` }],
          details: { error: "mux not available" },
          isError: true,
        };
      }
      console.log("[qwen-tool] Starting execute...");

      const { prompt, model, systemPrompt, resumeSessionId } = params;

      const id = Math.random().toString(16).slice(2, 10);
      const sentinelFile = `/tmp/pi-qwen-${id}-done`;
      const pluginDir = join(dirname(fileURLToPath(import.meta.url)), "plugin");
      const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;

      const surface = createSurface(`Qwen: ${shortPrompt}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      // Build qwen CLI command
      const parts: string[] = [
        `PI_QWEN_SENTINEL=${shellEscape(sentinelFile)}`,
        "qwen",
        "--yolo",
      ];

      if (model) parts.push("--model", shellEscape(model));
      if (systemPrompt) parts.push("--append-system-prompt", shellEscape(systemPrompt));
      if (resumeSessionId) parts.push("--resume", shellEscape(resumeSessionId));

      parts.push(shellEscape(prompt));
      parts.push(`; echo '__SUBAGENT_DONE_'${exitStatusVar()}'__'`);

      const command = parts.join(" ");
      sendCommand(surface, command);

      const abortController = new AbortController();
      if (signal) {
        signal.addEventListener("abort", () => abortController.abort());
      }

      const running: RunningQwen = {
        id,
        name: shortPrompt,
        prompt,
        surface,
        startTime: Date.now(),
        sentinelFile,
        abortController,
      };

      runningQwen.set(id, running);
      startWidgetRefresh();

      // Fire-and-forget watcher
      watchQwen(running, abortController.signal, pi).catch(() => {});

      return {
        content: [
          {
            type: "text",
            text:
              "Qwen Code launched and running in background. " +
              "Results delivered via steer message when complete. " +
              "Do NOT fabricate or assume results — wait for the steer message.",
          },
        ],
        details: { id, status: "started" },
      };
    },

    renderCall(args, theme) {
      const prompt = args.prompt ?? "";
      const firstLine = prompt.split("\n").find((l: string) => l.trim()) ?? "";
      const preview = firstLine.length > 100 ? firstLine.slice(0, 100) + "…" : firstLine;
      let text = "▸ " + theme.fg("toolTitle", theme.bold("Qwen Code"));
      if (args.model) text += theme.fg("dim", ` [${args.model}]`);
      if (preview) text += "\n" + theme.fg("toolOutput", preview);
      return new Text(text, 0, 0);
    },

    renderResult(result, _opts, theme) {
      const details = result.details as any;
      if (details?.status === "started") {
        return new Text(
          theme.fg("accent", "▸") + " " + theme.fg("toolTitle", theme.bold("Qwen Code")) + theme.fg("dim", " — started"),
          0,
          0,
        );
      }
      const text = typeof result.content?.[0]?.text === "string" ? result.content[0].text : "";
      return new Text(theme.fg("dim", text), 0, 0);
    },
  });

  // ── qwen_result message renderer ──
  pi.registerMessageRenderer("qwen_result", (message, options, theme) => {
    const details = message.details as any;
    if (!details) return undefined;

    return {
      render(width: number): string[] {
        const error = details.error;
        const bgFn = error
          ? (text: string) => theme.bg("toolErrorBg", text)
          : (text: string) => theme.bg("toolSuccessBg", text);
        const icon = error ? theme.fg("error", "✗") : theme.fg("success", "✓");
        const elapsed = details.elapsed != null
          ? (details.elapsed < 60 ? `${details.elapsed}s` : `${Math.floor(details.elapsed / 60)}m${details.elapsed % 60}s`)
          : "?";
        const header = `${icon} ${theme.fg("toolTitle", theme.bold("Qwen Code"))} ${theme.fg("dim", `— ${elapsed}`)}`;

        const rawContent = typeof message.content === "string" ? message.content : "";
        const contentLines: string[] = [header];

        if (options.expanded) {
          for (const line of rawContent.split("\n")) {
            contentLines.push(line.slice(0, width - 6));
          }
        } else {
          if (rawContent) {
            const lines = rawContent.split("\n");
            const preview = lines.slice(0, 5);
            for (const line of preview) {
              contentLines.push(theme.fg("dim", line.slice(0, width - 6)));
            }
            if (lines.length > 5) {
              contentLines.push(theme.fg("muted", `… ${lines.length - 5} more lines`));
            }
          }
          contentLines.push(theme.fg("muted", keyHint("app.tools.expand", "to expand")));
        }

        // Render via Box for background + padding, with blank line above for separation
        const box = new Box(1, 1, bgFn);
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });
}