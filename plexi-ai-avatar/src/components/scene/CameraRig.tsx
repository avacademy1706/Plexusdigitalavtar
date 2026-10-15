import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  reducedMotion: boolean;
}

const target = new THREE.Vector3();
const desired = new THREE.Vector3();

/** Medium waist-up framing, adapted to the viewport aspect; tiny pointer parallax when motion is allowed. */
export function CameraRig({ reducedMotion }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const pointer = useThree((s) => s.pointer);
  const aspect = size.width / Math.max(1, size.height);

  useEffect(() => {
    camera.fov = 30;
    camera.near = 0.1;
    camera.far = 40;
    camera.updateProjectionMatrix();
  }, [camera]);

  // Narrow (portrait) screens need more distance to keep shoulders in frame.
  const dist = 2.4 * Math.min(1.25, Math.max(1, 0.8 / aspect));
  const lookY = 1.2;

  useFrame((_, dt) => {
    const px = reducedMotion ? 0 : pointer.x * 0.12;
    const py = reducedMotion ? 0 : pointer.y * 0.05;
    desired.set(px, lookY + 0.05 + py, dist);
    camera.position.lerp(desired, 1 - Math.exp(-3 * Math.min(dt, 0.1)));
    target.set(0, lookY, 0);
    camera.lookAt(target);
  });

  return null;
}
