import { ContactShadows, Environment, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

const BUS_MODEL_PATH = "/models/bus.glb";
const DRIVE_START_X = -11;
const DRIVE_END_X = 5;
const DRIVE_DURATION = 7.8;
const CYCLE_DURATION = 12.8;

const SCENE_THEME = {
  default: {
    background: "#90c4eb",
    fog: "#8bb6d4",
    ambientIntensity: 0.65,
    directionalIntensity: 1.15,
    hemisphereSky: "#d8ecff",
    hemisphereGround: "#72839b",
    hemisphereIntensity: 0.22,
    roadColor: "#8a878f",
    shoulderColor: "#9b98a0",
    shadowOpacity: 0.45,
    shadowColor: "#2f3748",
    environmentPreset: "sunset",
  },
  light: {
    background: "#cde8ff",
    fog: "#d8edf9",
    ambientIntensity: 1.0,
    directionalIntensity: 1.48,
    hemisphereSky: "#f9fdff",
    hemisphereGround: "#b9cce0",
    hemisphereIntensity: 0.58,
    roadColor: "#aeb5bf",
    shoulderColor: "#c4c9d1",
    shadowOpacity: 0.22,
    shadowColor: "#6e8196",
    environmentPreset: "city",
  },
};

const MOUNTAIN_BANDS = [
  {
    z: -8,
    y: 0.45,
    color: "#dae9f8",
    peaks: [
      { x: -9.8, h: 5.2, w: 3.2 },
      { x: -5.6, h: 7.4, w: 4.1 },
      { x: -1.2, h: 5.8, w: 3.5 },
      { x: 2.6, h: 6.8, w: 3.9 },
      { x: 6.9, h: 5.1, w: 3.3 },
    ],
  },
  {
    z: -5.4,
    y: 0.18,
    color: "#9ab9d8",
    peaks: [
      { x: -10.3, h: 4.6, w: 3.1 },
      { x: -6.7, h: 6.2, w: 3.6 },
      { x: -3.4, h: 5.1, w: 3.2 },
      { x: 0.8, h: 5.6, w: 3.4 },
      { x: 4.5, h: 4.9, w: 3.2 },
      { x: 8.3, h: 4.4, w: 3.0 },
    ],
  },
  {
    z: -3.2,
    y: -0.22,
    color: "#6c90b5",
    peaks: [
      { x: -9.4, h: 3.8, w: 2.8 },
      { x: -6.1, h: 4.6, w: 3.0 },
      { x: -2.5, h: 3.9, w: 2.9 },
      { x: 1.2, h: 4.4, w: 3.0 },
      { x: 5.2, h: 3.7, w: 2.8 },
      { x: 8.6, h: 3.4, w: 2.6 },
    ],
  },
];

function useBusMotion(groupRef, leftHeadlightRef, rightHeadlightRef, searchHovered) {
  useFrame((state) => {
    const bus = groupRef.current;
    if (!bus) return;

    const cycleTime = state.clock.elapsedTime % CYCLE_DURATION;
    const driving = cycleTime < DRIVE_DURATION;
    const driveProgress = driving ? THREE.MathUtils.smootherstep(cycleTime / DRIVE_DURATION, 0, 1) : 1;
    const idleSway = driving ? 0 : Math.sin((cycleTime - DRIVE_DURATION) * 2.4) * 0.08;
    const bounce = (Math.sin(state.clock.elapsedTime * 8) * 0.03) + (Math.sin(state.clock.elapsedTime * 2.6) * 0.015);

    bus.position.x = THREE.MathUtils.lerp(DRIVE_START_X, DRIVE_END_X, driveProgress) + idleSway;
    bus.position.y = 0.45 + bounce;
    bus.position.z = 0.65;
    bus.rotation.y = (-Math.PI / 2) + (driving ? 0 : Math.sin(state.clock.elapsedTime * 1.5) * 0.015);

    const headlightTarget = searchHovered
      ? 2.6 + (Math.sin(state.clock.elapsedTime * 16) * 0.7)
      : 0.75;

    if (leftHeadlightRef.current) {
      leftHeadlightRef.current.intensity = THREE.MathUtils.lerp(
        leftHeadlightRef.current.intensity,
        headlightTarget,
        0.2,
      );
    }

    if (rightHeadlightRef.current) {
      rightHeadlightRef.current.intensity = THREE.MathUtils.lerp(
        rightHeadlightRef.current.intensity,
        headlightTarget,
        0.2,
      );
    }
  });
}

function MountainRange() {
  return (
    <group>
      {MOUNTAIN_BANDS.map((band, index) => (
        <group key={`${band.z}-${index}`} position={[0, band.y, band.z]}>
          {band.peaks.map((peak) => (
            <group key={`${band.z}-${peak.x}`} position={[peak.x, 0, 0]}>
              <mesh castShadow receiveShadow position={[0, peak.h * 0.55, 0]} scale={[peak.w, peak.h, peak.w]}>
                <coneGeometry args={[0.85, 1.2, 4]} />
                <meshStandardMaterial color={band.color} flatShading />
              </mesh>
              <mesh position={[0, peak.h * 0.95, 0]} scale={[peak.w * 0.46, peak.h * 0.42, peak.w * 0.46]}>
                <coneGeometry args={[0.85, 1.2, 4]} />
                <meshStandardMaterial color="#f7fbff" flatShading />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function WindingRoad({ roadColor, shoulderColor }) {
  const { roadGeometry, shoulderGeometry } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-12, -0.72, 2.6),
      new THREE.Vector3(-8, -0.74, 2.0),
      new THREE.Vector3(-4, -0.76, 1.4),
      new THREE.Vector3(0, -0.73, 0.95),
      new THREE.Vector3(4, -0.67, 0.55),
      new THREE.Vector3(8, -0.62, 0.2),
      new THREE.Vector3(12, -0.56, -0.05),
    ]);

    return {
      roadGeometry: new THREE.TubeGeometry(curve, 200, 0.57, 16, false),
      shoulderGeometry: new THREE.TubeGeometry(curve, 200, 0.66, 14, false),
    };
  }, []);

  return (
    <group>
      <mesh geometry={shoulderGeometry} receiveShadow>
        <meshStandardMaterial color={shoulderColor} roughness={1} metalness={0.05} />
      </mesh>
      <mesh geometry={roadGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={roadColor} roughness={0.95} metalness={0.08} />
      </mesh>
    </group>
  );
}

function BusFallback({ searchHovered }) {
  const groupRef = useRef(null);
  const leftHeadlightRef = useRef(null);
  const rightHeadlightRef = useRef(null);

  useBusMotion(groupRef, leftHeadlightRef, rightHeadlightRef, searchHovered);

  return (
    <group ref={groupRef} scale={0.85}>
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[2.4, 0.8, 1]} />
        <meshStandardMaterial color="#ede7dd" roughness={0.55} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.15, 0.95, 0]}>
        <boxGeometry args={[1.6, 0.45, 0.96]} />
        <meshStandardMaterial color="#d6ebff" roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.88, 0.62, 0.5]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 20]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh castShadow receiveShadow position={[0.88, 0.62, -0.5]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 20]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.88, 0.62, 0.5]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 20]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.88, 0.62, -0.5]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 20]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      <pointLight
        ref={leftHeadlightRef}
        color="#ffe9a8"
        distance={7}
        decay={2}
        position={[1.15, 0.56, 0.24]}
        intensity={0.6}
      />
      <pointLight
        ref={rightHeadlightRef}
        color="#ffe9a8"
        distance={7}
        decay={2}
        position={[1.15, 0.56, -0.24]}
        intensity={0.6}
      />
    </group>
  );
}

