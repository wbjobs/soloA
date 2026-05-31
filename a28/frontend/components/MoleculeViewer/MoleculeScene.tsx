"use client";

import { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Atom as AtomType, Bond as BondType } from "@/lib/api";
import { Atom } from "./Atom";
import { Bond } from "./Bond";

interface MoleculeSceneProps {
  atoms: AtomType[];
  bonds: BondType[];
  selectedAtomIndex?: number;
  onAtomSelect?: (atom: AtomType | null) => void;
  showHydrogens?: boolean;
  showBonds?: boolean;
  showBondOrder?: boolean;
  atomScale?: number;
  autoRotate?: boolean;
  backgroundColor?: string;
}

function SceneContent({
  atoms,
  bonds,
  selectedAtomIndex,
  onAtomSelect,
  showHydrogens = true,
  showBonds = true,
  showBondOrder = true,
  atomScale = 1,
  autoRotate = false,
}: Omit<MoleculeSceneProps, "backgroundColor">) {
  const filteredAtoms = useMemo(() => {
    if (showHydrogens) return atoms;
    return atoms.filter((a) => a.symbol !== "H");
  }, [atoms, showHydrogens]);

  const filteredBonds = useMemo(() => {
    if (showBonds) return bonds;
    return [];
  }, [bonds, showBonds]);

  const handleClick = (atom: AtomType) => {
    if (selectedAtomIndex === atom.index) {
      onAtomSelect?.(null);
    } else {
      onAtomSelect?.(atom);
    }
  };

  const handleCanvasClick = () => {
    onAtomSelect?.(null);
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.5} />

      <group onClick={handleCanvasClick}>
        {filteredBonds.map((bond, i) => (
          <Bond
            key={`bond-${i}`}
            bond={bond}
            atoms={filteredAtoms}
            showBondOrder={showBondOrder}
          />
        ))}

        {filteredAtoms.map((atom) => (
          <Atom
            key={`atom-${atom.index}`}
            atom={atom}
            isSelected={selectedAtomIndex === atom.index}
            onClick={handleClick}
            scale={atomScale}
          />
        ))}
      </group>

      <OrbitControls
        autoRotate={autoRotate}
        autoRotateSpeed={1}
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={50}
      />

      <Environment preset="city" />

      <ContactShadows
        position={[0, -5, 0]}
        opacity={0.4}
        scale={20}
        blur={2}
        far={10}
        resolution={256}
      />
    </>
  );
}

export function MoleculeScene({
  atoms,
  bonds,
  selectedAtomIndex,
  onAtomSelect,
  showHydrogens = true,
  showBonds = true,
  showBondOrder = true,
  atomScale = 1,
  autoRotate = false,
  backgroundColor = "#f8fafc",
}: MoleculeSceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [5, 5, 5], fov: 50 }}
      style={{ background: backgroundColor }}
      gl={{ antialias: true }}
    >
      <SceneContent
        atoms={atoms}
        bonds={bonds}
        selectedAtomIndex={selectedAtomIndex}
        onAtomSelect={onAtomSelect}
        showHydrogens={showHydrogens}
        showBonds={showBonds}
        showBondOrder={showBondOrder}
        atomScale={atomScale}
        autoRotate={autoRotate}
      />
    </Canvas>
  );
}
