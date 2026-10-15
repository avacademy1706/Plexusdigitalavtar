import { Logo } from "./Logo";

export function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-ink transition-opacity duration-500 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Logo size={112} />
      <p className="text-sm text-softgray">Initializing Plexi...</p>
      <div className="relative h-0.5 w-40 overflow-hidden rounded bg-white/10">
        <div className="load-bar absolute inset-y-0 w-1/3 rounded bg-plexus-orange" />
      </div>
    </div>
  );
}
