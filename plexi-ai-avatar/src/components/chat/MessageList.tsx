import { memo, useEffect, useRef } from "react";
import type { ChatLine } from "../../types/conversation";

interface Props {
  lines: ChatLine[];
  liveTranscript: string;
  thinking: boolean;
}

function Row({ line }: { line: ChatLine }) {
  const isUser = line.role === "user";
  return (
    <li className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isUser ? "text-softgray/70" : "text-plexus-orange"}`}>
        {isUser ? "User" : "Plexi"}
      </span>
      <p
        className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isUser ? "rounded-br-sm bg-white/10 text-white" : "rounded-bl-sm border border-white/10 bg-charcoal text-white"
        }`}
      >
        {line.text}
      </p>
    </li>
  );
}

function MessageListImpl({ lines, liveTranscript, thinking }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines, liveTranscript, thinking]);

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Conversation with Plexi">
      <ul className="flex flex-col gap-3">
        <li className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plexus-orange">Plexi</span>
          <p className="max-w-[92%] rounded-2xl rounded-bl-sm border border-white/10 bg-charcoal px-3.5 py-2 text-sm leading-relaxed">
            Hi, I'm Plexi. Your AI guide to Plexus Digitals.
          </p>
        </li>
        {lines.map((l) => (
          <Row key={l.id} line={l} />
        ))}
        {liveTranscript && !lines.some((l) => l.role === "user" && l.text === liveTranscript.trim()) && (
          <li className="flex flex-col items-end gap-1 opacity-70">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-softgray/70">User</span>
            <p className="max-w-[92%] rounded-2xl rounded-br-sm bg-white/10 px-3.5 py-2 text-sm italic">{liveTranscript}</p>
          </li>
        )}
        {thinking && (
          <li className="flex items-center gap-1 px-1 text-plexus-orange" aria-label="Plexi is thinking">
            <span className="dot size-1.5 rounded-full bg-current" />
            <span className="dot size-1.5 rounded-full bg-current" />
            <span className="dot size-1.5 rounded-full bg-current" />
          </li>
        )}
      </ul>
      <div ref={endRef} />
    </div>
  );
}

export const MessageList = memo(MessageListImpl);
