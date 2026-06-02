/**
 * quota-check — Pi command for Tony CLI quota status.
 *
 * Registers /quota-check and displays Codex/MiniMax/DeepSeek/MiMo quota as a compact,
 * colorful TUI card instead of raw command-line output.
 */

import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const SCRIPT_PATH = path.join(os.homedir(), ".tony-cli", "tools", "quota-check", "quota-check.sh");

type ProviderFilter = "both" | "codex" | "minimax" | "deepseek" | "mimo" | "help";
type ParsedArgs = { filter: ProviderFilter } | { error: string };

type QuotaWindow = {
	used_percent: number;
	reset_at: number;
};

type DeepSeekBalance = {
	currency: string;
	total: number;
	granted: number;
	topped_up: number;
};

type MimoBalance = {
	currency: string;
	total: string;
	gift: string;
	cash: string;
	frozen: string;
};

type QuotaInfo = {
	provider: "codex" | "minimax" | "deepseek" | "mimo";
	label: string;
	detail: string;
	interval: QuotaWindow;
	weekly: QuotaWindow;
	balance?: DeepSeekBalance;
	mimoBalance?: MimoBalance;
	error?: string;
	status?: number;
};

function parseQuotaArgs(rawArgs: string): ParsedArgs {
	const trimmed = rawArgs.trim();
	if (!trimmed || trimmed === "both" || trimmed === "all") return { filter: "both" };
	if (trimmed === "codex" || trimmed === "--codex") return { filter: "codex" };
	if (trimmed === "minimax" || trimmed === "--minimax") return { filter: "minimax" };
	if (trimmed === "deepseek" || trimmed === "--deepseek") return { filter: "deepseek" };
	if (trimmed === "mimo" || trimmed === "--mimo") return { filter: "mimo" };
	if (trimmed === "help" || trimmed === "-h" || trimmed === "--help") return { filter: "help" };

	return {
		error:
			`Unknown quota-check argument: ${trimmed}\n\n` +
			"Usage: /quota-check [both|codex|minimax|deepseek|mimo|help]",
	};
}

function parseQuotaJson(stdout: string, fallbackProvider: "codex" | "minimax"): QuotaInfo {
	const data = JSON.parse(stdout) as any;
	const provider = data.provider === "codex" || data.provider === "minimax" ? data.provider : fallbackProvider;
	return {
		provider,
		label: provider === "codex" ? "Codex / ChatGPT" : "MiniMax",
		detail: provider === "codex" ? String(data.plan_type ?? "unknown") : String(data.model ?? "unknown"),
		interval: {
			used_percent: Number(data.interval?.used_percent ?? 0),
			reset_at: Number(data.interval?.reset_at ?? 0),
		},
		weekly: {
			used_percent: Number(data.weekly?.used_percent ?? 0),
			reset_at: Number(data.weekly?.reset_at ?? 0),
		},
		status: Number(data.status ?? 1),
	};
}

function parseDeepSeekJson(stdout: string): QuotaInfo {
	const data = JSON.parse(stdout) as any;
	return {
		provider: "deepseek",
		label: "DeepSeek",
		detail: String(data.plan_type ?? "pay-per-use"),
		interval: { used_percent: 0, reset_at: 0 },
		weekly: { used_percent: 0, reset_at: 0 },
		balance: {
			currency: String(data.balance?.currency ?? "USD"),
			total: Number(data.balance?.total ?? 0),
			granted: Number(data.balance?.granted ?? 0),
			topped_up: Number(data.balance?.topped_up ?? 0),
		},
	};
}

function parseMimoJson(stdout: string): QuotaInfo {
	const data = JSON.parse(stdout) as any;
	return {
		provider: "mimo",
		label: "Xiaomi MiMo",
		detail: String(data.plan_type ?? "pay-per-use"),
		interval: { used_percent: 0, reset_at: 0 },
		weekly: { used_percent: 0, reset_at: 0 },
		mimoBalance: {
			currency: String(data.balance?.currency ?? "USD"),
			total: String(data.balance?.total ?? "0"),
			gift: String(data.balance?.gift ?? "0"),
			cash: String(data.balance?.cash ?? "0"),
			frozen: String(data.balance?.frozen ?? "0"),
		},
	};
}

function buildHelpOutput(stdout: string, stderr: string, code: number | null | undefined): { text: string; isError: boolean } {
	const parts = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean);
	const text = parts.length ? parts.join("\n\n") : "quota-check produced no output.";
	return { text, isError: typeof code === "number" && code !== 0 };
}

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

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, Math.round(value)));
}

async function fetchQuota(pi: ExtensionAPI, provider: "codex" | "minimax" | "deepseek" | "mimo"): Promise<QuotaInfo> {
	const result = await pi.exec(SCRIPT_PATH, [`--${provider}`, "--json"], { timeout: 20_000 });
	if (typeof result.code === "number" && result.code !== 0) {
		const message = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n") || `${provider} quota check failed`;
		return quotaError(provider, message);
	}
	try {
		if (provider === "deepseek") {
			return parseDeepSeekJson(result.stdout ?? "");
		}
		if (provider === "mimo") {
			return parseMimoJson(result.stdout ?? "");
		}
		return parseQuotaJson(result.stdout ?? "", provider);
	} catch (error: any) {
		return quotaError(provider, `Could not parse ${provider} quota JSON: ${error?.message ?? String(error)}`);
	}
}

