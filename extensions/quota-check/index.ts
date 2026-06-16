/**
 * quota-check — Pi command for Tony CLI quota status.
 *
 * Registers /quota-check and displays Codex/Grok quota as a compact,
 * colorful TUI card instead of raw command-line output.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
	SCRIPT_PATH,
	PROVIDERS,
	clampPercent,
	fetchQuota,
	type ProviderId,
	type QuotaInfo,
	type QuotaWindow,
} from "./api.ts";

type ProviderFilter = "all" | "both" | ProviderId | "help";
type ParsedArgs = { providers: ProviderId[] } | { filter: "help" } | { error: string };

// ---- Argument parsing ----

function parseQuotaArgs(rawArgs: string): ParsedArgs {
	const trimmed = rawArgs.trim();
	if (!trimmed || trimmed === "all" || trimmed === "both") return { providers: [...PROVIDERS] };
	if (trimmed === "codex" || trimmed === "--codex") return { providers: ["codex"] };
	if (trimmed === "grok" || trimmed === "--grok") return { providers: ["grok"] };
	if (trimmed === "help" || trimmed === "-h" || trimmed === "--help") return { filter: "help" };

	return {
		error:
			`Unknown quota-check argument: ${trimmed}\n\n` +
			"Usage: /quota-check [all|both|codex|grok|help]",
	};
}

function buildHelpOutput(stdout: string, stderr: string, code: number | null | undefined): { text: string; isError: boolean } {
	const parts = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean);
	const text = parts.length ? parts.join("\n\n") : "quota-check produced no output.";
	return { text, isError: typeof code === "number" && code !== 0 };
}

// ---- Formatting ----

function formatResetTime(ts: number): string {
	if (!Number.isFinite(ts) || ts <= 0) return "unknown";
	const epoch = ts > 10_000_000_000 ? Math.floor(ts / 1000) : ts;
	const diffSec = epoch - Math.floor(Date.now() / 1000);
	if (diffSec <= 0) return "now";
	if (diffSec < 3600) return `in ${Math.max(1, Math.floor(diffSec / 60))}min`;
	if (diffSec < 86400) {
		return new Date(epoch * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
	}
	if (diffSec < 172800) {
		return `tomorrow ${new Date(epoch * 1000).toLocaleTimeString([], { hour: "numeric" }).toLowerCase()}`;
	}
	return `in ${Math.floor(diffSec / 86400)}d`;
}

// ---- UI helpers ----

function colorForPercent(theme: any, percent: number, text: string): string {
	if (percent >= 80) return theme.fg("error", text);
	if (percent >= 50) return theme.fg("warning", text);
	return theme.fg("success", text);
}

function progressBar(theme: any, percentValue: number, width = 10): string {
	const percent = clampPercent(percentValue);
	const filled = Math.round((percent / 100) * width);
	const bar = "█".repeat(filled) + "░".repeat(width - filled);
	return colorForPercent(theme, percent, bar);
}

function padVisible(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function quotaWindowLine(theme: any, label: string, window: QuotaWindow): string {
	const percent = clampPercent(window.used_percent);
	const name = theme.fg("muted", padVisible(label, 11));
	const bar = progressBar(theme, percent);
	const percentText = colorForPercent(theme, percent, `${String(percent).padStart(3)}%`);
	return `${name} ${bar}  ${percentText}`;
}

function quotaResetLine(theme: any, window: QuotaWindow): string {
	return theme.fg("dim", `resets ${formatResetTime(window.reset_at)}`);
}

function providerLines(theme: any, quota: QuotaInfo): string[] {
	const bullet = quota.error ? theme.fg("error", "●") : theme.fg("accent", "●");
	const title = theme.fg("accent", theme.bold(quota.label));
	const detail = theme.fg("dim", quota.detail);

	if (quota.error) {
		return [
			`${bullet} ${title}  ${detail}`,
			theme.fg("error", `  ${quota.error}`),
		];
	}

	const lines: string[] = [`${bullet} ${title}  ${detail}`];
	for (const win of quota.windows) {
		lines.push(`  ${quotaWindowLine(theme, win.name, win)}`);
		lines.push(`  ${quotaResetLine(theme, win)}`);
	}
	return lines;
}

// ---- Dialogs ----

async function showTextDialog(ctx: ExtensionCommandContext, title: string, body: string, isError = false): Promise<void> {
	if (!ctx.hasUI) {
		console.log(body);
		return;
	}

	await ctx.ui.custom<void>((_tui, theme, keybindings, done) => {
		const borderColor = (s: string) => theme.fg(isError ? "error" : "borderMuted", s);
		const titleColor = (s: string) => theme.fg(isError ? "error" : "accent", s);
		const content = body.replace(/\r/g, "").split("\n");

		return {
			handleInput(data: string) {
				if (keybindings.matches(data, "tui.select.cancel") || keybindings.matches(data, "tui.select.confirm")) done();
			},
			render(width: number): string[] {
				const innerWidth = Math.min(58, Math.max(38, width - 6));
				const top = borderColor(`╭─ ${titleColor(title)} ${"─".repeat(Math.max(0, innerWidth - visibleWidth(title) - 3))}╮`);
				const bottom = borderColor(`╰${"─".repeat(innerWidth)}╯`);
				const lines = [top];
				for (const rawLine of content.flatMap((line) => wrapTextWithAnsi(line || " ", innerWidth - 2))) {
					const truncated = truncateToWidth(rawLine, innerWidth - 2);
					const padding = Math.max(0, innerWidth - 2 - visibleWidth(truncated));
					lines.push(borderColor("│ ") + truncated + " ".repeat(padding) + borderColor(" │"));
				}
				lines.push(bottom);
				return lines;
			},
		};
	});
}

async function showQuotaCard(ctx: ExtensionCommandContext, quotas: QuotaInfo[]): Promise<void> {
	if (!ctx.hasUI) {
		const plainText = quotas.map((quota) => providerLines({ fg: (_c: string, t: string) => t, bold: (t: string) => t } as any, quota).join("\n")).join("\n\n");
		console.log(plainText);
		return;
	}

	await ctx.ui.custom<void>((_tui, theme, keybindings, done) => {
		const borderColor = (s: string) => theme.fg("borderMuted", s);
		const cardWidth = 38;

		return {
			handleInput(data: string) {
				if (keybindings.matches(data, "tui.select.cancel") || keybindings.matches(data, "tui.select.confirm")) done();
			},
			render(width: number): string[] {
				const title = theme.fg("accent", theme.bold("Quota Check"));
				const top = borderColor(`╭─ ${title} ${"─".repeat(cardWidth - visibleWidth("Quota Check") - 3)}╮`);
				const bottom = borderColor(`╰${"─".repeat(cardWidth)}╯`);
				const lines = [top, frameLine(borderColor, "", cardWidth)];

				for (const quota of quotas) {
					for (const line of providerLines(theme, quota)) {
						lines.push(frameLine(borderColor, line, cardWidth));
					}
					lines.push(frameLine(borderColor, "", cardWidth));
				}

				lines.push(bottom);
				return lines;
			},
		};
	});
}

function centerLine(text: string, width: number): string {
	const left = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return " ".repeat(left) + text;
}

function frameLine(borderColor: (s: string) => string, line: string, innerWidth: number): string {
	const contentWidth = innerWidth - 2;
	const truncated = truncateToWidth(line, contentWidth);
	const padding = Math.max(0, contentWidth - visibleWidth(truncated));
	return borderColor("│ ") + truncated + " ".repeat(padding) + borderColor(" │");
}

// ---- Extension entry point ----

export default function quotaCheckExtension(pi: ExtensionAPI) {
	pi.registerCommand("quota-check", {
		description: "Check Codex/Grok API quota status",

		getArgumentCompletions(prefix) {
			const items = [
				{ value: "all", label: "all", description: "Show Codex and Grok quota" },
				{ value: "both", label: "both", description: "Show Codex and Grok quota" },
				{ value: "codex", label: "codex", description: "Show Codex/ChatGPT quota only" },
				{ value: "grok", label: "grok", description: "Show Grok quota only" },
				{ value: "help", label: "help", description: "Show quota-check CLI help" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length ? filtered : null;
		},

		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const parsed = parseQuotaArgs(args);

			if ("error" in parsed) {
				await showTextDialog(ctx, "quota-check", parsed.error, true);
				return;
			}

			if ("filter" in parsed && parsed.filter === "help") {
				const result = await pi.exec(SCRIPT_PATH, ["--help"], { timeout: 10_000 });
				const output = buildHelpOutput(result.stdout ?? "", result.stderr ?? "", result.code);
				await showTextDialog(ctx, "quota-check — help", output.text, output.isError);
				return;
			}

			const quotas = await Promise.all(parsed.providers.map((provider) => fetchQuota(pi, provider)));

			await showQuotaCard(ctx, quotas);
		},
	});
}
