/**
 * Agent Model Switcher Extension
 *
 * Provides `/agent-models` command to switch agent models between presets.
 * Configuration is stored in settings.json under "agentModelPresets" key.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Default presets (used if not configured in settings.json)
const DEFAULT_PRESETS: AgentModelPresets = {
	"opencode-go": {
		planner: "opencode-go/glm-5",
		worker: "opencode-go/minimax-m2.5",
		scout: "opencode-go/minimax-m2.5",
		reviewer: "opencode-go/glm-5",
		spec: "opencode-go/glm-5",
		researcher: "opencode-go/minimax-m2.5",
		autoresearch: "opencode-go/glm-5",
		"visual-tester": "opencode-go/minimax-m2.5",
	},
	"all-free": {
		planner: "google-antigravity/gemini-3-flash",
		worker: "google-antigravity/gemini-3-flash",
		scout: "google-antigravity/gemini-3-flash",
		reviewer: "google-antigravity/gemini-3-flash",
		spec: "google-antigravity/gemini-3-flash",
		researcher: "google-antigravity/gemini-3-flash",
		autoresearch: "google-antigravity/gemini-3-flash",
		"visual-tester": "google-antigravity/gemini-3-flash",
	},
	mixed: {
		planner: "opencode-go/glm-5",
		worker: "opencode-go/minimax-m2.5",
		scout: "google-antigravity/gemini-3-flash",
		reviewer: "opencode-go/glm-5",
		spec: "opencode-go/glm-5",
		researcher: "opencode-go/minimax-m2.5",
		autoresearch: "opencode-go/glm-5",
		"visual-tester": "opencode-go/minimax-m2.5",
	},
};

interface AgentModelPresets {
	[presetName: string]: {
		[agentName: string]: string;
	};
}

interface Settings {
	agentModelPresets?: AgentModelPresets;
	[key: string]: unknown;
}

/**
 * Parse agent file and extract frontmatter
 */
function parseAgentFile(content: string): { frontmatter: Record<string, string>; body: string } {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!frontmatterMatch) {
		return { frontmatter: {}, body: content };
	}

	const frontmatterLines = frontmatterMatch[1].split("\n");
	const frontmatter: Record<string, string> = {};

	for (const line of frontmatterLines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex > 0) {
			const key = line.slice(0, colonIndex).trim();
			const value = line.slice(colonIndex + 1).trim();
			frontmatter[key] = value;
		}
	}

	return { frontmatter, body: frontmatterMatch[2] };
}

/**
 * Serialize frontmatter back to string
 */
function serializeAgentFile(frontmatter: Record<string, string>, body: string): string {
	const lines = ["---"];
	for (const [key, value] of Object.entries(frontmatter)) {
		lines.push(`${key}: ${value}`);
	}
	lines.push("---");
	lines.push(body);
	return lines.join("\n");
}

/**
 * Get current models from agent files
 */
function getCurrentModels(agentsDir: string): Record<string, string> {
	const models: Record<string, string> = {};
	const files = existsSync(agentsDir) ? require("fs").readdirSync(agentsDir) : [];

	for (const file of files) {
		if (!file.endsWith(".md")) continue;

		const filePath = join(agentsDir, file);
		const content = readFileSync(filePath, "utf-8");
		const { frontmatter } = parseAgentFile(content);

		const agentName = file.replace(".md", "");
		if (frontmatter.model) {
			models[agentName] = frontmatter.model;
		}
	}

	return models;
}

/**
 * Detect which preset is currently active (if any)
 */
function detectActivePreset(
	currentModels: Record<string, string>,
	presets: AgentModelPresets,
): string | null {
	for (const [presetName, presetModels] of Object.entries(presets)) {
		let matches = true;
		for (const [agentName, model] of Object.entries(presetModels)) {
			if (currentModels[agentName] !== model) {
				matches = false;
				break;
			}
		}
		if (matches) {
			return presetName;
		}
	}
	return null;
}

/**
 * Update agent files with new preset
 */
