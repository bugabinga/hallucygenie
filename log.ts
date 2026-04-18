// HallucyGenie — Structured logger
// Plain functions, no classes, no deps. Fast.
//
// Prod: JSON to stdout (container captures it)
// Dev:  pretty-printed to stderr + append to logs/dev.log
//
// Child loggers carry context (reqId, sessionId) through closure, not inheritance.
// Non-blocking: file writes go through a ring buffer flushed on a timer.

import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ── Types ────────────────────────────────────────────────────────────

type Level = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: Level;
  msg: string;
  time: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(extra: Record<string, unknown>): Logger;
}

// ── Level ranks (early exit) ────────────────────────────────────────

const RANK: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── ANSI colors (tasteful, minimal) ──────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREY = "\x1b[90m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

const LEVEL_COLORS: Record<Level, string> = {
  debug: GREY,
  info: CYAN,
  warn: YELLOW,
  error: RED,
};

// ── Ring buffer for non-blocking file writes ─────────────────────────

const RING_SIZE = 256;
const ring: string[] = new Array(RING_SIZE);
let ringHead = 0;
let ringCount = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ringPush(line: string): void {
  ring[ringHead] = line;
  ringHead = (ringHead + 1) % RING_SIZE;
  if (ringCount < RING_SIZE) ringCount++;
}

function ringFlush(filePath: string): void {
  if (ringCount === 0) return;
  // Drain the ring in order (oldest first)
  const start = ringCount < RING_SIZE ? 0 : ringHead;
  const chunks: string[] = [];
  for (let i = 0; i < ringCount; i++) {
    const idx = (start + i) % RING_SIZE;
    const line = ring[idx];
    if (line !== undefined) {
      chunks.push(line);
      ring[idx] = undefined as unknown as string;
    }
  }
  ringHead = 0;
  ringCount = 0;
  if (chunks.length === 0) return;
  try {
    appendFileSync(filePath, chunks.join("\n") + "\n");
  } catch {
    // If file write fails, silently drop. Don't block the app.
  }
}

// ── Pretty printer ──────────────────────────────────────────────────

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function prettyTime(date: Date): string {
  return (
    `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}:${pad(date.getSeconds(), 2)}.${pad(date.getMilliseconds(), 3)}`
  );
}

function prettyLevel(level: Level): string {
  const color = LEVEL_COLORS[level];
  const label = level.toUpperCase().padEnd(5);
  return `${color}${label}${RESET}`;
}

function prettyContext(ctx: Record<string, unknown>): string {
  const parts = Object.entries(ctx)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${DIM}${k}${RESET}=${DIM}${v}${RESET}`);
  return parts.length > 0 ? parts.join(" ") + " " : "";
}

function pretty(entry: LogEntry): string {
  const time = prettyTime(new Date(entry.time));
  const { level: _, msg: m, time: __, ...rest } = entry;
  const ctxStr = prettyContext(rest);
  return `${DIM}${time}${RESET} ${prettyLevel(entry.level)} ${ctxStr}${m}`;
}

// ── JSON serializer ─────────────────────────────────────────────────

function toJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// ── Dev log file path ───────────────────────────────────────────────

const DEV_LOG_PATH = "logs/dev.log";

function ensureLogDir(): void {
  const dir = dirname(DEV_LOG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── createLogger ────────────────────────────────────────────────────

export function createLogger(context: Record<string, unknown> = {}): Logger {
  const isDev = process.env.NODE_ENV !== "production";
  const minLevel: Level = (process.env.LOG_LEVEL as Level) || (isDev ? "debug" : "info");

  // Start flush timer in dev mode
  if (isDev && !flushTimer) {
    ensureLogDir();
    // Write a header so the file is readable
    appendFileSync(DEV_LOG_PATH, `\n--- HallucyGenie started ${new Date().toISOString()} ---\n`);
    flushTimer = setInterval(() => ringFlush(DEV_LOG_PATH), 500);
    flushTimer.unref(); // Don't keep process alive for the timer
  }

  function log(level: Level, msg: string, data?: Record<string, unknown>): void {
    if (RANK[level] < RANK[minLevel]) return;

    const entry: LogEntry = {
      level,
      msg,
      time: new Date().toISOString(),
      ...context,
      ...data,
    };

    if (isDev) {
      // Pretty print to stderr
      process.stderr.write(pretty(entry) + "\n");
      // Queue for file (non-blocking)
      ringPush(toJson(entry));
    } else {
      // JSON to stdout (container captures it)
      process.stdout.write(toJson(entry) + "\n");
    }
  }

  return {
    debug: (msg, data?) => log("debug", msg, data),
    info: (msg, data?) => log("info", msg, data),
    warn: (msg, data?) => log("warn", msg, data),
    error: (msg, data?) => log("error", msg, data),
    child: (extra) => createLogger({ ...context, ...extra }),
  };
}

// ── Request ID generator ────────────────────────────────────────────

let reqCounter = 0;

export function nextReqId(): string {
  reqCounter++;
  // 6-char hex, zero-padded. e.g. "00001a" — unique within a process lifetime
  return reqCounter.toString(16).padStart(6, "0");
}

// ── Flush on exit (don't lose logs) ────────────────────────────────

if (typeof process !== "undefined") {
  const doFlush = () => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    ringFlush(DEV_LOG_PATH);
  };
  process.on("exit", doFlush);
  process.on("SIGINT", () => { doFlush(); process.exit(0); });
  process.on("SIGTERM", () => { doFlush(); process.exit(0); });
}
