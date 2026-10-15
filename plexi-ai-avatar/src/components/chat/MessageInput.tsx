import { useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

/** Enter sends, Shift+Enter inserts a new line. */
export function MessageInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="plexi-input" className="sr-only">
        Message Plexi
      </label>
      <textarea
        id="plexi-input"
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Plexi anything..."
        className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-softgray/50 focus:border-plexus-orange/60 focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-plexus-orange text-black transition-colors hover:bg-plexus-orange-soft disabled:bg-white/10 disabled:text-white/40"
      >
        <SendHorizontal className="size-5" aria-hidden />
      </button>
    </form>
  );
}
