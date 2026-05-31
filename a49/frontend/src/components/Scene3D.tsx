import { useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { StarField } from './StarField';
import { Trails } from './Trails';
import { StarBackground } from './StarBackground';
import { PostProcessing } from './PostProcessing';
import { HabitableZoneRing, StarInfoOverlay } from './HabitableZone';
import { useSimulationStore } from '../store/simulationStore';
import { BodyData, SimulationState } from '../types';

function CameraController() {
  const controlsRef = useRef<any>(null);
  const { cameraTarget, currentState } = useSimulationStore();

  useFrame(({ camera }) => {
    if (!controlsRef.current) return;

    if (cameraTarget.mode === 'free') {
      controlsRef.current.enabled = true;
    } else if (cameraTarget.mode === 'follow' && currentState) {
      controlsRef.current.enabled = false;
    }
  });

  return <OrbitControls ref={controlsRef} makeDefault />;
}

function SceneContent() {
  const { currentState, viewSettings } = useSimulationStore();

  const bodies: BodyData[] = currentState?.bodies || [];
  const history = currentState?.history || [];

  return (
    <>
      <CameraController />
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      <StarBackground count={3000} radius={100} />

      <StarField
        bodies={bodies}
        particleScale={viewSettings.particleScale}
      />

      {viewSettings.showTrails && (
        <Trails
          bodies={bodies}
          history={history}
          trailLength={viewSettings.trailLength}
          particleScale={viewSettings.particleScale}
        />
      )}

      {(viewSettings as any).showHabitableZone && (
        <HabitableZoneRing visible={true} />
      )}

      <PostProcessing
        enabled={true}
        bloomStrength={1.0}
        bloomRadius={0.4}
        bloomThreshold={0.1}
      />
    </>
  );
}

export function Scene3D() {
  const { viewSettings } = useSimulationStore();

  return (
    <>
      <Canvas
        camera={{ position: [5, 3, 5], fov: 60 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0
        }}
        style={{ background: viewSettings.background }}
      >
        <SceneContent />
      </Canvas>

      {(viewSettings as any).showHabitableZone && (
        <StarInfoOverlay visible={true} />
      )}
    </>
  );
}
