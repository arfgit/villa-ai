import clsx from "clsx";
import type { Host } from "@/types";

interface Props {
  host: Host;
  speaking?: boolean;
}

// The host is the show's backbone — they need to read distinctly from the
// cast in the stage. The silhouette here gives them a crown row, a microphone
// in-hand, and a podium baseline so a viewer can spot the emcee at a glance
// even in a crowded scene.
export default function HostAscii({ host, speaking = false }: Props) {
  return (
    <div
      className={clsx(
        "ascii inline-block text-center text-xs leading-[1.1] transition-all duration-200",
        "text-villa-sun",
        speaking && "animate-villa-bounce-talk",
      )}
    >
      <div
        aria-hidden="true"
        className="text-[10px] tracking-widest text-villa-sun/80"
      >
        ♕ ♕ ♕
      </div>
      <div className="text-base leading-none">{host.emojiFace}</div>
      <div className="tracking-wider">{"\\🎤/"}</div>
      <div>{"/|\\"}</div>
      <div>{"/ \\"}</div>
      <div aria-hidden="true" className="text-villa-sun/80">
        ═════
      </div>
      <div className="mt-0.5 text-[8px] uppercase tracking-[0.25em] text-villa-sun">
        ★ HOST ★
      </div>
    </div>
  );
}
