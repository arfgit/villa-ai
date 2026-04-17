import clsx from "clsx";
import { useEffect, useState } from "react";
import type { Host } from "@/types";

interface Props {
  host: Host;
  speaking?: boolean;
}

// Host silhouette. The old design put `\🎤/` directly below the emoji head,
// which read as a second chin more than a microphone. New design holds the
// mic as a side prop, keeps the regal crown row, and animates the free arm
// when the host is talking — so at a glance a viewer sees: crown → head →
// person holding a mic, clearly distinct from the cast's \o/ silhouettes.
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
        "ascii inline-block text-center text-xs leading-[1.15] transition-all duration-200",
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
      <div className="whitespace-pre tracking-wider">{`🎤╾${pose}`}</div>
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
