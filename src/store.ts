import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CachedSession, Store } from "./types.js";

export const CONFIG_DIR = process.env.DISTIL_HOME ?? join(homedir(), ".config", "distil");
const STORE_PATH = join(CONFIG_DIR, "store.json");
const CACHE_PATH = join(CONFIG_DIR, "cache.json");
/** Bump whenever parser output changes so stale cached sessions are discarded. */
const PARSER_VERSION = 2;

export interface CachedFile {
  size: number;
  mtimeMs: number;
  session: CachedSession;
}

/** Parsed sessions keyed by transcript path; a file is re-parsed only when its size or mtime changes. */
export interface ParseCache {
  version: number;
  files: Record<string, CachedFile>;
}

export interface Config {
  transcriptsDir: string;
  corroboration: number;
  protectedBranches: string[];
  include: string[]; // project substrings; empty = all
  exclude: string[];
}

export const DEFAULT_CONFIG: Config = {
  transcriptsDir: join(homedir(), ".claude", "projects"),
  corroboration: 2,
  protectedBranches: ["main", "master", "production", "prod", "release"],
  include: [],
  exclude: [],
};

export function loadConfig(): Config {
  const p = join(CONFIG_DIR, "config.json");
  if (!existsSync(p)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, "utf8")) };
}

export function loadStore(): Store {
  if (!existsSync(STORE_PATH)) return { version: 1, scannedOffsets: {}, proposals: {}, backlog: {} };
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Store;
}

export function saveStore(store: Store): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function loadCache(): ParseCache {
  const empty: ParseCache = { version: PARSER_VERSION, files: {} };
  if (!existsSync(CACHE_PATH)) return empty;
  try {
    const cache = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as ParseCache;
    return cache.version === PARSER_VERSION ? cache : empty;
  } catch {
    return empty; // a corrupt cache only costs a full re-parse
  }
}

export function saveCache(cache: ParseCache): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
