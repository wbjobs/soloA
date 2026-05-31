import json
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, Draw
from rdkit.Chem.Draw import rdMolDraw2D

try:
    from rdkit.Chem import rdForceFieldHelpers

    HAS_FF = True
except ImportError:
    HAS_FF = False


ATOM_COLORS = {
    "H": "#FFFFFF",
    "C": "#909090",
    "N": "#3050F8",
    "O": "#FF0D0D",
    "F": "#90E050",
    "Cl": "#1FF01F",
    "Br": "#A62929",
    "I": "#940094",
    "S": "#FFFF30",
    "P": "#FF8000",
    "B": "#FFB5B5",
    "Si": "#F0C8A0",
    "Na": "#AB5CF2",
    "K": "#8F40D4",
    "Ca": "#3DFF00",
    "Fe": "#E06633",
    "Cu": "#C88033",
    "Zn": "#7D80B0",
}

ATOM_RADII = {
    "H": 0.32,
    "C": 0.77,
    "N": 0.75,
    "O": 0.73,
    "F": 0.71,
    "Cl": 0.99,
    "Br": 1.14,
    "I": 1.33,
    "S": 1.02,
    "P": 1.06,
    "B": 0.85,
    "Si": 1.11,
    "Na": 1.54,
    "K": 2.03,
    "Ca": 1.74,
    "Fe": 1.26,
    "Cu": 1.28,
    "Zn": 1.34,
}

DEFAULT_ATOM_COLOR = "#FF69B4"
DEFAULT_ATOM_RADIUS = 0.85


def smiles_to_mol(smiles: str) -> Chem.Mol:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES string: {smiles}")
    return mol


def mol_to_smiles(mol: Chem.Mol, canonical: bool = True) -> str:
    return Chem.MolToSmiles(mol, canonical=canonical)


def mol_to_inchi(mol: Chem.Mol) -> str:
    return Chem.MolToInchi(mol)


def mol_to_inchikey(mol: Chem.Mol) -> str:
    return Chem.MolToInchiKey(mol)


def generate_3d_coords(mol: Chem.Mol, max_attempts: int = 5) -> Chem.Mol:
    mol = Chem.AddHs(mol)

    num_atoms = mol.GetNumAtoms()
    if num_atoms > 1000:
        raise ValueError(f"Molecule too large: {num_atoms} atoms exceeds limit of 1000")

    success = False
    best_energy = float("inf")
    best_conf = None

    for attempt in range(max_attempts):
        mol_copy = Chem.Mol(mol)

        params = AllChem.ETKDGv3()
        params.randomSeed = attempt * 1234
        params.useSmallRingTorsions = True
        params.forceTol = 0.001
        params.numThreads = 4
        params.useMacrocycleTorsions = True
        params.pruneRmsThresh = 0.1

        if AllChem.EmbedMolecule(mol_copy, params=params) >= 0:
            try:
                if HAS_FF:
                    try:
                        result = AllChem.MMFFOptimizeMolecule(mol_copy, maxIters=1000, nonBondedThresh=100.0)
                        if result == 0:
                            success = True
                    except Exception:
                        AllChem.UFFOptimizeMolecule(mol_copy, maxIters=1000)
                        success = True
                else:
                    AllChem.UFFOptimizeMolecule(mol_copy, maxIters=1000)
                    success = True

                conf = mol_copy.GetConformer()
                energy = _calculate_ring_planarity_score(mol_copy, conf)

                if energy < best_energy:
                    best_energy = energy
                    best_conf = mol_copy

            except Exception:
                continue

    if best_conf is not None:
        return best_conf

    raise ValueError(f"Failed to generate 3D coordinates after {max_attempts} attempts")


def _calculate_ring_planarity_score(mol: Chem.Mol, conf: Chem.Conformer) -> float:
    from rdkit.Chem import rdMolTransforms
    import math

    try:
        ri = mol.GetRingInfo()
        atom_rings = ri.AtomRings()

        total_deviation = 0.0
        num_rings = 0

        for ring in atom_rings:
            if len(ring) < 3:
                continue

            coords = []
            for idx in ring:
                pos = conf.GetAtomPosition(idx)
                coords.append([pos.x, pos.y, pos.z])

            if len(coords) >= 3:
                deviation = _calculate_planarity_deviation(coords)
                total_deviation += deviation
                num_rings += 1

        if num_rings > 0:
            return total_deviation / num_rings

        return 0.0
    except Exception:
        return 0.0


def _calculate_planarity_deviation(coords: List[List[float]]) -> float:
    import numpy as np

    if len(coords) < 3:
        return 0.0

    points = np.array(coords)

    centroid = np.mean(points, axis=0)
    centered = points - centroid

    _, _, vh = np.linalg.svd(centered)
    normal = vh[2]

    deviations = np.abs(np.dot(centered, normal))
    avg_deviation = np.mean(deviations)

    return float(avg_deviation)


