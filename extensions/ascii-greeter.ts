/**
 * ASCII Animal Greeter Extension
 *
 * Replaces the pi header with a fancy ASCII animal mascot.
 * Features multiple animals, random selection, color theming, and user preferences.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

// --- ANIMAL TYPE ---
type Animal = "cat" | "dog" | "owl" | "fox" | "panda" | "bunny" | "dragon" | "unicorn" | "random";

interface GreeterConfig {
  animal: Animal;
  showVersion: boolean;
  subtitle: string;
  colorMode: "auto" | "rainbow" | "theme";
}

// --- ASCII ART ANIMALS ---
// All art is trimmed and padded to consistent widths for proper centering
const animals: Record<Exclude<Animal, "random">, string[]> = {
  // Curious cat with big eyes (max width: 17)
  cat: [
    "    /\\_/\\         ",
    "   ( o.o )        ",
    "    > ^ <         ",
    "   /|   |\\        ",
    "  (_|   |_)       ",
  ],

  // Happy dog with tongue out (max width: 18)
  dog: [
    "    /^ ^\\         ",
    "   / 0 0 \\        ",
    "   V\\ Y /V        ",
    "    / - \\         ",
    "   /    |         ",
    "  (_/  \\_)        ",
  ],

  // Wise owl (max width: 19)
  owl: [
    "     ___  ___     ",
    "    /   \/   \\    ",
    "   |  O    O  |   ",
    "   |    \/    |   ",
    "    \\   ||   /    ",
    "     \\__||__/     ",
    "       ||||       ",
  ],

  // Clever fox (max width: 20)
  fox: [
    "      /\\    /\\    ",
    "     /  \\__/  \\   ",
    "    (  O    O  )  ",
    "     \\   \/   /   ",
    "      \\  /\\  /    ",
    "       \\/  \\/     ",
    "        |  |      ",
  ],

  // Cute panda (max width: 17)
  panda: [
    "    @@@@@@@       ",
    "   @(-   -)@      ",
    "    @  O  @       ",
    "     @@@@@        ",
    "    /    \\        ",
    "   (_/  \\_)       ",
  ],

  // Fluffy bunny (max width: 20)
  bunny: [
    "     (\\    /)     ",
    "      (\\  /)      ",
    "       (  )       ",
    "       /  \\       ",
    "      ( OO )      ",
    "       \\__/       ",
    "       /|  |\\     ",
    "      (_|  |_)    ",
  ],

  // Mighty dragon (max width: 21)
  dragon: [
    "          /\\       ",
    "    _____/  \\_____ ",
    "   /  O      O    \\ ",
    "  /   \/\\  /\\/    \\ ",
    " |    ========    |",
    "  \\    \\____/    / ",
    "   \\____________/  ",
    "       ||  ||      ",
  ],

  // Magical unicorn (max width: 21)
  unicorn: [
    "        /|          ",
    "       / |          ",
    "      /  |   ___    ",
    "     /   |__/   \\   ",
    "    |   O    O   |  ",
    "     \\    \/    /   ",
    "      \\  ====  /    ",
    "       \\______/     ",
  ],
};

// --- COLOR MODES ---
const rainbowColors = [
  "\x1b[31m", // Red
  "\x1b[33m", // Yellow
  "\x1b[32m", // Green
  "\x1b[36m", // Cyan
  "\x1b[34m", // Blue
  "\x1b[35m", // Magenta
];

const resetColor = "\x1b[0m";

// --- STATE ---
let currentConfig: GreeterConfig = {
  animal: "random",
  showVersion: true,
  subtitle: "✨ shitty coding agent",
  colorMode: "auto",
};

// --- HELPERS ---
function getConfigPath(): string {
  return join(homedir(), ".config", "pi", "ascii-greeter.json");
}

async function loadConfig(): Promise<void> {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const data = await readFile(configPath, "utf8");
      const saved = JSON.parse(data);
      currentConfig = { ...currentConfig, ...saved };
    } catch {
      // Ignore parse errors
    }
  }
}

async function saveConfig(): Promise<void> {
  const configPath = getConfigPath();
  const configDir = join(homedir(), ".config", "pi");
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }
  await writeFile(configPath, JSON.stringify(currentConfig, null, 2));
}

function getRandomAnimal(): Exclude<Animal, "random"> {
  const keys = Object.keys(animals) as Exclude<Animal, "random">[];
  return keys[Math.floor(Math.random() * keys.length)];
}

function getActiveAnimal(): Exclude<Animal, "random"> {
  if (currentConfig.animal === "random") {
    return getRandomAnimal();
  }
  return currentConfig.animal;
}

function applyRainbow(text: string, lineIndex: number): string {
  const color = rainbowColors[lineIndex % rainbowColors.length];
  return `${color}${text}${resetColor}`;
}

function applyThemeColors(lines: string[], theme: Theme, mode: GreeterConfig["colorMode"]): string[] {
  if (mode === "rainbow") {
    return lines.map((line, i) => applyRainbow(line, i));
  }

  if (mode === "theme" || mode === "auto") {
    const accent = theme.fg("accent", "").replace(resetColor, "");
    const text = theme.fg("text", "").replace(resetColor, "");

    return lines.map((line, i) => {
      // First few lines get accent color (the face)
      if (i < 3) {
        return `${accent}${line}${resetColor}`;
      }
      // Body gets text color
      return `${text}${line}${resetColor}`;
    });
  }

  return lines;
}

function centerText(text: string, width: number): string {
  const textWidth = visibleWidth(text);
  const padding = Math.max(0, Math.floor((width - textWidth) / 2));
  // Truncate if text is too wide for the terminal
  const safeText = truncateToWidth(text, width, "");
  return " ".repeat(padding) + safeText;
}

// --- HEADER RENDERER ---
function createHeaderRenderer(animal: Exclude<Animal, "random">, theme: Theme) {
  // Cache state for performance
  let cachedWidth: number | undefined;
  let cachedLines: string[] | undefined;
  let currentArt = animals[animal];
  let currentTheme = theme;

  function rebuild(): void {
    cachedLines = undefined; // Invalidate cache on rebuild
  }

  // Initial build
  rebuild();

  return {
    render(width: number): string[] {
      // Return cached if dimensions haven't changed
      if (cachedLines && cachedWidth === width) {
        return cachedLines;
      }

      const lines: string[] = [""];

      // Add the animal art (centered)
      const coloredArt = applyThemeColors([...currentArt], currentTheme, currentConfig.colorMode);
      for (const line of coloredArt) {
        lines.push(centerText(line, width));
      }

      // Add subtitle
      if (currentConfig.subtitle) {
        const version = currentConfig.showVersion ? ` v${VERSION}` : "";
        const subtitleText = `${currentConfig.subtitle}${currentTheme.fg("dim", version)}`;
        lines.push("");
        lines.push(centerText(subtitleText, width));
      }

      lines.push("");

      // Update cache
      cachedWidth = width;
      cachedLines = lines;
      return lines;
    },
    invalidate() {
      // Clear cache and rebuild with current theme
      cachedWidth = undefined;
      cachedLines = undefined;
      rebuild();
    },
  };
}

// --- MAIN EXTENSION ---
export default function (pi: ExtensionAPI) {
  // Load saved config on startup
  pi.on("session_start", async (_event, ctx) => {
    await loadConfig();

    if (ctx.hasUI) {
      const animal = getActiveAnimal();
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(animal, theme));
    }
  });

  // Command to set animal
  pi.registerCommand("animal", {
    description: "Set the ASCII greeter animal (cat, dog, owl, fox, panda, bunny, dragon, unicorn, random)",
    handler: async (args, ctx) => {
      const validAnimals: Animal[] = ["cat", "dog", "owl", "fox", "panda", "bunny", "dragon", "unicorn", "random"];
      const requested = args?.trim().toLowerCase() as Animal;

      if (!requested || !validAnimals.includes(requested)) {
        ctx.ui.notify(`Usage: /animal <${validAnimals.join("|")}>`, "warning");
        return;
      }

      currentConfig.animal = requested;
      await saveConfig();

      // Apply immediately
      const animal = getActiveAnimal();
      const theme = ctx.ui.getTheme?.() ?? { fg: (_c: string, t: string) => t } as Theme;
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(animal, theme));

      ctx.ui.notify(`Greeter set to ${animal}${requested === "random" ? " (random)" : ""}!`, "success");
    },
  });

  // Command to cycle animals
  pi.registerCommand("animal-cycle", {
    description: "Cycle to the next ASCII animal",
    handler: async (_args, ctx) => {
      const keys = Object.keys(animals) as Exclude<Animal, "random">[];
      const current = currentConfig.animal === "random" ? keys[0] : currentConfig.animal;
      const currentIndex = keys.indexOf(current);
      const nextIndex = (currentIndex + 1) % keys.length;
      const nextAnimal = keys[nextIndex];

      currentConfig.animal = nextAnimal;
      await saveConfig();

      const theme = ctx.ui.getTheme?.() ?? { fg: (_c: string, t: string) => t } as Theme;
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(nextAnimal, theme));

      ctx.ui.notify(`Greeter: ${nextAnimal}`, "info");
    },
  });

  // Command to set color mode
  pi.registerCommand("animal-color", {
    description: "Set color mode: auto, rainbow, or theme",
    handler: async (args, ctx) => {
      const validModes = ["auto", "rainbow", "theme"];
      const mode = args?.trim().toLowerCase() as GreeterConfig["colorMode"];

      if (!mode || !validModes.includes(mode)) {
        ctx.ui.notify(`Usage: /animal-color <auto|rainbow|theme>`, "warning");
        return;
      }

      currentConfig.colorMode = mode;
      await saveConfig();

      // Refresh header
      const animal = getActiveAnimal();
      const theme = ctx.ui.getTheme?.() ?? { fg: (_c: string, t: string) => t } as Theme;
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(animal, theme));

      ctx.ui.notify(`Color mode: ${mode}`, "success");
    },
  });

  // Command to set custom subtitle
  pi.registerCommand("animal-subtitle", {
    description: "Set custom subtitle text (or 'default' to reset)",
    handler: async (args, ctx) => {
      const text = args?.trim();

      if (!text) {
        ctx.ui.notify("Usage: /animal-subtitle <text> or /animal-subtitle default", "warning");
        return;
      }

      currentConfig.subtitle = text === "default" ? "✨ shitty coding agent" : text;
      await saveConfig();

      const animal = getActiveAnimal();
      const theme = ctx.ui.getTheme?.() ?? { fg: (_c: string, t: string) => t } as Theme;
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(animal, theme));

      ctx.ui.notify("Subtitle updated!", "success");
    },
  });

  // Command to toggle version display
  pi.registerCommand("animal-version", {
    description: "Toggle version number display",
    handler: async (_args, ctx) => {
      currentConfig.showVersion = !currentConfig.showVersion;
      await saveConfig();

      const animal = getActiveAnimal();
      const theme = ctx.ui.getTheme?.() ?? { fg: (_c: string, t: string) => t } as Theme;
      ctx.ui.setHeader((_tui, theme) => createHeaderRenderer(animal, theme));

      ctx.ui.notify(`Version display: ${currentConfig.showVersion ? "on" : "off"}`, "info");
    },
  });

  // Command to show current settings
  pi.registerCommand("animal-status", {
    description: "Show current ASCII greeter settings",
    handler: async (_args, ctx) => {
      const settings = [
        `Animal: ${currentConfig.animal}`,
        `Color mode: ${currentConfig.colorMode}`,
        `Subtitle: "${currentConfig.subtitle}"`,
        `Show version: ${currentConfig.showVersion}`,
      ];
      ctx.ui.notify(settings.join(" | "), "info");
    },
  });

  // Command to restore built-in header
  pi.registerCommand("animal-off", {
    description: "Restore the built-in pi header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored. Use /animal <name> to re-enable.", "info");
    },
  });

  // List all available animals
  pi.registerCommand("animal-list", {
    description: "List all available ASCII animals",
    handler: async (_args, ctx) => {
      const animalNames = Object.keys(animals).join(", ");
      ctx.ui.notify(`Available animals: ${animalNames}, random`, "info");
    },
  });
}