function AnimatedBus({ searchHovered }) {
  const groupRef = useRef(null);
  const leftHeadlightRef = useRef(null);
  const rightHeadlightRef = useRef(null);
  const { scene } = useGLTF(BUS_MODEL_PATH);

  const model = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useBusMotion(groupRef, leftHeadlightRef, rightHeadlightRef, searchHovered);

  return (
    <group ref={groupRef} scale={0.8}>
      <primitive object={model} rotation={[0, Math.PI, 0]} />
      <pointLight
        ref={leftHeadlightRef}
        color="#ffe9a8"
        distance={9}
        decay={2}
        position={[1.4, 0.64, 0.34]}
        intensity={0.7}
      />
      <pointLight
        ref={rightHeadlightRef}
        color="#ffe9a8"
        distance={9}
        decay={2}
        position={[1.4, 0.64, -0.34]}
        intensity={0.7}
      />
    </group>
  );
}

function SceneContent({ searchHovered, lightMode }) {
  const sceneTheme = lightMode ? SCENE_THEME.light : SCENE_THEME.default;

  return (
    <>
      <color attach="background" args={[sceneTheme.background]} />
      <fog attach="fog" args={[sceneTheme.fog, 11, 30]} />

      <ambientLight intensity={sceneTheme.ambientIntensity} />
      <hemisphereLight
        color={sceneTheme.hemisphereSky}
        groundColor={sceneTheme.hemisphereGround}
        intensity={sceneTheme.hemisphereIntensity}
      />
      <directionalLight
        castShadow
        position={[6, 8, 5]}
        intensity={sceneTheme.directionalIntensity}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <MountainRange />
      <WindingRoad roadColor={sceneTheme.roadColor} shoulderColor={sceneTheme.shoulderColor} />

      <Suspense fallback={<BusFallback searchHovered={searchHovered} />}>
        <AnimatedBus searchHovered={searchHovered} />
      </Suspense>

      <ContactShadows
        position={[0, -0.78, 0.8]}
        opacity={sceneTheme.shadowOpacity}
        scale={20}
        blur={1.8}
        far={5}
        resolution={1024}
        color={sceneTheme.shadowColor}
      />

      <Environment preset={sceneTheme.environmentPreset} />
    </>
  );
}

export default function HimalayaHeroScene({ searchHovered, lightMode = false, className = "" }) {
  return (
    <div className={`absolute inset-0 z-0 ${className}`}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [-5, 2, 10], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        resize={{ scroll: false, debounce: { resize: 0, scroll: 50 } }}
      >
        <SceneContent searchHovered={searchHovered} lightMode={lightMode} />
      </Canvas>
    </div>
  );
}

useGLTF.preload(BUS_MODEL_PATH);
