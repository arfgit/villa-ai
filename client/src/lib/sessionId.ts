import { checkSessionExists } from "./api";

export const SESSION_KEY = "villa-ai-session-id";
export const RECENT_SESSIONS_KEY = "villa-ai-recent-sessions";
const RECENT_SESSIONS_MAX = 5;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecentSession {
  id: string;
  lastUsedAt: number;
  // Optional human label for the session — filled in by the store after
  // a save lands (e.g. "Season 3 — beachy chaos"). Older entries without
  // a label fall back to displaying the shortened UUID in the UI.
  label?: string;
}

// Synchronous read. Safe to call from request()/fetch paths where we can't
// await. Will return `null` before ensureSessionId() has run at boot — all
// request code paths are gated behind restoreFromServer, which itself waits
// on ensureSessionId, so this should never actually return null in practice.
// If it does, throwing loudly is better than inventing a fresh UUID that
// could collide — that's the exact failure mode this file exists to prevent.
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

// Boot-time session resolver. Call ONCE in App.tsx before any API calls.
// Reads localStorage; if empty, generates a fresh UUID and verifies it
// isn't already bound to a session on the server. In the pathological
// case of repeated collisions (astronomically rare with v4 UUIDs, but
// defensive), retries up to 5 times before giving up.
export async function ensureSessionId(): Promise<string> {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing && UUID_RE.test(existing)) {
    touchRecentSession(existing);
    return existing;
  }
  // localStorage either empty or corrupted — mint a new one.
  const fresh = await mintUniqueSessionId();
  localStorage.setItem(SESSION_KEY, fresh);
  touchRecentSession(fresh);
  return fresh;
}

// Used by startNewEpisode and any future "sign out" flow — swaps in a
// fresh UUID so the old session is preserved on the server under its
// original key instead of being overwritten. The caller must complete
// all writes against the OLD UUID (archive, final save) BEFORE invoking
// rotate — after this resolves, getSessionId() returns the new value.
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
    // result === "unknown" — server unreachable or returned a non-200/404.
    // We can't confirm the UUID is free, so retrying with a fresh one
    // doesn't help (same server, same issue). Break out and fall through
    // to the fail-open path below, which is the documented tradeoff for
    // this share-by-URL model: collision probability is astronomical,
    // staying online is more valuable than a guaranteed no-collision.
    sawUnknown = true;
    break;
  }
  if (sawUnknown) {
    // Documented fail-open: collision check couldn't complete because the
    // server is down, so we return a raw UUID and log a warning. The
    // alternative (throwing) would block every first-time visitor every
    // time the backend is flaky — worse UX than a ~1-in-5e36 collision
    // risk. Only applies on FIRST visit with no cached session.
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

// Recent-sessions helpers — small rolling list in localStorage so a user
// who accidentally starts a new episode (rotating their UUID) can still
// find and re-open the previous run from the SessionModal.

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

// Bumps `id` to the front of the recent list with the current timestamp.
// Dedupes on id, caps length, swallows quota / parse errors — this is
// best-effort UX, not load-bearing.
//
// If a label is passed, it replaces any existing label. If label is
// omitted but the entry already had one, we PRESERVE the old label —
// otherwise a plain boot-time `touchRecentSession(id)` would erase the
// rich label that was set on the last save.
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
    /* swallow — recent list is a convenience, not critical state */
  }
}

export function removeRecentSession(id: string): void {
  try {
    const next = readRecentSessions().filter((e) => e.id !== id);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    /* swallow */
  }
}