function applyPreset(
	agentsDir: string,
	preset: Record<string, string>,
): { updated: number; errors: string[] } {
	const result = { updated: 0, errors: [] as string[] };

	for (const [agentName, model] of Object.entries(preset)) {
		const filePath = join(agentsDir, `${agentName}.md`);

		if (!existsSync(filePath)) {
			result.errors.push(`Agent file not found: ${agentName}.md`);
			continue;
		}

		try {
			const content = readFileSync(filePath, "utf-8");
			const { frontmatter, body } = parseAgentFile(content);

			// Only update if model is different
			if (frontmatter.model === model) {
				continue;
			}

			frontmatter.model = model;
			const newContent = serializeAgentFile(frontmatter, body);
			writeFileSync(filePath, newContent, "utf-8");
			result.updated++;
		} catch (err) {
			result.errors.push(`Failed to update ${agentName}.md: ${err}`);
		}
	}

	return result;
}

/**
 * Ensure settings.json has agentModelPresets configured
 */
function ensureSettingsConfig(settingsPath: string, presets: AgentModelPresets): void {
	if (!existsSync(settingsPath)) {
		writeFileSync(settingsPath, JSON.stringify({ agentModelPresets: presets }, null, 2), "utf-8");
		return;
	}

	try {
		const content = readFileSync(settingsPath, "utf-8");
		const settings: Settings = JSON.parse(content);

		if (!settings.agentModelPresets) {
			settings.agentModelPresets = presets;
			writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
		}
	} catch {
		// If parsing fails, leave as-is
	}
}

export default function (pi: ExtensionAPI) {
	const homeDir = process.env.HOME || process.env.USERPROFILE || "";
	const agentsDir = join(homeDir, ".pi", "agent", "agents");
	const settingsPath = join(homeDir, ".pi", "agent", "settings.json");

	pi.registerCommand("agent-models", {
		description: "Switch agent models between presets (opencode-go, all-free, mixed)",
		handler: async (args: string, ctx: ExtensionContext) => {
			// Ensure settings.json has presets
			ensureSettingsConfig(settingsPath, DEFAULT_PRESETS);

			// Load presets from settings
			let presets = DEFAULT_PRESETS;
			try {
				const settingsContent = readFileSync(settingsPath, "utf-8");
				const settings: Settings = JSON.parse(settingsContent);
				if (settings.agentModelPresets) {
					presets = settings.agentModelPresets;
				}
			} catch (err) {
				if (ctx.hasUI) {
					ctx.ui.notify(`Warning: Could not read settings.json, using defaults`, "warning");
				}
			}

			let presetName = args.trim();

			if (!presetName) {
				if (!ctx.hasUI) {
					console.log("agent-models requires interactive mode or an argument");
					return;
				}

				// Get current models
				const currentModels = getCurrentModels(agentsDir);
				const activePreset = detectActivePreset(currentModels, presets);

				// Build menu options
				const options = Object.keys(presets).map((name) => {
					const isActive = name === activePreset;
					return isActive ? `${name} (active)` : name;
				});

				// Show selection menu
				const selected = await ctx.ui.select("Select agent model preset:", options);

				if (!selected) {
					ctx.ui.notify("Cancelled", "info");
					return;
				}

				// Extract preset name from selection
				presetName = selected.replace(" (active)", "").trim();
			}

			if (!presetName || !presets[presetName]) {
				const errorMsg = `Invalid preset: ${presetName || "none"}`;
				if (ctx.hasUI) {
					ctx.ui.notify(errorMsg, "error");
				} else {
					console.error(errorMsg);
				}
				return;
			}

			// Apply preset
			const result = applyPreset(agentsDir, presets[presetName]);

			const msg = `Switched ${result.updated} agent(s) to '${presetName}' preset. Run /reload to apply.`;
			if (result.errors.length > 0) {
				const errorMsg = `Errors: ${result.errors.join(", ")}`;
				if (ctx.hasUI) {
					ctx.ui.notify(errorMsg, "error");
				} else {
					console.error(errorMsg);
				}
				return;
			}

			if (ctx.hasUI) {
				ctx.ui.notify(msg, "success");
			} else {
				console.log(msg);
			}
		},
	});
}