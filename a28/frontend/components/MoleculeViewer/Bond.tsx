"use client";

import * as THREE from "three";
import { Bond as BondType } from "@/lib/api";
import { Atom } from "@/lib/api";

interface BondProps {
  bond: BondType;
  atoms: Atom[];
  bondRadius?: number;
  showBondOrder?: boolean;
}

function getBondColor(style: string, type?: string): string {
  if (type === "breaking") return "#FF6B6B";
  if (type === "forming") return "#4ECDC4";
  if (style === "double") return "#4A90D9";
  if (style === "triple") return "#8B4513";
  if (style === "aromatic") return "#9370DB";
  return "#808080";
}

export function Bond({ bond, atoms, bondRadius = 0.08, showBondOrder = true }: BondProps) {
  const beginAtom = atoms.find((a) => a.index === bond.begin);
  const endAtom = atoms.find((a) => a.index === bond.end);

  if (!beginAtom || !endAtom) return null;

  const start = new THREE.Vector3(beginAtom.x, beginAtom.y, beginAtom.z);
  const end = new THREE.Vector3(endAtom.x, endAtom.y, endAtom.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

  const color = getBondColor(bond.style, bond.type);
  const opacity = bond.type === "breaking" ? 0.5 : bond.type === "forming" ? 0.5 : 1;

  const renderCylinder = (
    offsetX: number,
    offsetZ: number,
    radius: number,
    yOffset: number = 0,
    customOpacity?: number,
  ) => {
    const actualOpacity = customOpacity !== undefined ? customOpacity : opacity;
    const perp = direction.clone().cross(new THREE.Vector3(0, 1, 0));
    if (perp.lengthSq() < 0.01) {
      perp.cross(new THREE.Vector3(0, 0, 1));
    }
    perp.normalize();

    return (
      <mesh
        position={[
          midpoint.x + offsetX * perp.x,
          midpoint.y + yOffset * direction.y + offsetX * perp.y,
          midpoint.z + offsetX * perp.z,
        ]}
        quaternion={quaternion}
        renderOrder={bond.style === "aromatic" ? 1 : 0}
      >
        <cylinderGeometry args={[radius, radius, length, 12]} />
        <meshStandardMaterial
          color={color}
          metalness={0.5}
          roughness={0.5}
          transparent={actualOpacity < 1}
          opacity={actualOpacity}
          polygonOffset={true}
          polygonOffsetFactor={yOffset !== 0 ? 1 : 0}
          polygonOffsetUnits={1}
        />
      </mesh>
    );
  };

  if (!showBondOrder || bond.style === "single") {
    return renderCylinder(0, 0, bondRadius);
  }

  if (bond.style === "double") {
    return (
      <>
        {renderCylinder(-0.1, 0, bondRadius * 0.7)}
        {renderCylinder(0.1, 0, bondRadius * 0.7)}
      </>
    );
  }

  if (bond.style === "triple") {
    return (
      <>
        {renderCylinder(-0.15, 0, bondRadius * 0.6)}
        {renderCylinder(0, 0, bondRadius * 0.6)}
        {renderCylinder(0.15, 0, bondRadius * 0.6)}
      </>
    );
  }

  if (bond.style === "aromatic") {
    const segmentLength = 0.15;
    const gapLength = 0.1;
    const segments = Math.max(1, Math.floor(length / (segmentLength + gapLength)));
    const dashMeshes = [];

    for (let i = 0; i < segments; i++) {
      const t = (i + 0.5) / segments;
      const segmentStart = start.clone().lerp(end, t - segmentLength / length / 2);
      const segmentEnd = start.clone().lerp(end, t + segmentLength / length / 2);
      const segmentMidpoint = segmentStart.clone().lerp(segmentEnd, 0.5);
      const segmentLengthActual = segmentStart.distanceTo(segmentEnd);

      if (segmentLengthActual > 0.01) {
        dashMeshes.push(
          <mesh
            key={`dash-${i}`}
            position={segmentMidpoint}
            quaternion={quaternion}
            renderOrder={2}
          >
            <cylinderGeometry args={[bondRadius * 0.5, bondRadius * 0.5, segmentLengthActual, 8]} />
            <meshStandardMaterial
              color="#9370DB"
              metalness={0.4}
              roughness={0.6}
              polygonOffset={true}
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        );
      }
    }

    return (
      <group>
        <mesh
          position={midpoint}
          quaternion={quaternion}
          renderOrder={0}
        >
          <cylinderGeometry args={[bondRadius * 0.6, bondRadius * 0.6, length, 12]} />
          <meshStandardMaterial
            color="#E8E8E8"
            metalness={0.2}
            roughness={0.8}
          />
        </mesh>
        {dashMeshes}
      </group>
    );
  }

  return renderCylinder(0, 0, bondRadius);
}
