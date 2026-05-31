"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Atom as AtomType } from "@/lib/api";
import { getElementColor, getElementRadius } from "@/lib/utils";

interface AtomProps {
  atom: AtomType;
  isSelected?: boolean;
  onClick?: (atom: AtomType) => void;
  scale?: number;
}

export function Atom({ atom, isSelected = false, onClick, scale = 1 }: AtomProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const color = atom.color || getElementColor(atom.symbol);
  const radius = (atom.radius || getElementRadius(atom.symbol)) * scale;

  const displayRadius = hovered || isSelected ? radius * 1.15 : radius;

  useFrame((state, delta) => {
    if (meshRef.current && isSelected) {
      meshRef.current.rotation.y += delta * 2;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[atom.x, atom.y, atom.z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(atom);
      }}
    >
      <sphereGeometry args={[displayRadius, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : hovered ? color : "#000000"}
        emissiveIntensity={isSelected ? 0.4 : hovered ? 0.2 : 0}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}
