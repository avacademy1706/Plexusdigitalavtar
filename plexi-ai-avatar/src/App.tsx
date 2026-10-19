import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useAgent } from "./hooks/useAgent";
import { useSession } from "./hooks/useSession";
import { ChatPanel } from "./components/chat/ChatPanel";
import { LeadForm } from "./components/ui/LeadForm";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { Logo } from "./components/ui/Logo";
import { Sections } from "./components/sections/Sections";
import { analytics } from "./services/analytics";
import { createDemoSpeech } from "./services/demoSpeech";
import { AvatarState, type AvatarKind } from "./types/avatar";

// three.js + R3F load lazily so the shell paints first.
const Experience = lazy(() => import("./components/scene/Experience"));

export default function App() {
  const agent = useAgent();
  const sessionId = useSession();
  const [sceneReady, setSceneReady] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  // `?demo=speaking` previews the talking animation without a live agent connection.
  const demoSpeaking = new URLSearchParams(window.location.search).get("demo") === "speaking";
  const avatarState = demoSpeaking ? AvatarState.SPEAKING : agent.avatarState;
  const demoAudio = useMemo(() => (demoSpeaking ? createDemoSpeech() : null), [demoSpeaking]);

  const onSceneReady = useCallback((kind: AvatarKind) => {
    setSceneReady((prev) => {
      if (!prev) analytics.track("avatar_loaded", { kind });
      return true;
    });
  }, []);

  const openLead = useCallback(() => setLeadOpen(true), []);
  const closeLead = useCallback(() => setLeadOpen(false), []);

  return (
    <div data-session={sessionId} className="bg-ink">
      <main>
        <section className="relative flex h-svh min-h-[34rem] flex-col md:flex-row" aria-label="Plexi, the Plexus Digitals AI avatar">
          <header className="absolute left-0 top-0 z-20 flex w-full items-center justify-between px-4 py-4 md:px-8">
            <Logo />
            <a href="#help" className="hidden text-sm text-softgray hover:text-white sm:block">
              What can Plexi do?
            </a>
          </header>

          <div className="relative min-h-0 flex-1">
            <Suspense fallback={null}>
              <Experience state={avatarState} audio={demoAudio ?? agent.audio} onReady={onSceneReady} />
            </Suspense>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/70 to-transparent md:hidden" />
          </div>

          <div className="z-10 w-full shrink-0 md:h-full md:w-[26rem] md:p-5 md:pt-20 lg:w-[28rem]">
            <ChatPanel agent={agent} onOpenLead={openLead} />
          </div>

          <LoadingScreen visible={!sceneReady} />
        </section>

        <Sections onOpenLead={openLead} />
      </main>
      <LeadForm open={leadOpen} onClose={closeLead} />
    </div>
  );
}
