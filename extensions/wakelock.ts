import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const TMP_DIR = "/tmp/pi-wakelock";
const SESSIONS_DIR = `${TMP_DIR}/sessions`;
const CAFFEINATE_PID_FILE = `${TMP_DIR}/caffeinate.pid`;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureDirs() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getActiveSessions(): string[] {
  if (!existsSync(SESSIONS_DIR)) return [];
  const files = readdirSync(SESSIONS_DIR);
  const active: string[] = [];
  for (const sessionID of files) {
    const filePath = resolve(SESSIONS_DIR, sessionID);
    try {
      const pidStr = readFileSync(filePath, "utf8").trim();
      const pid = parseInt(pidStr, 10);
      if (isProcessAlive(pid)) {
        active.push(sessionID);
      } else {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore errors (e.g. file deleted by another process)
    }
  }
  return active;
}

function isCaffeinateRunning(): boolean {
  if (!existsSync(CAFFEINATE_PID_FILE)) return false;
  try {
    const pidStr = readFileSync(CAFFEINATE_PID_FILE, "utf8").trim();
    const pid = parseInt(pidStr, 10);
    if (isProcessAlive(pid)) return true;
    unlinkSync(CAFFEINATE_PID_FILE);
    return false;
  } catch {
    return false;
  }
}

function startCaffeinate() {
  const proc = spawn("caffeinate", ["-i"], {
    detached: true,
    stdio: "ignore",
  });
  proc.unref();
  if (proc.pid) {
    writeFileSync(CAFFEINATE_PID_FILE, String(proc.pid));
  }
}

function stopCaffeinate() {
  if (!existsSync(CAFFEINATE_PID_FILE)) return;
  try {
    const pidStr = readFileSync(CAFFEINATE_PID_FILE, "utf8").trim();
    const pid = parseInt(pidStr, 10);
    process.kill(pid, "SIGTERM");
  } catch {
    // Ignore errors
  }
  try {
    unlinkSync(CAFFEINATE_PID_FILE);
  } catch {
    // Ignore errors
  }
}

function acquire(sessionID: string) {
  if (process.platform !== "darwin") return;
  ensureDirs();
  const sessionPath = resolve(SESSIONS_DIR, sessionID);
  writeFileSync(sessionPath, String(process.pid));
  if (!isCaffeinateRunning()) {
    startCaffeinate();
  }
}

function release(sessionID: string) {
  if (process.platform !== "darwin") return;
  const sessionPath = resolve(SESSIONS_DIR, sessionID);
  try {
    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
    }
  } catch {
    // Ignore errors
  }
  const remaining = getActiveSessions();
  if (remaining.length === 0) {
    stopCaffeinate();
  }
}

function startupCleanup() {
  if (process.platform !== "darwin") return;
  ensureDirs();
  const active = getActiveSessions();
  if (active.length === 0) {
    stopCaffeinate();
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (process.platform === "darwin") {
      startupCleanup();
      ctx.ui.notify("Wake Lock Extension Loaded", "info");
    }
  });

  pi.on("agent_start", async (_event, ctx) => {
    if (process.platform === "darwin") {
      const sessionFile = ctx.sessionManager.getSessionFile() || "ephemeral";
      const sessionID = encodeURIComponent(sessionFile);
      acquire(sessionID);
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (process.platform === "darwin") {
      const sessionFile = ctx.sessionManager.getSessionFile() || "ephemeral";
      const sessionID = encodeURIComponent(sessionFile);
      release(sessionID);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (process.platform === "darwin") {
      const sessionFile = ctx.sessionManager.getSessionFile() || "ephemeral";
      const sessionID = encodeURIComponent(sessionFile);
      release(sessionID);
    }
  });
}
