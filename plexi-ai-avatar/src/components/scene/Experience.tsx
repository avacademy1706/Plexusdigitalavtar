import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Avatar } from "../avatar/Avatar";
import { StudioEnvironment } from "./Environment";
import { CameraRig } from "./CameraRig";
import { useDocumentVisible, useQuality, useReducedMotion } from "../../hooks/useDevice";
import type { AvatarKind, AvatarState, SpeechAudioSource } from "../../types/avatar";

interface Props {
  state: AvatarState;
  audio: SpeechAudioSource | null;
  onReady: (kind: AvatarKind) => void;
}

/** The whole 3D scene. Default export so it can be lazy-loaded (keeps three.js out of the first paint). */
export default function Experience({ state, audio, onReady }: Props) {
  const { settings } = useQuality();
  const reducedMotion = useReducedMotion();
  const visible = useDocumentVisible();

  // Safety net: never leave the loading screen up if something stalls.
  useEffect(() => {
    const t = window.setTimeout(() => onReady("placeholder"), 6000);
    return () => window.clearTimeout(t);
  }, [onReady]);

  return (
    <Canvas
      shadows={settings.shadows}
      dpr={settings.dpr}
      frameloop={visible ? "always" : "never"}
      gl={{ antialias: settings.antialias, powerPreference: "high-performance", stencil: true }}
      camera={{ position: [0, 1.3, 2.8], fov: 30 }}
      aria-label="3D view of Plexi, the Plexus Digitals AI avatar"
      role="img"
    >
      <StudioEnvironment quality={settings} />
      <CameraRig reducedMotion={reducedMotion} />
      <Suspense fallback={null}>
        <Avatar state={state} audio={audio} reducedMotion={reducedMotion} onLoaded={onReady} />
      </Suspense>
    </Canvas>
  );
}
