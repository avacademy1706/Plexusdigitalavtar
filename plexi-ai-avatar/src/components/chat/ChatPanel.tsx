import { AlertTriangle, MicOff, PhoneOff } from "lucide-react";
import { AvatarState } from "../../types/avatar";
import type { VoiceAgent } from "../../hooks/useVoiceAgent";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { VoiceButton } from "./VoiceButton";
import { analytics } from "../../services/analytics";
import { APP_CONFIG } from "../../config/environment";

interface Props {
  agent: VoiceAgent;
  onOpenLead: () => void;
}

const statusDot: Record<AvatarState, string> = {
  IDLE: "bg-emerald-400",
  LISTENING: "bg-plexus-orange",
  THINKING: "bg-amber-300",
  SPEAKING: "bg-plexus-orange",
  ERROR: "bg-red-500",
  CONNECTING: "bg-amber-300",
};

export function ChatPanel({ agent, onOpenLead }: Props) {
  const { phase, avatarState, error, micState, micMuted } = agent;
  const active = phase === "connected" || phase === "connecting" || phase === "requesting-mic" || phase === "error";

  return (
    <section
      aria-label="Talk to Plexi"
      className="flex max-h-[50svh] min-h-0 flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink/85 backdrop-blur-xl md:max-h-none md:h-full md:rounded-3xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Plexi</h2>
          <p className="flex items-center gap-1.5 text-xs text-softgray" aria-live="polite">
            <span className={`size-1.5 rounded-full ${statusDot[avatarState]}`} aria-hidden />
            {agent.statusLabel}
          </p>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => void agent.end()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-softgray transition-colors hover:bg-white/10"
          >
            <PhoneOff className="size-3.5" aria-hidden /> End
          </button>
        )}
      </header>

      {!active ? (
        <div className="flex flex-1 flex-col justify-center gap-4 overflow-y-auto px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-plexus-orange">{APP_CONFIG.companyName}</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">Meet Plexi</h1>
          <p className="-mt-2 text-base text-white/90">Your AI Guide to Plexus Digitals</p>
          <p className="text-sm leading-relaxed text-softgray">
            Ask Plexi about AI, Digital Marketing, Automation, XR, Metaverse, or Plexus Digitals.
          </p>
          <div className="mt-1 flex flex-col gap-2.5">
            <VoiceButton
              idleLabel="Talk to Plexi"
              phase={phase}
              avatarState={avatarState}
              micMuted={micMuted}
              micAvailable={micState === "granted"}
              onStart={() => {
                analytics.track("cta_clicked", { cta: "talk_to_plexi" });
                void agent.start();
              }}
              onToggleMic={() => void agent.toggleMic()}
              onReconnect={() => void agent.reconnect()}
            />
            <a
              href={APP_CONFIG.companyUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => analytics.track("cta_clicked", { cta: "explore_plexus" })}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Explore Plexus Digitals
            </a>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error.message}</span>
            </div>
          )}
          {(micState === "denied" || micState === "unsupported") && phase !== "error" && (
            <div role="status" className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              <MicOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Microphone access is needed for voice conversations. You can still chat by typing below.</span>
            </div>
          )}
          <MessageList lines={agent.lines} liveTranscript={agent.liveTranscript} thinking={avatarState === AvatarState.THINKING} />
          <div className="flex flex-col gap-2.5 border-t border-white/10 p-3">
            <MessageInput disabled={phase !== "connected" || !agent.isReady} onSend={agent.sendText} />
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <VoiceButton
                  phase={phase}
                  avatarState={avatarState}
                  micMuted={micMuted}
                  micAvailable={micState === "granted"}
                  onStart={() => void agent.start()}
                  onToggleMic={() => void agent.toggleMic()}
                  onReconnect={() => void agent.reconnect()}
                />
              </div>
              <button
                type="button"
                onClick={onOpenLead}
                className="min-h-12 shrink-0 rounded-full border border-white/15 px-4 text-xs font-medium text-white transition-colors hover:bg-white/10"
              >
                Talk to Our Team
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
