/**
 * Minimal Footer Extension
 *
 * Replaces the built-in footer with a minimal single-line display:
 *   project · main · gpt-5.5/high [5h: 1%]       ▓▓▒░░░░░░░░░ 16%/200k
 *
 * For openai-codex / xai-auth models, appends quota usage from quota-check.sh
 * (5h window % and credit % respectively).
 *
 * footerData provides git branch and extension statuses.
 * Token/context stats come from ctx.sessionManager and ctx.getContextUsage().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	fetchQuota,
	footerQuotaBadge,
	formatFooterQuotaSuffix,
	quotaProviderForModelProvider,
	type FooterQuotaBadge,
	type ProviderId,
} from "./quota-check/api.ts";

const BAR_WIDTH = 12;
const BRANCH_WIDTH = 32;
const QUOTA_REFRESH_MS = 60_000;

type QuotaCacheEntry = {
	badge: FooterQuotaBadge;
	fetchedAt: number;
};

const quotaCache = new Map<ProviderId, QuotaCacheEntry>();
let quotaRefreshTimer: ReturnType<typeof setInterval> | undefined;
let quotaFetchInFlight = new Set<ProviderId>();

async function refreshQuotaForProvider(pi: ExtensionAPI, provider: ProviderId, onDone: () => void) {
	if (quotaFetchInFlight.has(provider)) return;
	quotaFetchInFlight.add(provider);
	try {
		const quota = await fetchQuota(pi, provider);
		const modelProvider = provider === "codex" ? "openai-codex" : "xai-auth";
		quotaCache.set(provider, {
			badge: footerQuotaBadge(quota, modelProvider),
			fetchedAt: Date.now(),
		});
	} finally {
		quotaFetchInFlight.delete(provider);
		onDone();
	}
}

function scheduleQuotaRefresh(pi: ExtensionAPI, modelProvider: string | undefined, requestRender: () => void) {
	const quotaProvider = quotaProviderForModelProvider(modelProvider);
	if (!quotaProvider) return;

	const cached = quotaCache.get(quotaProvider);
	const stale = !cached || Date.now() - cached.fetchedAt > QUOTA_REFRESH_MS;
	if (!stale) return;

	void refreshQuotaForProvider(pi, quotaProvider, requestRender);
}

function quotaSuffixForModel(modelProvider: string | undefined): string {
	const quotaProvider = quotaProviderForModelProvider(modelProvider);
	if (!quotaProvider) return "";
	const cached = quotaCache.get(quotaProvider);
	return formatFooterQuotaSuffix(cached?.badge ?? null);
}

export default function (pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	const requestRender = () => activeTui?.requestRender();

	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("session_shutdown", () => {
		if (quotaRefreshTimer) {
			clearInterval(quotaRefreshTimer);
			quotaRefreshTimer = undefined;
		}
		activeTui = undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			let percent = 0;
			let lastQuotaProvider: ProviderId | null = null;

			const ensureQuotaPolling = (modelProvider: string | undefined) => {
				const qp = quotaProviderForModelProvider(modelProvider);
				if (!qp) {
					lastQuotaProvider = null;
					return;
				}
				if (qp !== lastQuotaProvider) {
					lastQuotaProvider = qp;
					void refreshQuotaForProvider(pi, qp, () => tui.requestRender());
				} else {
					scheduleQuotaRefresh(pi, modelProvider, () => tui.requestRender());
				}
			};

			if (!quotaRefreshTimer) {
				quotaRefreshTimer = setInterval(() => {
					const provider = ctx.model?.provider;
					const qp = quotaProviderForModelProvider(provider);
					if (qp) void refreshQuotaForProvider(pi, qp, () => tui.requestRender());
				}, QUOTA_REFRESH_MS);
			}

			return {
				dispose() {
					unsub();
					if (activeTui === tui) activeTui = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const cwd = ctx.cwd;
					const folder = truncateToWidth(cwd.split("/").pop() ?? cwd, 20);

					const branch = truncateToWidth(footerData.getGitBranch() ?? "—", BRANCH_WIDTH);

					const modelProvider = ctx.model?.provider;
					ensureQuotaPolling(modelProvider);

					const model = truncateToWidth(ctx.model?.id ?? "no-model", 24);
					const quotaSuffix = quotaSuffixForModel(modelProvider);
					const modelThinking = truncateToWidth(`${model}/${pi.getThinkingLevel()}${quotaSuffix}`, 40);

					const usage = ctx.getContextUsage();
					percent =
						usage?.tokens != null && usage.tokens > 0 && usage?.contextWindow != null
							? Math.min(100, Math.round((usage.tokens / usage.contextWindow) * 100))
							: 0;
					const contextWindow = usage?.contextWindow ?? 0;

					const filled = Math.round((percent / 100) * BAR_WIDTH);
					const empty = BAR_WIDTH - filled;
					const progress = genBar(filled, empty, percent) + " " + percent + "%/" + formatTokens(contextWindow);

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