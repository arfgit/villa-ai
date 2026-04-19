import { useEffect, useRef } from "react";
import type { Agent, DialogueLine, Host } from "@villa-ai/shared";
import ChatBubble from "./ChatBubble";
import { HOST } from "@/data/host";

interface Props {
  lines: DialogueLine[];
  cast: Agent[];
  currentLineIndex: number;
  host?: Host;
}

export default function ChatBubbleFeed({
  lines,
  cast,
  currentLineIndex,
  host = HOST,
}: Props) {
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [currentLineIndex, lines.length]);

  if (lines.length === 0) {
    return (
      <div className="border border-villa-dim/30 p-4 text-villa-dim text-xs italic">
        no dialogue yet, press [▶ next scene] to start
      </div>
    );
  }

  const visible = lines.slice(0, currentLineIndex + 1);

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4 space-y-2 overflow-y-auto scrollbar-thin">
      {visible.map((line, idx) => {
        const isHostLine = line.agentId === host.id;
        const speaker = isHostLine
          ? host
          : cast.find((a) => a.id === line.agentId);
        if (!speaker) return null;
        const isCurrent = idx === currentLineIndex;
        return (
          <div
            key={line.id}
            ref={isCurrent ? currentRef : undefined}
            className="animate-villa-fadein"
          >
            <ChatBubble
              agent={speaker}
              line={line}
              isCurrent={isCurrent}
              isHost={isHostLine}
            />
          </div>
        );
      })}
    </div>
  );
}
