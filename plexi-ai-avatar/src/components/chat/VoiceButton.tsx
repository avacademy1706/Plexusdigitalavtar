import { Loader2, Mic, MicOff, RefreshCw } from "lucide-react";
import { AvatarState } from "../../types/avatar";
import type { ConnectionPhase } from "../../types/conversation";

interface Props {
  phase: ConnectionPhase;
  avatarState: AvatarState;
  micMuted: boolean;
  micAvailable: boolean;
  onStart: () => void;
  onToggleMic: () => void;
  onReconnect: () => void;
  /** Label shown before a conversation starts. */
  idleLabel?: string;
}

/** Prominent microphone control whose label follows the conversation state. */
export function VoiceButton({ phase, avatarState, micMuted, micAvailable, onStart, onToggleMic, onReconnect, idleLabel = "Start Conversation" }: Props) {
  let label = idleLabel;
  let action = onStart;
  let icon = <Mic className="size-5" aria-hidden />;
  let pulse = false;
  let disabled = false;

  if (phase === "error") {
    label = "Reconnect";
    action = onReconnect;
    icon = <RefreshCw className="size-5" aria-hidden />;
  } else if (phase === "requesting-mic" || phase === "connecting") {
    label = "Connecting...";
    icon = <Loader2 className="size-5 animate-spin" aria-hidden />;
    disabled = true;
  } else if (phase === "connected") {
    action = onToggleMic;
    if (avatarState === AvatarState.SPEAKING) label = "Plexi is speaking...";
    else if (avatarState === AvatarState.THINKING) label = "Thinking...";
    else if (!micAvailable || micMuted) {
      label = micAvailable ? "Mic muted - tap to talk" : "Enable microphone";
      icon = <MicOff className="size-5" aria-hidden />;
    } else {
      label = "Listening...";
      pulse = true;
    }
  }

  return (
    <button
      type="button"
      onClick={action}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-sm font-semibold transition-colors disabled:opacity-70 ${
        phase === "connected" && !pulse ? "bg-white/10 text-white hover:bg-white/15" : "bg-plexus-orange text-black hover:bg-plexus-orange-soft"
      } ${pulse ? "pulse-ring" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}