def extract_atom_coords(mol: Chem.Mol, include_hs: bool = True) -> List[Dict[str, Any]]:
    atoms = []
    conf = mol.GetConformer()

    for i, atom in enumerate(mol.GetAtoms()):
        symbol = atom.GetSymbol()
        coords = conf.GetAtomPosition(i)

        if symbol == "H" and not include_hs:
            continue

        atoms.append(
            {
                "index": i,
                "symbol": symbol,
                "x": float(coords.x),
                "y": float(coords.y),
                "z": float(coords.z),
                "color": ATOM_COLORS.get(symbol, DEFAULT_ATOM_COLOR),
                "radius": ATOM_RADII.get(symbol, DEFAULT_ATOM_RADIUS),
                "atomic_number": atom.GetAtomicNum(),
                "charge": int(atom.GetFormalCharge()),
            }
        )

    return atoms


def extract_bonds(mol: Chem.Mol, atoms: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    bonds = []
    atom_indices = {a["index"]: a for a in atoms}

    for bond in mol.GetBonds():
        begin_idx = bond.GetBeginAtomIdx()
        end_idx = bond.GetEndAtomIdx()

        if begin_idx not in atom_indices or end_idx not in atom_indices:
            continue

        bond_type = bond.GetBondType()
        bond_order = 1
        bond_style = "single"

        if bond_type == Chem.BondType.DOUBLE:
            bond_order = 2
            bond_style = "double"
        elif bond_type == Chem.BondType.TRIPLE:
            bond_order = 3
            bond_style = "triple"
        elif bond_type == Chem.BondType.AROMATIC:
            bond_order = 1.5
            bond_style = "aromatic"

        bonds.append(
            {
                "begin": begin_idx,
                "end": end_idx,
                "begin_atom": atom_indices[begin_idx],
                "end_atom": atom_indices[end_idx],
                "order": bond_order,
                "style": bond_style,
                "is_aromatic": bond.GetIsAromatic(),
                "is_conjugated": bond.GetIsConjugated(),
            }
        )

    return bonds


def get_molecular_formula(mol: Chem.Mol) -> str:
    return Descriptors.MolWt.__doc__ or ""
    return Chem.rdMolDescriptors.CalcMolFormula(mol)


def get_molecular_weight(mol: Chem.Mol) -> float:
    return Descriptors.MolWt(mol)


def get_molecule_name(smiles: str, mol: Chem.Mol) -> str:
    common_names = {
        "CCO": "Ethanol",
        "CC(=O)O": "Acetic Acid",
        "CCOC(=O)C": "Ethyl Acetate",
        "CC(=O)OC": "Methyl Acetate",
        "C1=CC=CC=C1": "Benzene",
        "CC1=CC=CC=C1": "Toluene",
        "O=C(O)C(CC1=CC=CC=C1)N": "Phenylalanine",
        "C1=CC=C(C=C1)N": "Aniline",
        "C1=CC=C(C=C1)O": "Phenol",
        "OC(=O)C(=O)O": "Oxalic Acid",
    }

    if smiles in common_names:
        return common_names[smiles]

    formula = get_molecular_formula(mol)
    if formula:
        return formula

    return "Molecule"


def parse_smiles(smiles: str, include_hs: bool = True) -> Dict[str, Any]:
    if len(smiles) > 10000:
        raise ValueError("SMILES string too long (max 10000 characters)")

    mol = smiles_to_mol(smiles)

    num_atoms = mol.GetNumAtoms()
    if num_atoms > 500:
        raise ValueError(f"Molecule too large: {num_atoms} atoms exceeds limit of 500")

    mol_3d = generate_3d_coords(mol)

    atoms = extract_atom_coords(mol_3d, include_hs=include_hs)
    bonds = extract_bonds(mol_3d, atoms)

    return {
        "smiles": smiles,
        "canonical_smiles": mol_to_smiles(mol),
        "name": get_molecule_name(smiles, mol),
        "molecular_formula": get_molecular_formula(mol),
        "molecular_weight": get_molecular_weight(mol),
        "num_atoms": mol.GetNumAtoms(),
        "num_bonds": mol.GetNumBonds(),
        "atoms": atoms,
        "bonds": bonds,
    }


def validate_smiles(smiles: str) -> Dict[str, Any]:
    try:
        if len(smiles) > 10000:
            return {"valid": False, "error": "SMILES string too long"}

        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return {"valid": False, "error": "Invalid SMILES string"}

        if mol.GetNumAtoms() > 500:
            return {"valid": False, "error": "Molecule too large"}

        return {"valid": True, "canonical_smiles": mol_to_smiles(mol)}
    except RecursionError:
        return {"valid": False, "error": "Recursion limit exceeded - molecule too complex"}
    except Exception as e:
        return {"valid": False, "error": str(e)}
