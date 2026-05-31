"use client";

import * as THREE from "three";
import { useMemo } from "react";

interface InteractionLineProps {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
  color: string;
  lineWidth?: number;
  dashed?: boolean;
  label?: string;
}

export function InteractionLine({
  startX,
  startY,
  startZ,
  endX,
  endY,
  endZ,
  color,
  lineWidth = 0.1,
  dashed = false,
}: InteractionLineProps) {
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

    return { midpoint, quaternion, length };
  }, [startX, startY, startZ, endX, endY, endZ]);

  return (
    <group>
      <mesh
        position={geometry.midpoint}
        quaternion={geometry.quaternion}
      >
        <cylinderGeometry args={[lineWidth * 0.4, lineWidth * 0.4, geometry.length, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[startX, startY, startZ]}>
        <sphereGeometry args={[lineWidth * 2, 16, 16]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>

      <mesh position={[endX, endY, endZ]}>
        <sphereGeometry args={[lineWidth * 2, 16, 16]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
    </group>
  );
}
