import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BodyData } from '../types';

interface TrailsProps {
  bodies: BodyData[];
  history: number[][];
  trailLength: number;
  particleScale?: number;
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

export function Trails({ bodies, history, trailLength, particleScale = 1 }: TrailsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lineGeometries = useRef<THREE.BufferGeometry[]>([]);

  const allPositions = useMemo(() => {
    const pos: number[][] = [];
    bodies.forEach(b => pos.push([b.position.x, b.position.y, b.position.z]));
    return pos;
  }, [bodies]);

  const normalization = useMemo(() => normalizeScale(allPositions), [allPositions]);
  const { scale: normScale, offset: normOffset } = normalization;
  const effectiveScale = normScale * particleScale;

  useEffect(() => {
    if (!groupRef.current || bodies.length === 0 || history.length === 0) return;

    while (groupRef.current.children.length > 0) {
      const child = groupRef.current.children[0];
      groupRef.current.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }

    lineGeometries.current = [];

    const numBodies = bodies.length;

    for (let bodyIdx = 0; bodyIdx < numBodies; bodyIdx++) {
      const body = bodies[bodyIdx];
      if (!body) continue;

      const points: THREE.Vector3[] = [];
      const historyToUse = history.slice(-trailLength);

      historyToUse.forEach((step, stepIdx) => {
        const baseIdx = bodyIdx * 3;
        if (baseIdx + 2 < step.length) {
          const x = (step[baseIdx] + normOffset[0]) * effectiveScale;
          const y = (step[baseIdx + 1] + normOffset[1]) * effectiveScale;
          const z = (step[baseIdx + 2] + normOffset[2]) * effectiveScale;
          points.push(new THREE.Vector3(x, y, z));
        }
      });

      if (points.length < 2) continue;

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      lineGeometries.current.push(geometry);

      const positions = geometry.attributes.position.array as Float32Array;
      const colors = new Float32Array(positions.length);

      const color = new THREE.Color(body.color);

      for (let i = 0; i < points.length; i++) {
        const alpha = i / points.length;
        const col = color.clone().multiplyScalar(alpha * 0.5 + 0.1);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        linewidth: 1
      });

      const line = new THREE.Line(geometry, material);
      groupRef.current.add(line);
    }
  }, [bodies, history, trailLength, effectiveScale, normOffset]);

  return <group ref={groupRef} />;
}
