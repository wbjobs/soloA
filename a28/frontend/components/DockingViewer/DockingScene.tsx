"use client";

import { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Atom } from "@/components/MoleculeViewer/Atom";
import { Bond } from "@/components/MoleculeViewer/Bond";
import { InteractionLine } from "./InteractionLine";
import { Atom as AtomType, Bond as BondType } from "@/lib/api";

const INTERACTION_COLORS = {
  hydrogen_bond: "#3B82F6",
  hydrophobic: "#F59E0B",
  pi_stacking: "#8B5CF6",
  salt_bridge: "#10B981",
};

interface Interaction {
  type: string;
  ligand_atom_index?: number;
  protein_atom_index?: number;
  donor_atom_index?: number;
  acceptor_atom_index?: number;
  distance?: number;
}

interface DockingSceneProps {
  proteinAtoms: AtomType[];
  ligandAtoms: AtomType[];
  ligandBonds: BondType[];
  hydrogenBonds: Interaction[];
  hydrophobicInteractions: Interaction[];
  piInteractions: Interaction[];
  saltBridges: Interaction[];
  showProtein?: boolean;
  showLigand?: boolean;
  showHydrogenBonds?: boolean;
  showHydrophobic?: boolean;
  showPiStacking?: boolean;
  showSaltBridges?: boolean;
  backgroundColor?: string;
}

export function DockingScene({
  proteinAtoms,
  ligandAtoms,
  ligandBonds,
  hydrogenBonds,
  hydrophobicInteractions,
  piInteractions,
  saltBridges,
  showProtein = true,
  showLigand = true,
  showHydrogenBonds = true,
  showHydrophobic = true,
  showPiStacking = true,
  showSaltBridges = true,
  backgroundColor = "#1e293b",
}: DockingSceneProps) {
  const [hoveredResidue, setHoveredResidue] = useState<string | null>(null);

  const proteinAtomMap = useMemo(() => {
    const map: Record<number, AtomType> = {};
    proteinAtoms.forEach((a) => {
      map[a.index] = a;
    });
    return map;
  }, [proteinAtoms]);

  const ligandAtomMap = useMemo(() => {
    const map: Record<number, AtomType> = {};
    ligandAtoms.forEach((a) => {
      map[a.index] = a;
    });
    return map;
  }, [ligandAtoms]);

  return (
    <Canvas
      camera={{ position: [10, 8, 10], fov: 50 }}
      style={{ background: backgroundColor }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -5, -5]} intensity={0.4} />
      <pointLight position={[0, 5, 0]} intensity={0.5} />

      {showProtein && (
        <group>
          {proteinAtoms.map((atom) => (
            <Atom
              key={`protein-${atom.index}`}
              atom={{
                ...atom,
                color: "#6B7280",
                radius: (atom.radius || 0.7) * 0.5,
              }}
              scale={0.6}
            />
          ))}
        </group>
      )}

      {showLigand && (
        <group>
          {ligandBonds.map((bond, i) => (
            <Bond
              key={`ligand-bond-${i}`}
              bond={bond}
              atoms={ligandAtoms}
              showBondOrder={true}
              bondRadius={0.1}
            />
          ))}
          {ligandAtoms.map((atom) => (
            <Atom
              key={`ligand-${atom.index}`}
              atom={atom}
              scale={1.2}
            />
          ))}
        </group>
      )}

      {showHydrogenBonds &&
        hydrogenBonds.map((hb, i) => {
          const ligandIdx = hb.donor_atom_index ?? hb.ligand_atom_index;
          const proteinIdx = hb.acceptor_atom_index ?? hb.protein_atom_index;
          const ligandAtom = ligandIdx !== undefined ? ligandAtomMap[ligandIdx] : undefined;
          const proteinAtom = proteinIdx !== undefined ? proteinAtomMap[proteinIdx] : undefined;

          if (!ligandAtom || !proteinAtom) return null;

          return (
            <InteractionLine
              key={`hb-${i}`}
              startX={ligandAtom.x}
              startY={ligandAtom.y}
              startZ={ligandAtom.z}
              endX={proteinAtom.x}
              endY={proteinAtom.y}
              endZ={proteinAtom.z}
              color={INTERACTION_COLORS.hydrogen_bond}
              lineWidth={0.12}
            />
          );
        })}

      {showHydrophobic &&
        hydrophobicInteractions.map((hi, i) => {
          const ligandAtom = hi.ligand_atom_index !== undefined ? ligandAtomMap[hi.ligand_atom_index] : undefined;
          const proteinAtom = hi.protein_atom_index !== undefined ? proteinAtomMap[hi.protein_atom_index] : undefined;

          if (!ligandAtom || !proteinAtom) return null;

          return (
            <InteractionLine
              key={`hydro-${i}`}
              startX={ligandAtom.x}
              startY={ligandAtom.y}
              startZ={ligandAtom.z}
              endX={proteinAtom.x}
              endY={proteinAtom.y}
              endZ={proteinAtom.z}
              color={INTERACTION_COLORS.hydrophobic}
              lineWidth={0.08}
              dashed
            />
          );
        })}

      {showPiStacking &&
        piInteractions.map((pi, i) => {
          const ligandAtom = pi.ligand_atom_index !== undefined ? ligandAtomMap[pi.ligand_atom_index] : undefined;
          const proteinAtom = pi.protein_atom_index !== undefined ? proteinAtomMap[pi.protein_atom_index] : undefined;

          if (!ligandAtom || !proteinAtom) return null;

          return (
            <InteractionLine
              key={`pi-${i}`}
              startX={ligandAtom.x}
              startY={ligandAtom.y}
              startZ={ligandAtom.z}
              endX={proteinAtom.x}
              endY={proteinAtom.y}
              endZ={proteinAtom.z}
              color={INTERACTION_COLORS.pi_stacking}
              lineWidth={0.1}
            />
          );
        })}

      {showSaltBridges &&
        saltBridges.map((sb, i) => {
          const ligandAtom = sb.ligand_atom_index !== undefined ? ligandAtomMap[sb.ligand_atom_index] : undefined;
          const proteinAtom = sb.protein_atom_index !== undefined ? proteinAtomMap[sb.protein_atom_index] : undefined;

          if (!ligandAtom || !proteinAtom) return null;

          return (
            <InteractionLine
              key={`salt-${i}`}
              startX={ligandAtom.x}
              startY={ligandAtom.y}
              startZ={ligandAtom.z}
              endX={proteinAtom.x}
              endY={proteinAtom.y}
              endZ={proteinAtom.z}
              color={INTERACTION_COLORS.salt_bridge}
              lineWidth={0.12}
            />
          );
        })}

      <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={50} />
      <Environment preset="city" />
    </Canvas>
  );
}
