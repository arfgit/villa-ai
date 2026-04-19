import clsx from "clsx";
import type { Agent, DialogueLine, Emotion, Host } from "@villa-ai/shared";
import { isLoudLine } from "@/lib/dialogueIntensity";

interface Props {
  agent: Agent | Host;
  line: DialogueLine;
  isCurrent: boolean;
  isHost?: boolean;
}

const EMOTION_EMOJI: Record<Emotion, string> = {
  happy: "😊",
  flirty: "😏",
  jealous: "😒",
  angry: "😡",
  sad: "😢",
  smug: "😎",
  anxious: "😰",
  bored: "🥱",
  shocked: "😳",
  neutral: "💬",
};

export default function ChatBubble({
  agent,
  line,
  isCurrent,
  isHost = false,
}: Props) {
  const loud = isLoudLine(line);
  // Host always wears the star-eyes avatar regardless of the LLM's emotion tag —
  // the host isn't a contestant so per-emotion faces misrepresent their role.
  const avatarEmoji = isHost ? agent.emojiFace : EMOTION_EMOJI[line.emotion];
  return (
    <div
      className={clsx(
        "flex gap-2 items-start transition-all",
        !isCurrent && "opacity-75",
      )}
    >
      <div
        className={clsx(
          "text-xs uppercase tracking-wider shrink-0 w-12 text-right pt-1.5 flex flex-col items-end",
          agent.colorClass,
        )}
      >
        <span>{agent.name}</span>
        <span className="text-sm leading-none mt-0.5">{avatarEmoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            "border px-3 py-1.5 inline-block max-w-full transition-colors",
            isHost &&
              "border-villa-sun bg-gradient-to-r from-villa-sun/15 via-villa-sun/10 to-villa-pink/15 shadow-[0_0_18px_rgba(255,179,71,0.45)] animate-villa-host-sparkle",
            !isHost &&
              loud &&
              "border-villa-love bg-villa-love/10 shadow-[0_0_16px_rgba(255,77,109,0.4)]",
            !isHost &&
              !loud &&
              isCurrent &&
              "border-villa-sun bg-villa-sun/5 shadow-[0_0_12px_rgba(255,179,71,0.15)]",
            !isHost &&
              !loud &&
              !isCurrent &&
              "border-villa-dim/40 bg-villa-bg-2/30",
            !isHost && loud && isCurrent && "animate-villa-loud",
          )}
        >
          {line.action && (
            <div
              className={clsx(
                "text-[10px] italic mb-0.5",
                isHost
                  ? "text-villa-sun"
                  : loud
                    ? "text-villa-love"
                    : "text-villa-dim",
              )}
            >
              *{line.action}*
            </div>
          )}
          <div
            className={clsx(
              "whitespace-pre-wrap break-words",
              isHost && "text-sm font-semibold text-villa-sun tracking-wide",
              !isHost &&
                loud &&
                "text-base font-bold text-villa-love tracking-wide",
              !isHost && !loud && "text-sm text-villa-ink",
            )}
          >
            {isHost && (
              <span aria-hidden="true" className="mr-1">
                ✨
              </span>
            )}
            {line.text}
            {isHost && (
              <span aria-hidden="true" className="ml-1">
                ✨
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
