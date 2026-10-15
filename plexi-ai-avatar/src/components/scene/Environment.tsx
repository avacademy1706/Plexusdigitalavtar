import { memo } from "react";
import { ContactShadows, MeshReflectorMaterial } from "@react-three/drei";
import type { QualitySettings } from "../../types/avatar";

const ORANGE = "#ff6a1a";

interface Props {
  quality: QualitySettings;
}

/** Dark premium virtual studio: reflective floor, 3-point lighting, restrained orange accents. */
function EnvironmentImpl({ quality }: Props) {
  return (
    <>
      <color attach="background" args={["#0a0a0b"]} />
      <fog attach="fog" args={["#0a0a0b", 6, 14]} />

      {/* lighting: key / fill / rim / accent */}
      <hemisphereLight args={["#cfd3da", "#0a0a0b", 0.35]} />
      <spotLight position={[2.2, 3.4, 3]} angle={0.5} penumbra={0.8} intensity={38} color="#fff4ea" castShadow={quality.shadows} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <pointLight position={[-2.6, 1.6, 2.2]} intensity={9} color="#b8c6e0" />
      <spotLight position={[0, 3, -3]} angle={0.7} penumbra={1} intensity={30} color="#ffffff" />
      <pointLight position={[2.4, 0.4, -1.6]} intensity={14} color={ORANGE} />
      <pointLight position={[-2.4, 0.4, -1.6]} intensity={5} color={ORANGE} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        {quality.reflections ? (
          <MeshReflectorMaterial
            blur={[300, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={14}
            roughness={0.9}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color="#0f0f11"
            metalness={0.6}
            mirror={0}
          />
        ) : (
          <meshStandardMaterial color="#0f0f11" roughness={0.55} metalness={0.5} />
        )}
      </mesh>
      {quality.shadows && <ContactShadows position={[0, 0.005, 0]} opacity={0.6} scale={5} blur={2.4} far={2.2} frames={1} />}

      {/* subtle geometry: a plain backdrop panel and two thin accent lines (no rings) */}
      <mesh position={[0, 2.2, -3.2]}>
        <planeGeometry args={[9, 5.5]} />
        <meshStandardMaterial color="#121214" roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[-3.6, 1.8, -3.05]}>
        <boxGeometry args={[0.02, 3.2, 0.02]} />
        <meshBasicMaterial color={ORANGE} transparent opacity={0.35} />
      </mesh>
      <mesh position={[3.6, 1.8, -3.05]}>
        <boxGeometry args={[0.02, 3.2, 0.02]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>
    </>
  );
}

export const StudioEnvironment = memo(EnvironmentImpl);
