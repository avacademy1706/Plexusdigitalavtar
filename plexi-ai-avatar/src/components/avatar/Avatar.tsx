import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { APP_CONFIG } from "../../config/environment";
import { AvatarState, type AvatarKind, type AvatarTransform, type SpeechAudioSource } from "../../types/avatar";
import { useAvatarAnimation } from "../../hooks/useAvatarAnimation";
import { useAvatarController } from "./AvatarController";
import { PlaceholderAvatar } from "./PlaceholderAvatar";
import { ImageAvatar } from "./ImageAvatar";
import { RigAvatar } from "./RigAvatar";
import type { RigManifest, SpineSkeleton } from "./rigRuntime";

const TARGET_HEIGHT = 1.75;

export const DEFAULT_TRANSFORM: AvatarTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
};

export interface AvatarProps {
  state: AvatarState;
  audio: SpeechAudioSource | null;
  reducedMotion: boolean;
  transform?: Partial<AvatarTransform>;
  modelUrl?: string;
  onLoaded?: (kind: AvatarKind) => void;
}

/** Vite's dev server answers missing files with index.html (200) - detect that as "missing". */
async function fileExists(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    return !type.includes("text/html");
  } catch {
    return false;
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

class ModelBoundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("[avatar] source failed to load, falling back", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function GlbAvatar({ url, state, audio, reducedMotion, transform, onLoaded }: Required<Pick<AvatarProps, "state" | "audio" | "reducedMotion">> & {
  url: string;
  transform: AvatarTransform;
  onLoaded?: AvatarProps["onLoaded"];
}) {
  const gltf = useGLTF(url);
  const outer = useRef<THREE.Group>(null);
  const breath = useRef<THREE.Group>(null);

  // Clone so the cached asset is reusable and skeletons are independent.
  const { scene, fit } = useMemo(() => {
    const cloned = cloneSkinned(gltf.scene) as THREE.Object3D;
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false; // skinned/morphing meshes can be wrongly culled
      }
    });
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    const center = box.getCenter(new THREE.Vector3());
    return {
      scene: cloned,
      fit: { scale, offset: new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale) },
    };
  }, [gltf.scene]);

  const { actions, names, mixer } = useAnimations(gltf.animations, outer);
  useAvatarAnimation(actions, names, state);
  useAvatarController({ root: scene, clips: gltf.animations, state, audio, reducedMotion, breathTarget: breath });

  useEffect(() => {
    if (breath.current) breath.current.userData.baseScaleY = breath.current.scale.y;
    onLoaded?.("glb");
  }, [onLoaded]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const s = fit.scale * transform.scale;
  return (
    <group ref={outer} position={transform.position} rotation={transform.rotation}>
      <group ref={breath} scale={s} position={[fit.offset.x * transform.scale, fit.offset.y * transform.scale, fit.offset.z * transform.scale]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

type Source =
  | { kind: "checking" }
  | { kind: "glb" }
  | { kind: "rig"; skeleton: SpineSkeleton; manifest: RigManifest }
  | { kind: "image" }
  | { kind: "placeholder" };

/** Priority: rigged GLB -> layered Spine-format rig -> character illustration -> built-in placeholder. */
function AvatarImpl({ state, audio, reducedMotion, transform, modelUrl = APP_CONFIG.modelUrl, onLoaded }: AvatarProps) {
  const [source, setSource] = useState<Source>({ kind: "checking" });
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      if (await fileExists(modelUrl, ctrl.signal)) return setSource({ kind: "glb" });
      const [skeleton, manifest] = await Promise.all([
        fetchJson<SpineSkeleton>(`${APP_CONFIG.rigUrl}Plexi_skeleton.json`, ctrl.signal),
        fetchJson<RigManifest>(`${APP_CONFIG.rigUrl}artwork/manifest.json`, ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      if (skeleton && manifest) return setSource({ kind: "rig", skeleton, manifest });
      const img = await fileExists(APP_CONFIG.imageUrl, ctrl.signal);
      if (!ctrl.signal.aborted) setSource({ kind: img ? "image" : "placeholder" });
    })();
    return () => ctrl.abort();
  }, [modelUrl]);

  const t = useMemo<AvatarTransform>(() => ({ ...DEFAULT_TRANSFORM, ...transform }), [transform]);
  const fail = (s: string) => setFailed((prev) => new Set(prev).add(s));

  const placeholder = <PlaceholderAvatar state={state} audio={audio} reducedMotion={reducedMotion} transform={t} onLoaded={onLoaded} />;
  const image = failed.has("image") ? placeholder : (
    <ModelBoundary fallback={placeholder} onError={() => fail("image")}>
      <ImageAvatar url={APP_CONFIG.imageUrl} state={state} audio={audio} reducedMotion={reducedMotion} transform={t} onLoaded={onLoaded} />
    </ModelBoundary>
  );

  if (source.kind === "checking") return null;
  if (source.kind === "glb" && !failed.has("glb")) {
    return (
      <ModelBoundary fallback={image} onError={() => fail("glb")}>
        <GlbAvatar url={modelUrl} state={state} audio={audio} reducedMotion={reducedMotion} transform={t} onLoaded={onLoaded} />
      </ModelBoundary>
    );
  }
  if (source.kind === "rig" && !failed.has("rig")) {
    return (
      <ModelBoundary fallback={image} onError={() => fail("rig")}>
        <RigAvatar skeleton={source.skeleton} manifest={source.manifest} baseUrl={APP_CONFIG.rigUrl} state={state} audio={audio} reducedMotion={reducedMotion} transform={t} onLoaded={onLoaded} />
      </ModelBoundary>
    );
  }
  if (source.kind === "placeholder") return placeholder;
  return image;
}

export const Avatar = memo(AvatarImpl);
