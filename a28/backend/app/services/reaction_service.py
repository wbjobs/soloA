import json
import numpy as np
from typing import Dict, Any, List, Tuple
from rdkit import Chem
from rdkit.Chem import AllChem
from .chemistry_service import (
    parse_smiles,
    ATOM_COLORS,
    ATOM_RADII,
    DEFAULT_ATOM_COLOR,
    DEFAULT_ATOM_RADIUS,
)


PREDEFINED_REACTIONS = {
    "esterification_ethanol_acetic": {
        "name": "Ethanol + Acetic Acid → Ethyl Acetate",
        "reaction_type": "esterification",
        "reactant_smiles": ["CCO", "CC(=O)O"],
        "product_smiles": ["CCOC(=O)C"],
        "byproduct_smiles": ["O"],
        "equation": "C₂H₅OH + CH₃COOH → CH₃COOC₂H₅ + H₂O",
        "activation_energy": 85.0,
        "enthalpy": -3.5,
        "conditions": {"temperature": 80, "catalyst": "H2SO4", "solvent": "Toluene"},
    },
    "esterification_methanol_acetic": {
        "name": "Methanol + Acetic Acid → Methyl Acetate",
        "reaction_type": "esterification",
        "reactant_smiles": ["CO", "CC(=O)O"],
        "product_smiles": ["CC(=O)OC"],
        "byproduct_smiles": ["O"],
        "equation": "CH₃OH + CH₃COOH → CH₃COOCH₃ + H₂O",
        "activation_energy": 75.0,
        "enthalpy": -2.8,
        "conditions": {"temperature": 70, "catalyst": "H2SO4", "solvent": "Ether"},
    },
}


def interpolate_coords(
    coords1: List[Dict[str, Any]],
    coords2: List[Dict[str, Any]],
    t: float,
) -> List[Dict[str, Any]]:
    if len(coords1) != len(coords2):
        raise ValueError("Coordinate lists must have same length for interpolation")

    interpolated = []
    for i in range(len(coords1)):
        a1 = coords1[i]
        a2 = coords2[i]

        x = a1["x"] * (1 - t) + a2["x"] * t
        y = a1["y"] * (1 - t) + a2["y"] * t
        z = a1["z"] * (1 - t) + a2["z"] * t

        interpolated.append(
            {
                "index": a1["index"],
                "symbol": a1["symbol"],
                "x": x,
                "y": y,
                "z": z,
                "color": a1.get("color", DEFAULT_ATOM_COLOR),
                "radius": a1.get("radius", DEFAULT_ATOM_RADIUS),
            }
        )

    return interpolated


def linear_interpolate(
    coords1: List[Dict[str, Any]],
    coords2: List[Dict[str, Any]],
    num_frames: int = 10,
) -> List[List[Dict[str, Any]]]:
    frames = []
    for i in range(num_frames + 1):
        t = i / num_frames
        frames.append(interpolate_coords(coords1, coords2, t))
    return frames


def combine_molecules(
    mol_data_list: List[Dict[str, Any]],
    spacing: float = 3.5,
) -> Dict[str, Any]:
    all_atoms = []
    all_bonds = []
    atom_offset = 0

    for idx, mol_data in enumerate(mol_data_list):
        dx = idx * spacing - (len(mol_data_list) - 1) * spacing / 2

        max_idx = 0
        for atom in mol_data["atoms"]:
            new_atom = atom.copy()
            new_atom["index"] = atom_offset + atom["index"]
            new_atom["x"] = atom["x"] + dx
            new_atom["molecule_idx"] = idx
            all_atoms.append(new_atom)
            max_idx = max(max_idx, atom["index"])

        for bond in mol_data["bonds"]:
            new_bond = bond.copy()
            new_bond["begin"] = atom_offset + bond["begin"]
            new_bond["end"] = atom_offset + bond["end"]
            new_bond["molecule_idx"] = idx
            all_bonds.append(new_bond)

        atom_offset += max_idx + 1

    return {
        "atoms": all_atoms,
        "bonds": all_bonds,
        "num_molecules": len(mol_data_list),
    }


def create_combination_reactant(
    reactant_smiles_list: List[str],
) -> Dict[str, Any]:
    mol_data_list = [parse_smiles(smiles, include_hs=True) for smiles in reactant_smiles_list]
    combined = combine_molecules(mol_data_list)

    return {
        "smiles": ".".join(reactant_smiles_list),
        "molecules": mol_data_list,
        "atoms": combined["atoms"],
        "bonds": combined["bonds"],
        "num_atoms": len(combined["atoms"]),
        "num_bonds": len(combined["bonds"]),
    }


