import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  getSessionId,
  readRecentSessions,
  removeRecentSession,
  type RecentSession,
} from "@/lib/sessionId";
import { loadSessionByKey, useVillaStore } from "@/store/useVillaStore";
import {
  fetchProviderState,
  setProviderOverride,
  type ProviderState,
} from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function SessionModal({ open, onClose }: Props) {
  const [inputId, setInputId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // currentId is lazily resolved when the modal OPENS — calling
  // getSessionId() during render would throw if ensureSessionId hasn't
  // completed yet (SessionModal mounts with open=false during boot).
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Recent list in real state, not derived from localStorage via useMemo —
  // lets handleForget update it directly instead of relying on a no-op
  // setState to force a re-render (which React's bailout can skip).
  const [recent, setRecent] = useState<RecentSession[]>([]);
  // Pending-confirm target for the load action. `null` = no prompt shown;
  // a UUID string = "are you sure you want to switch to this session?"
  // confirmation is pending for that UUID. Gate on this so the user
  // never silently replaces their active session with a click-by-mistake.
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
  // Separate confirm flag for the "start new session" button. Gets its
  // own dialog (distinct wording) because switching to an existing
  // session and spinning up a fresh one are different destructive acts.
  const [pendingNewSession, setPendingNewSession] = useState(false);
  // Dev-only LLM provider toggle state. `null` means the dev endpoint
  // returned 404 (prod, or NODE_ENV set) — hide the toggle entirely.
  const [providerState, setProviderState] = useState<ProviderState | null>(
    null,
  );
  const [providerSwitching, setProviderSwitching] = useState(false);

  // Read isGenerating from the store so we can disable the destructive
  // actions (switch session, start new session) while a scene is being
  // generated — hitting them mid-generation would corrupt the in-flight
  // write. The store also guards these internally, but disabling the
  // UI gives the user immediate feedback instead of a delayed toast.
  const isGenerating = useVillaStore((s) => s.isGenerating);
  const startNewEpisode = useVillaStore((s) => s.startNewEpisode);

  // Refs for focus management on the confirm dialog. We restore focus to
  // the most recent trigger element when the dialog closes, and move
  // focus to the cancel button on mount so keyboard users don't start
  // tabbing from the page <body>.
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const triggerFocusRef = useRef<HTMLElement | null>(null);

  // Lazy resolution of the session UUID + recent list. Only runs when the
  // modal opens — by then, App.tsx has already awaited ensureSessionId(),
  // so getSessionId() is safe. Re-runs on every open so newly-rotated
  // UUIDs (from startNewEpisode) show up without a page refresh.
  useEffect(() => {
    if (!open) return;
    let id: string;
    try {
      id = getSessionId();
    } catch (err) {
      console.error("[session-modal] getSessionId threw:", err);
      setError("Session not ready yet — reload the page if this persists.");
      return;
    }
    setCurrentId(id);
    setRecent(readRecentSessions().filter((e) => e.id !== id));
    // Probe the dev-only provider endpoint. Returns null in prod (endpoint
    // is gated off) — we just don't show the toggle in that case.
    fetchProviderState().then(setProviderState);
  }, [open]);

  // ESC closes whichever confirm dialog is open, or the modal itself if no
  // confirm is pending. Handled globally so the handler picks up events
  // regardless of which element currently holds focus.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (pendingLoadId) {
        setPendingLoadId(null);
      } else if (pendingNewSession) {
        setPendingNewSession(false);
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, pendingLoadId, pendingNewSession, onClose]);

  // When either confirm dialog opens, move focus to its cancel button so
  // keyboard users can hit Enter / ESC without hunting. Restore focus to
  // the trigger element when both dialogs are closed.
  useEffect(() => {
    const confirmOpen = pendingLoadId !== null || pendingNewSession;
    if (confirmOpen) {
      triggerFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      queueMicrotask(() => confirmCancelRef.current?.focus());
    } else if (triggerFocusRef.current) {
      triggerFocusRef.current.focus();
      triggerFocusRef.current = null;
    }
  }, [pendingLoadId, pendingNewSession]);

  if (!open) return null;
  // If the modal opened but currentId is still null AND we've recorded an
  // error (e.g. getSessionId threw because ensureSessionId hadn't finished),
  // show a minimal error overlay instead of rendering nothing. Previously
  // the guard below swallowed the UI entirely and clicking the session
  // button looked like a no-op.
  if (!currentId) {
    if (error) {
      return (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/70"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-villa-bg-2 border-2 border-villa-love w-full max-w-sm p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-villa-love">
                session not ready
              </div>
              <p
                className="text-xs text-villa-dim leading-relaxed"
                role="alert"
              >
                {error}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
                >
                  close
                </button>
              </div>
            </div>
          </div>
        </>
      );
    }
    return null;
  }

  function handleCopy() {
    if (!currentId) return;
    navigator.clipboard
      .writeText(currentId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard API can fail on http (non-secure) contexts, denied
        // permission prompts, or older Safari. Surface it so the user
        // knows to select-and-copy manually instead of seeing nothing.
        setError(
          "Copy failed — select the key manually and press ⌘C / Ctrl-C.",
        );
      });
  }

  function promptLoad(id: string) {
    const trimmed = id.trim();
    if (!UUID_RE.test(trimmed)) {
      setError("Invalid session ID format");
      return;
    }
    setError(null);
    setPendingLoadId(trimmed);
  }

  async function confirmLoad() {
    if (!pendingLoadId) return;
    setLoading(true);
    setError(null);
    const ok = await loadSessionByKey(pendingLoadId);
    setLoading(false);
    setPendingLoadId(null);
    if (ok) {
      onClose();
    } else {
      setError("Session not found or empty");
    }
  }

  function cancelLoad() {
    setPendingLoadId(null);
  }

  function handleForget(id: string) {
    removeRecentSession(id);
    // Update component state directly — this is the "real state tick" that
    // the previous setInputId((v) => v) hack was faking. React's bailout
    // optimization will NOT skip this because the reference changes.
    setRecent((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleProviderSwitch(next: "anthropic" | "ollama" | "gemini") {
    if (providerState?.effective === next) return;
    setProviderSwitching(true);
    const result = await setProviderOverride(next);
    setProviderSwitching(false);
    if (result) {
      setProviderState(result);
    } else {
      setError(
        "Couldn't switch provider — server unreachable or in prod mode.",
      );
    }
  }

  async function confirmNewSession() {
    setLoading(true);
    setError(null);
    // startNewEpisode rotates the session UUID (archiving the current
    // villa to the server under its existing key) and boots a fresh
    // episode. It guards on isGenerating internally — we also disable
    // the button below to prevent the user reaching this path while a
    // scene is in flight.
    //
    // try/finally: the store's startNewEpisode is defensive but a
    // downstream throw (e.g. createEpisode assert) would otherwise
    // leave `loading=true` forever and lock the modal. Always unwind
    // the spinner; surface the error message so the user sees why it
    // failed instead of a stuck "starting..." button.
    try {
      await startNewEpisode();
      setPendingNewSession(false);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not start a new villa: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onClick={pendingLoadId || pendingNewSession ? undefined : onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-villa-bg-2 border-2 border-villa-pink w-full max-w-md">
          <div className="flex items-center justify-between p-3 border-b border-villa-pink/30">
            <span className="text-[10px] uppercase tracking-widest text-villa-pink">
              session manager
            </span>
            <button
              onClick={onClose}
              className="text-villa-dim hover:text-villa-pink text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink px-1"
              aria-label="Close session manager"
            >
              [close]
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                your session key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 bg-villa-bg border border-villa-dim/30 px-2 py-1.5 text-xs font-mono text-villa-aqua select-all break-all">
                  {currentId}
                </div>
                <button
                  onClick={handleCopy}
                  className={clsx(
                    "px-2 py-1.5 text-[10px] uppercase border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-aqua",
                    copied
                      ? "border-villa-sun text-villa-sun"
                      : "border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua",
                  )}
                  aria-label="Copy session key to clipboard"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
              <p className="text-[9px] text-villa-dim/60 mt-1">
                save this key to reload your villa session later
              </p>
            </div>

            {providerState && (
              <div className="border-t border-villa-dim/20 pt-4">
                <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                  llm provider (dev)
                </label>
                <p className="text-[9px] text-villa-dim/60 mb-2 leading-relaxed">
                  toggle lives in server memory — resets on restart. use for
                  quick a/b tests without editing .env.
                </p>
                <div
                  role="radiogroup"
                  aria-label="LLM provider"
                  className="flex gap-1"
                >
                  {(["anthropic", "ollama", "gemini"] as const).map((p) => {
                    const active = providerState.effective === p;
                    return (
                      <button
                        key={p}
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleProviderSwitch(p)}
                        disabled={providerSwitching || active}
                        className={clsx(
                          "flex-1 px-2 py-1.5 text-[10px] uppercase border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-aqua",
                          active
                            ? "border-villa-aqua text-villa-aqua bg-villa-aqua/10 cursor-default"
                            : providerSwitching
                              ? "border-villa-dim/40 text-villa-dim cursor-wait"
                              : "border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua",
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                {providerState.override === null && (
                  <p className="text-[9px] text-villa-dim/50 mt-1">
                    using env default — click another provider to override
                  </p>
                )}
              </div>
            )}

            <div className="border-t border-villa-dim/20 pt-4">
              <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                start a new villa
              </label>
              <p className="text-[9px] text-villa-dim/60 mb-2 leading-relaxed">
                your current villa stays saved on the server under its key —
                this just gives you a fresh uuid and a clean cast.
              </p>
              <button
                onClick={() => setPendingNewSession(true)}
                disabled={loading || isGenerating}
                className={clsx(
                  "px-3 py-1.5 text-[10px] uppercase border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-sun",
                  isGenerating || loading
                    ? "border-villa-dim/40 text-villa-dim cursor-not-allowed"
                    : "border-villa-sun text-villa-sun hover:bg-villa-sun hover:text-villa-bg cursor-pointer",
                )}
                aria-label="Start a new villa with a fresh session key"
              >
                {isGenerating
                  ? "wait — scene generating..."
                  : "start new villa"}
              </button>
            </div>

            {recent.length > 0 && (
              <div className="border-t border-villa-dim/20 pt-4">
                <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-2">
                  recent sessions
                </label>
                <ul className="space-y-1">
                  {recent.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-2 bg-villa-bg border border-villa-dim/20 px-2 py-1.5"
                    >
                      <button
                        onClick={() => promptLoad(entry.id)}
                        className="flex-1 text-left min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
                        aria-label={`Load session ${entry.label ?? shortId(entry.id)} from ${formatRelative(entry.lastUsedAt)}`}
                      >
                        <div className="text-xs text-villa-pink hover:text-villa-aqua truncate">
                          {entry.label ?? shortId(entry.id)}
                        </div>
                        {entry.label && (
                          <div className="text-[9px] font-mono text-villa-dim/50 truncate">
                            {shortId(entry.id)}
                          </div>
                        )}
                      </button>
                      <span className="text-[9px] text-villa-dim/60 shrink-0">
                        {formatRelative(entry.lastUsedAt)}
                      </span>
                      <button
                        onClick={() => handleForget(entry.id)}
                        className="text-[10px] text-villa-dim hover:text-villa-love px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-love"
                        aria-label={`Forget session ${shortId(entry.id)}`}
                      >
                        [×]
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-villa-dim/20 pt-4">
              <label className="text-[10px] uppercase tracking-widest text-villa-dim block mb-1">
                load existing session
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputId}
                  onChange={(e) => {
                    setInputId(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") promptLoad(inputId);
                  }}
                  placeholder="paste session key..."
                  className="flex-1 bg-villa-bg border border-villa-dim/30 px-2 py-1.5 text-xs font-mono text-villa-pink placeholder:text-villa-dim/30 outline-none focus:border-villa-pink/60"
                  aria-label="Session ID to load"
                />
                <button
                  onClick={() => promptLoad(inputId)}
                  disabled={loading || !inputId.trim()}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] uppercase border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink",
                    loading
                      ? "border-villa-dim/40 text-villa-dim cursor-wait"
                      : "border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg cursor-pointer",
                  )}
                >
                  {loading ? "loading..." : "load"}
                </button>
              </div>
              {error && (
                <p className="text-[10px] text-villa-love mt-1" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingLoadId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-load-title"
        >
          <div className="bg-villa-bg-2 border-2 border-villa-pink w-full max-w-sm">
            <div className="p-4 space-y-3">
              <h2
                id="confirm-load-title"
                className="text-[10px] uppercase tracking-widest text-villa-pink"
              >
                load this session?
              </h2>
              <p className="text-xs text-villa-aqua font-mono break-all">
                {pendingLoadId}
              </p>
              <p className="text-[10px] text-villa-dim/80 leading-relaxed">
                your current villa ({shortId(currentId)}) stays saved and
                reachable by key — this just switches you over to the chosen
                one.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  ref={confirmCancelRef}
                  onClick={cancelLoad}
                  disabled={loading}
                  className="px-3 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-aqua"
                >
                  cancel
                </button>
                <button
                  onClick={confirmLoad}
                  disabled={loading}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] uppercase border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink",
                    loading
                      ? "border-villa-dim/40 text-villa-dim cursor-wait"
                      : "border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg",
                  )}
                >
                  {loading ? "loading..." : "switch"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingNewSession && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-new-title"
        >
          <div className="bg-villa-bg-2 border-2 border-villa-sun w-full max-w-sm">
            <div className="p-4 space-y-3">
              <h2
                id="confirm-new-title"
                className="text-[10px] uppercase tracking-widest text-villa-sun"
              >
                start a new villa?
              </h2>
              <p className="text-[10px] text-villa-dim/80 leading-relaxed">
                your current villa ({shortId(currentId)}) will be archived to
                the server under its current key — you can reload it any time by
                pasting that key. this starts a fresh villa with a new cast and
                a new session uuid.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  ref={confirmCancelRef}
                  onClick={() => setPendingNewSession(false)}
                  disabled={loading}
                  className="px-3 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-aqua"
                >
                  cancel
                </button>
                <button
                  onClick={confirmNewSession}
                  disabled={loading}
                  className={clsx(
                    "px-3 py-1.5 text-[10px] uppercase border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-sun",
                    loading
                      ? "border-villa-dim/40 text-villa-dim cursor-wait"
                      : "border-villa-sun text-villa-sun hover:bg-villa-sun hover:text-villa-bg",
                  )}
                >
                  {loading ? "starting..." : "start new villa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
