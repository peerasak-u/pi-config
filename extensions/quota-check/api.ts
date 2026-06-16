/**
 * Shared quota fetch + parsing for /quota-check and minimal-footer.
 */

import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SCRIPT_PATH = path.join(os.homedir(), ".tony-cli", "tools", "quota-check", "quota-check.sh");

export const PROVIDERS = ["codex", "grok"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type QuotaWindow = {
	name: string;
	used_percent: number;
	reset_at: number;
	remains_ms?: number;
};

export type QuotaInfo = {
	provider: ProviderId;
	label: string;
	detail: string;
	windows: QuotaWindow[];
	error?: string;
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
	codex: "Codex / ChatGPT",
	grok: "Grok",
};

function isProviderId(value: string): value is ProviderId {
	return (PROVIDERS as readonly string[]).includes(value);
}

export function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, Math.round(value)));
}

function parseQuotaJson(stdout: string, fallbackProvider: ProviderId): QuotaInfo {
	const arr = JSON.parse(stdout) as any[];
	const data = Array.isArray(arr) ? arr.find((e) => e.provider === fallbackProvider) ?? arr[0] : arr;
	if (!data) throw new Error("empty response");
	const provider: ProviderId = isProviderId(data.provider) ? data.provider : fallbackProvider;
	const windows: QuotaWindow[] = (data.windows ?? []).map((w: any) => ({
		name: String(w.name ?? ""),
		used_percent: Number(w.used_percent ?? 0),
		reset_at: Number(w.reset_at ?? 0),
		remains_ms: w.remains_ms != null ? Number(w.remains_ms) : undefined,
	}));
	return {
		provider,
		label: String(data.label ?? PROVIDER_LABELS[provider]),
		detail: String(data.plan_type ?? "unknown"),
		windows,
	};
}

function quotaError(provider: ProviderId, error: string): QuotaInfo {
	return {
		provider,
		label: PROVIDER_LABELS[provider],
		detail: "unavailable",
		windows: [],
		error,
	};
}

export async function fetchQuota(pi: ExtensionAPI, provider: ProviderId): Promise<QuotaInfo> {
	const result = await pi.exec(SCRIPT_PATH, [`--${provider}`, "--json"], { timeout: 20_000 });
	if (typeof result.code === "number" && result.code !== 0) {
		const message =
			[result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n") || `${provider} quota check failed`;
		return quotaError(provider, message);
	}
	try {
		return parseQuotaJson(result.stdout ?? "", provider);
	} catch (error: any) {
		return quotaError(provider, `Could not parse ${provider} quota JSON: ${error?.message ?? String(error)}`);
	}
}

/** Pi model provider id → quota script provider */
export function quotaProviderForModelProvider(modelProvider: string | undefined): ProviderId | null {
	if (modelProvider === "openai-codex") return "codex";
	if (modelProvider === "xai-auth") return "grok";
	return null;
}

export type FooterQuotaBadge = { label: string; percent: number } | null;

/** Badge text for minimal-footer: 5h window (Codex) or credits (Grok). */
export function footerQuotaBadge(quota: QuotaInfo, modelProvider: string): FooterQuotaBadge {
	if (quota.error || quota.windows.length === 0) return null;

	if (modelProvider === "openai-codex") {
		const win = quota.windows.find((w) => /5h/i.test(w.name)) ?? quota.windows[0];
		if (!win) return null;
		return { label: "5h", percent: clampPercent(win.used_percent) };
	}

	if (modelProvider === "xai-auth") {
		const win =
			quota.windows.find((w) => /credit/i.test(w.name)) ??
			quota.windows[0];
		if (!win) return null;
		const pct = Number.isFinite(win.used_percent) ? win.used_percent : 0;
		return { label: "cr", percent: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) };
	}

	return null;
}

export function formatFooterQuotaSuffix(badge: FooterQuotaBadge): string {
	if (!badge) return "";
	const pct = Number.isInteger(badge.percent) ? String(badge.percent) : badge.percent.toFixed(1);
	return ` [${badge.label}: ${pct}%]`;
}