def create_combination_product(
    product_smiles_list: List[str],
) -> Dict[str, Any]:
    return create_combination_reactant(product_smiles_list)


def compute_transition_state(
    reactant_data: Dict[str, Any],
    product_data: Dict[str, Any],
) -> Dict[str, Any]:
    reactant_atoms = reactant_data["atoms"]
    product_atoms = product_data["atoms"]

    min_len = min(len(reactant_atoms), len(product_atoms))
    transition_atoms = []

    for i in range(min_len):
        r_atom = reactant_atoms[i]
        p_atom = product_atoms[i]

        symbol = r_atom["symbol"]
        t_atom = {
            "index": i,
            "symbol": symbol,
            "x": (r_atom["x"] + p_atom["x"]) / 2,
            "y": (r_atom["y"] + p_atom["y"]) / 2,
            "z": (r_atom["z"] + p_atom["z"]) / 2,
            "color": ATOM_COLORS.get(symbol, DEFAULT_ATOM_COLOR),
            "radius": ATOM_RADII.get(symbol, DEFAULT_ATOM_RADIUS),
        }
        transition_atoms.append(t_atom)

    return {
        "atoms": transition_atoms,
        "bonds": [],
    }


def generate_reaction_frames(
    reactant_data: Dict[str, Any],
    product_data: Dict[str, Any],
    num_frames: int = 20,
) -> Dict[str, Any]:
    reactant_atoms = reactant_data["atoms"]
    product_atoms = product_data["atoms"]

    transition = compute_transition_state(reactant_data, product_data)

    frames_to_transition = linear_interpolate(reactant_atoms, transition["atoms"], num_frames // 2)
    frames_to_product = linear_interpolate(transition["atoms"], product_atoms, num_frames // 2)

    all_frames = frames_to_transition[:-1] + frames_to_product

    transition_bonds = []
    all_reactant_bonds = reactant_data.get("bonds", [])
    all_product_bonds = product_data.get("bonds", [])

    reactant_bond_set = {(b["begin"], b["end"]) for b in all_reactant_bonds}
    product_bond_set = {(b["begin"], b["end"]) for b in all_product_bonds}

    breaking = reactant_bond_set - product_bond_set
    forming = product_bond_set - reactant_bond_set

    for bond in all_reactant_bonds:
        key = (bond["begin"], bond["end"])
        if key in breaking:
            transition_bonds.append({**bond, "type": "breaking"})
        else:
            transition_bonds.append({**bond, "type": "maintained"})

    for bond in all_product_bonds:
        key = (bond["begin"], bond["end"])
        if key in forming:
            transition_bonds.append({**bond, "type": "forming"})

    return {
        "frames": all_frames,
        "transition_bonds": transition_bonds,
        "num_frames": len(all_frames),
        "reactant_atoms": reactant_atoms,
        "product_atoms": product_atoms,
        "transition_atoms": transition["atoms"],
    }


def create_reaction_from_smiles(
    reactant_smiles: List[str],
    product_smiles: List[str],
    name: str = "Custom Reaction",
    reaction_type: str = "custom",
) -> Dict[str, Any]:
    reactant_data = create_combination_reactant(reactant_smiles)
    product_data = create_combination_product(product_smiles)

    frames_data = generate_reaction_frames(reactant_data, product_data)

    return {
        "name": name,
        "reaction_type": reaction_type,
        "reactant_smiles": reactant_smiles,
        "product_smiles": product_smiles,
        "reactant_coords": reactant_data,
        "product_coords": product_data,
        "transition_coords": {
            "atoms": frames_data["transition_atoms"],
            "bonds": frames_data["transition_bonds"],
        },
        "frames": frames_data["frames"],
        "transition_bonds": frames_data["transition_bonds"],
        "num_frames": frames_data["num_frames"],
    }


def get_predefined_reaction(reaction_id: str) -> Dict[str, Any]:
    if reaction_id not in PREDEFINED_REACTIONS:
        raise ValueError(f"Unknown reaction: {reaction_id}")

    reaction = PREDEFINED_REACTIONS[reaction_id]
    detailed = create_reaction_from_smiles(
        reaction["reactant_smiles"],
        reaction["product_smiles"],
        name=reaction["name"],
        reaction_type=reaction["reaction_type"],
    )

    return {
        **reaction,
        **detailed,
    }


def list_predefined_reactions() -> List[Dict[str, Any]]:
    result = []
    for rid, reaction in PREDEFINED_REACTIONS.items():
        result.append(
            {
                "id": rid,
                "name": reaction["name"],
                "reaction_type": reaction["reaction_type"],
                "equation": reaction["equation"],
                "reactant_smiles": reaction["reactant_smiles"],
                "product_smiles": reaction["product_smiles"],
            }
        )
    return result
