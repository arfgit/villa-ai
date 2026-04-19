import { checkSessionExists } from "./api";

export const SESSION_KEY = "villa-ai-session-id";
export const RECENT_SESSIONS_KEY = "villa-ai-recent-sessions";
const RECENT_SESSIONS_MAX = 5;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecentSession {
  id: string;
  lastUsedAt: number;

  label?: string;
}

export function getSessionId(): string {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    throw new Error(
      "getSessionId() called before ensureSessionId() completed — " +
        "this request ran before app boot settled. Await restoreFromServer first.",
    );
  }
  return id;
}

export async function ensureSessionId(): Promise<string> {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing && UUID_RE.test(existing)) {
    touchRecentSession(existing);
    return existing;
  }

  const fresh = await mintUniqueSessionId();
  localStorage.setItem(SESSION_KEY, fresh);
  touchRecentSession(fresh);
  return fresh;
}

export async function rotateSessionId(): Promise<string> {
  const previous = localStorage.getItem(SESSION_KEY);
  const fresh = await mintUniqueSessionId();
  if (previous && UUID_RE.test(previous)) {
    touchRecentSession(previous);
  }
  localStorage.setItem(SESSION_KEY, fresh);
  touchRecentSession(fresh);
  return fresh;
}

async function mintUniqueSessionId(): Promise<string> {
  let sawUnknown = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = crypto.randomUUID();
    const result = await checkSessionExists(candidate);
    if (result === "free") return candidate;
    if (result === "taken") {
      console.warn(
        `[session] UUID collision on attempt ${attempt + 1} (${candidate}), retrying`,
      );
      continue;
    }
    sawUnknown = true;
    break;
  }
  if (sawUnknown) {
    const candidate = crypto.randomUUID();
    console.warn(
      `[session] collision check unreachable — assigning ${candidate} unverified`,
    );
    return candidate;
  }
  throw new Error(
    "Could not mint a unique session UUID after 5 consecutive collisions — " +
      "this is astronomically unlikely with v4 UUIDs. Check crypto.randomUUID.",
  );
}

export function readRecentSessions(): RecentSession[] {
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentSession =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as RecentSession).id === "string" &&
          UUID_RE.test((e as RecentSession).id) &&
          typeof (e as RecentSession).lastUsedAt === "number",
      )
      .slice(0, RECENT_SESSIONS_MAX);
  } catch {
    return [];
  }
}

export function touchRecentSession(id: string, label?: string): void {
  if (!UUID_RE.test(id)) return;
  try {
    const all = readRecentSessions();
    const existing = all.find((e) => e.id === id);
    const preserved = label ?? existing?.label;
    const rest = all.filter((e) => e.id !== id);
    const entry: RecentSession = { id, lastUsedAt: Date.now() };
    if (preserved) entry.label = preserved;
    const next: RecentSession[] = [entry, ...rest].slice(
      0,
      RECENT_SESSIONS_MAX,
    );
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    
  }
}

export function removeRecentSession(id: string): void {
  try {
    const next = readRecentSessions().filter((e) => e.id !== id);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    
  }
}
