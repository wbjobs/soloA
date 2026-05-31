import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BodyData } from '../types';
import { useSimulationStore } from '../store/simulationStore';

interface StarFieldProps {
  bodies: BodyData[];
  particleScale?: number;
}

function hexToRgb(hex: string): THREE.Color {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return new THREE.Color(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }
  return new THREE.Color(0xffffff);
}

function normalizeScale(positions: number[][]): { scale: number; offset: number[] } {
  if (positions.length === 0) return { scale: 1, offset: [0, 0, 0] };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const pos of positions) {
    if (pos.length >= 3) {
      minX = Math.min(minX, pos[0]);
      minY = Math.min(minY, pos[1]);
      minZ = Math.min(minZ, pos[2]);
      maxX = Math.max(maxX, pos[0]);
      maxY = Math.max(maxY, pos[1]);
      maxZ = Math.max(maxZ, pos[2]);
    }
  }

  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const scale = 1 / (size * 0.5);
  const offset = [
    -(minX + maxX) / 2,
    -(minY + maxY) / 2,
    -(minZ + maxZ) / 2
  ];

  return { scale, offset };
}

export function StarField({ bodies, particleScale = 1 }: StarFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const normalization = useMemo(() => {
    const positions = bodies.map(b => [b.position.x, b.position.y, b.position.z]);
    return normalizeScale(positions);
  }, [bodies]);

  const { cameraTarget, currentState } = useSimulationStore();

  const { scale: normScale, offset: normOffset } = normalization;
  const effectiveScale = normScale * particleScale;

  useEffect(() => {
    if (!meshRef.current || bodies.length === 0) return;

    const mesh = meshRef.current;
    const count = Math.min(bodies.length, mesh.count);

    for (let i = 0; i < count; i++) {
      const body = bodies[i];
      if (!body) continue;

      const x = (body.position.x + normOffset[0]) * effectiveScale;
      const y = (body.position.y + normOffset[1]) * effectiveScale;
      const z = (body.position.z + normOffset[2]) * effectiveScale;

      dummy.position.set(x, y, z);
      const baseRadius = Math.max(0.01, Math.log10(body.mass + 1) * 0.005) * effectiveScale;
      const radius = Math.max(0.005, baseRadius * particleScale);
      dummy.scale.set(radius, radius, radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const color = hexToRgb(body.color);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bodies, effectiveScale, normOffset, particleScale]);

  useFrame(() => {
    if (cameraTarget.mode === 'follow' && bodies.length > 0 && currentState) {
      const followIdx = cameraTarget.followBodyIndex;
      if (followIdx >= 0 && followIdx < bodies.length) {
        const body = bodies[followIdx];
        const x = (body.position.x + normOffset[0]) * effectiveScale;
        const y = (body.position.y + normOffset[1]) * effectiveScale;
        const z = (body.position.z + normOffset[2]) * effectiveScale;

        const targetPos = new THREE.Vector3(x, y, z);
        camera.position.lerp(targetPos.clone().add(new THREE.Vector3(2, 1, 2)), 0.05);
        camera.lookAt(targetPos);
      }
    }
  });

  if (bodies.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(bodies.length, 1)]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
