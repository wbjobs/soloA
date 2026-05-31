import { useMemo, useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HabitableZone, identifyStars, computeHabitableZone } from '../utils/habitableZone';
import { useSimulationStore } from '../store/simulationStore';


interface HabitableZoneRingProps {
  visible: boolean;
}

export function HabitableZoneRing({ visible }: HabitableZoneRingProps) {
  const ringMeshRef = useRef<THREE.Mesh>(null);
  const innerBorderRef = useRef<THREE.LineLoop>(null);
  const outerBorderRef = useRef<THREE.LineLoop>(null);
  const { currentState, viewSettings } = useSimulationStore();

  const starInfo = useMemo(() => {
    if (!currentState || !currentState.bodies) return [];
    return identifyStars(currentState.bodies);
  }, [currentState?.bodies]);

  const zones = useMemo(() => {
    return starInfo.map(star => computeHabitableZone(star));
  }, [starInfo]);

  const normalization = useMemo(() => {
    if (!currentState || !currentState.bodies) return { scale: 1, offset: [0, 0, 0] };

    const positions = currentState.bodies.map(b => [
      b.position.x, b.position.y, b.position.z
    ]);

    if (positions.length === 0) return { scale: 1, offset: [0, 0, 0] };

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const pos of positions) {
      minX = Math.min(minX, pos[0]);
      minY = Math.min(minY, pos[1]);
      minZ = Math.min(minZ, pos[2]);
      maxX = Math.max(maxX, pos[0]);
      maxY = Math.max(maxY, pos[1]);
      maxZ = Math.max(maxZ, pos[2]);
    }

    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const scale = 1 / (size * 0.5);
    const offset = [-(minX + maxX) / 2, -(minY + maxY) / 2, -(minZ + maxZ) / 2];

    return { scale, offset };
  }, [currentState?.bodies]);

  if (!visible || zones.length === 0) return null;

  const effectiveScale = normalization.scale * viewSettings.particleScale;
  const offset = normalization.offset;

  return (
    <group>
      {zones.map((zone, idx) => {
        const starBody = currentState?.bodies[idx] || {
          position: { x: 0, y: 0, z: 0 }
        };

        const starX = (starBody.position.x + offset[0]) * effectiveScale;
        const starY = (starBody.position.y + offset[1]) * effectiveScale;
        const starZ = (starBody.position.z + offset[2]) * effectiveScale;

        const innerR = zone.innerRadius * effectiveScale;
        const outerR = zone.outerRadius * effectiveScale;

        const ringGeometry = useMemo(() => {
          const geometry = new THREE.RingGeometry(
            Math.max(innerR, 0.01),
            Math.max(outerR, Math.max(innerR, 0.01) + 0.01),
            128
          );
          return geometry;
        }, [innerR, outerR]);

        const borderGeometry = useMemo(() => {
          const innerGeo = new THREE.RingGeometry(
            Math.max(innerR - 0.002, 0.001),
            Math.max(innerR + 0.002, 0.003),
            64
          );
          const outerGeo = new THREE.RingGeometry(
            Math.max(outerR - 0.002, 0.001),
            Math.max(outerR + 0.002, 0.003),
            64
          );
          return { inner: innerGeo, outer: outerGeo };
        }, [innerR, outerR]);

        const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
          color: 0x00ff88,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        }), []);

        const borderMaterial = useMemo(() => new THREE.LineBasicMaterial({
          color: 0x00ff88,
          transparent: true,
          opacity: 0.8,
          linewidth: 1
        }), []);

        return (
          <group key={`hz-${idx}`} position={[starX, starY, starZ]}>
            <mesh
              ref={ringMeshRef}
              geometry={ringGeometry}
              material={ringMaterial}
              rotation={[-Math.PI / 2, 0, 0]}
            />

            <lineLoop
              ref={innerBorderRef}
              geometry={borderGeometry.inner}
              material={borderMaterial}
              rotation={[-Math.PI / 2, 0, 0]}
            />

            <lineLoop
              ref={outerBorderRef}
              geometry={borderGeometry.outer}
              material={borderMaterial}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}


interface StarInfoDisplayProps {
  visible: boolean;
}

export function StarInfoOverlay({ visible }: StarInfoDisplayProps) {
  const { currentState } = useSimulationStore();

  const starInfo = useMemo(() => {
    if (!currentState || !currentState.bodies) return [];
    return identifyStars(currentState.bodies);
  }, [currentState?.bodies]);

  if (!visible || starInfo.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '70px',
      left: '340px',
      background: 'rgba(10, 15, 30, 0.9)',
      borderRadius: '8px',
      padding: '12px',
      border: '1px solid rgba(0, 255, 136, 0.3)',
      fontSize: '12px',
      color: '#fff',
      zIndex: 100,
      maxWidth: '280px'
    }}>
      <div style={{
        color: '#00ff88',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '13px'
      }}>
        ☀️ 恒星参数
      </div>
      {starInfo.map((star, idx) => {
        const zones = computeHabitableZone(star);
        return (
          <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontWeight: '500', marginBottom: '4px' }}>
              {star.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
              亮度: {(star.luminosity / 3.828e26).toFixed(2)} L☉
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
              温度: {star.temperature.toFixed(0)} K
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
              宜居带: {(zones.innerRadius / 1.496e11).toFixed(2)} - {(zones.outerRadius / 1.496e11).toFixed(2)} AU
            </div>
          </div>
        );
      })}
    </div>
  );
}
