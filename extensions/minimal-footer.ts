/**
 * Minimal Footer Extension
 *
 * Replaces the built-in footer with a minimal single-line display:
 *   project · main · gpt-5.5/high          ▓▓▒░░░░░░░░░ 16%/200k
 *
 * footerData provides git branch and extension statuses.
 * Token/context stats come from ctx.sessionManager and ctx.getContextUsage().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR_WIDTH = 12;

export default function (pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	const requestRender = () => activeTui?.requestRender();

	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});

	// Apply minimal footer on load
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			let percent = 0;

			return {
				dispose() {
					unsub();
					if (activeTui === tui) activeTui = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					// Current folder name
					const cwd = ctx.cwd;
					const folder = truncateToWidth(cwd.split("/").pop() ?? cwd, 20);

					// Git branch (or dash if not in git)
					const branch = truncateToWidth(footerData.getGitBranch() ?? "—", 12);

					// Model + thinking level, e.g. gpt-5.5/high
					const model = truncateToWidth(ctx.model?.id ?? "no-model", 24);
					const modelThinking = truncateToWidth(`${model}/${pi.getThinkingLevel()}`, 32);

					// Context usage percentage
					const usage = ctx.getContextUsage();
					percent =
						usage?.tokens != null && usage.tokens > 0 && usage?.contextWindow != null
							? Math.min(100, Math.round((usage.tokens / usage.contextWindow) * 100))
							: 0;
					const contextWindow = usage?.contextWindow ?? 0;

					// Progress bar (▓ filled, ▒ partial, ░ empty) + percentage
					const filled = Math.round((percent / 100) * BAR_WIDTH);
					const empty = BAR_WIDTH - filled;
					const progress = genBar(filled, empty, percent) + " " + percent + "%/" + formatTokens(contextWindow);

					// Keep metadata on the left and snap progress to the right.
					const sep = " · ";
					const left = [folder, branch, modelThinking].join(sep);
					const progressWidth = visibleWidth(progress);
					const gap = width - visibleWidth(left) - progressWidth;

					if (gap > 0) {
						return [theme.fg("dim", left + " ".repeat(gap) + progress)];
					}

					if (width <= progressWidth) {
						return [theme.fg("dim", truncateToWidth(progress, width))];
					}

					const truncatedLeft = truncateToWidth(left, width - progressWidth - 1);
					return [theme.fg("dim", truncatedLeft + " " + progress)];
				},
			};
		});
	});
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return `${n}`;
}

function genBar(filled: number, empty: number, _pct: number): string {
	const C = { full: "▓", partial: "▒", empty: "░" };
	const total = filled + empty;
	let bar = "";
	for (let i = 0; i < total; i++) {
		const blockStart = Math.round((i / total) * 100);
		const blockEnd = Math.round(((i + 1) / total) * 100);
		const blockFill = Math.max(0, Math.min(100, _pct - blockStart));
		const pctInBlock = blockFill / (blockEnd - blockStart || 1);
		if (pctInBlock >= 0.8) bar += C.full;
		else if (pctInBlock >= 0.3) bar += C.partial;
		else bar += C.empty;
	}
	return bar;
}