function quotaError(provider: "codex" | "minimax" | "deepseek" | "mimo", error: string): QuotaInfo {
	return {
		provider,
		label: provider === "codex" ? "Codex / ChatGPT" : provider === "minimax" ? "MiniMax" : provider === "deepseek" ? "DeepSeek" : "Xiaomi MiMo",
		detail: "unavailable",
		interval: { used_percent: 0, reset_at: 0 },
		weekly: { used_percent: 0, reset_at: 0 },
		error,
	};
}

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

	// Show active/paused badge for MiniMax
	let detailLine = quota.detail;
	if (quota.provider === "minimax" && !quota.error) {
		const badge = quota.status === 1
			? theme.fg("success", "active")
			: theme.fg("warning", "paused");
		detailLine = `${quota.detail} ${badge}`;
	}
	const detail = theme.fg("dim", detailLine);

	if (quota.error) {
		return [
			`${bullet} ${title}  ${detail}`,
			theme.fg("error", `  ${quota.error}`),
		];
	}

	// DeepSeek uses balance display instead of quota windows
	if (quota.balance) {
		const balanceLabel = theme.fg("muted", padVisible("Balance:", 12));
		const amount = theme.fg("success", `$${quota.balance.total}`);
		const currency = theme.fg("dim", ` ${quota.balance.currency}`);
		return [
			`${bullet} ${title}  ${detail}`,
			`  ${balanceLabel} ${amount}${currency}`,
		];
	}

	// MiMo uses balance display like DeepSeek
	if (quota.mimoBalance) {
		const bal = quota.mimoBalance;
		const balanceLabel = theme.fg("muted", padVisible("Balance:", 12));
		const amount = theme.fg("success", `$${bal.total}`);
		const currency = theme.fg("dim", ` ${bal.currency}`);
		return [
			`${bullet} ${title}  ${detail}`,
			`  ${balanceLabel} ${amount}${currency}`,
		];
	}

	return [
		`${bullet} ${title}  ${detail}`,
		`  ${quotaWindowLine(theme, "5h window", quota.interval)}`,
		`  ${quotaResetLine(theme, quota.interval)}`,
		`  ${quotaWindowLine(theme, "Weekly", quota.weekly)}`,
		`  ${quotaResetLine(theme, quota.weekly)}`,
	];
}

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
					lines.push(frameLine(borderColor, rawLine, innerWidth));
				}
				lines.push(frameLine(borderColor, theme.fg("dim", "Enter / Esc to close"), innerWidth));
				lines.push(bottom);
				return lines.map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
		};
	}, { overlay: true, overlayOptions: { anchor: "center", width: 62, margin: 2 } });
}

async function showQuotaCard(ctx: ExtensionCommandContext, quotas: QuotaInfo[]): Promise<void> {
	const plainText = quotas.map((quota) => {
		if (quota.error) return `${quota.label}: ${quota.error}`;
		if (quota.balance) return `${quota.label}: $${quota.balance.total} ${quota.balance.currency}`;
		if (quota.mimoBalance) return `${quota.label}: $${quota.mimoBalance.total} ${quota.mimoBalance.currency}`;
		return `${quota.label}: ${quota.interval.used_percent}% / ${quota.weekly.used_percent}%`;
	}).join("\n");
	if (!ctx.hasUI) {
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

				quotas.forEach((quota, index) => {
					for (const line of providerLines(theme, quota)) {
						lines.push(frameLine(borderColor, line, cardWidth));
					}
					if (index < quotas.length - 1) lines.push(frameLine(borderColor, "", cardWidth));
				});

				lines.push(frameLine(borderColor, "", cardWidth));
				lines.push(frameLine(borderColor, centerLine(theme.fg("dim", "Enter / Esc to close"), cardWidth - 2), cardWidth));
				lines.push(bottom);
				return lines.map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
		};
	}, { overlay: true, overlayOptions: { anchor: "center", width: 44, margin: 2 } });
}

function centerLine(text: string, width: number): string {
	const left = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return `${" ".repeat(left)}${text}`;
}

function frameLine(borderColor: (s: string) => string, line: string, innerWidth: number): string {
	const contentWidth = innerWidth - 2;
	const truncated = truncateToWidth(line, contentWidth);
	const padding = Math.max(0, contentWidth - visibleWidth(truncated));
	return borderColor("│") + " " + truncated + " ".repeat(padding + 1) + borderColor("│");
}

export default function quotaCheckExtension(pi: ExtensionAPI) {
	pi.registerCommand("quota-check", {
		description: "Show Codex, MiniMax, DeepSeek, and MiMo quota in a compact dialog",
		getArgumentCompletions(prefix) {
			const items = [
				{ value: "both", label: "both", description: "Show Codex, MiniMax, DeepSeek, and MiMo quota" },
				{ value: "codex", label: "codex", description: "Show Codex/ChatGPT quota only" },
				{ value: "minimax", label: "minimax", description: "Show MiniMax quota only" },
				{ value: "deepseek", label: "deepseek", description: "Show DeepSeek balance only" },
				{ value: "mimo", label: "mimo", description: "Show Xiaomi MiMo balance only" },
				{ value: "help", label: "help", description: "Show quota-check CLI help" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length ? filtered : null;
		},
		handler: async (args, ctx) => {
			const parsed = parseQuotaArgs(args);
			if ("error" in parsed) {
				await showTextDialog(ctx, "Quota Check", parsed.error, true);
				return;
			}

			ctx.ui.notify("Checking quota…", "info");

			if (parsed.filter === "help") {
				const result = await pi.exec(SCRIPT_PATH, ["--help"], { timeout: 10_000 });
				const output = buildHelpOutput(result.stdout ?? "", result.stderr ?? "", result.code);
				await showTextDialog(ctx, "Quota Check", output.text, output.isError);
				return;
			}

			const providers = parsed.filter === "both" ? (["codex", "minimax", "deepseek", "mimo"] as const) : ([parsed.filter] as const);
			const quotas = await Promise.all(providers.map((provider) => fetchQuota(pi, provider)));
			await showQuotaCard(ctx, quotas);
		},
	});
}
