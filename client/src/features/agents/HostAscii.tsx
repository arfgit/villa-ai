import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Host } from "@villa-ai/shared";

interface Props {
  host: Host;
  speaking?: boolean;
}

const IDLE_FRAMES = ["\\o/", "|o|", "/o\\"];
const TALK_FRAMES = ["\\o/", "|o_", "\\o/", "_o|"];

export default function HostAscii({ host, speaking = false }: Props) {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    const interval = speaking ? 220 : 900;
    const t = setInterval(() => setFrameIdx((i) => i + 1), interval);
    return () => clearInterval(t);
  }, [speaking]);

  const frames = speaking ? TALK_FRAMES : IDLE_FRAMES;
  const pose = frames[frameIdx % frames.length];

  return (
    <div
      className={clsx(
        "ascii inline-flex flex-col items-center text-center text-xs leading-[1.15] transition-all duration-200 relative",
        "text-villa-sun",
        speaking && "animate-villa-bounce-talk",
      )}
    >
      <div
        aria-hidden="true"
        className="text-[10px] tracking-[0.35em] text-villa-sun/80"
      >
        ♕
      </div>
      <div className="text-base leading-none">{host.emojiFace}</div>
      <div className="relative tracking-wider">
        <span
          aria-hidden="true"
          className="absolute right-full mr-1 top-0 whitespace-nowrap"
        >
          🎤╾
        </span>
        {pose}
      </div>
      <div>{"/ \\"}</div>
      <div
        aria-hidden="true"
        className="text-[10px] tracking-widest text-villa-sun/70"
      >
        ═════
      </div>
      <div className="mt-0.5 text-[9px] uppercase tracking-[0.3em] text-villa-sun">
        ★ {host.name} ★
      </div>
    </div>
  );
}
