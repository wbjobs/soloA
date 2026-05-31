import json
import random
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from app.services.chemistry_service import (
    ATOM_COLORS,
    ATOM_RADII,
    DEFAULT_ATOM_COLOR,
    DEFAULT_ATOM_RADIUS,
    parse_smiles,
)


PREDEFINED_DOCKING_RESULTS = {
    "aspirin_cox2": {
        "name": "Aspirin-COX-2 Docking",
        "description": "Aspirin binding to Cyclooxygenase-2 active site",
        "protein_name": "Cyclooxygenase-2 (COX-2)",
        "protein_pdb_id": "6COX",
        "ligand_smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
        "ligand_name": "Aspirin",
        "binding_affinity": -8.5,
        "rmsd": 1.2,
        "score": -12.3,
    },
    "ibuprofen_cox2": {
        "name": "Ibuprofen-COX-2 Docking",
        "description": "Ibuprofen binding to Cyclooxygenase-2",
        "protein_name": "Cyclooxygenase-2 (COX-2)",
        "protein_pdb_id": "6COX",
        "ligand_smiles": "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
        "ligand_name": "Ibuprofen",
        "binding_affinity": -9.2,
        "rmsd": 0.8,
        "score": -14.1,
    },
    "paracetamol_cox2": {
        "name": "Paracetamol-COX-2 Docking",
        "description": "Paracetamol binding to Cyclooxygenase-2",
        "protein_name": "Cyclooxygenase-2 (COX-2)",
        "protein_pdb_id": "6COX",
        "ligand_smiles": "CC(=O)NC1=CC=C(O)C=C1",
        "ligand_name": "Paracetamol",
        "binding_affinity": -7.8,
        "rmsd": 1.5,
        "score": -10.5,
    },
    "caffeine_adenosine": {
        "name": "Caffeine-Adenosine Receptor Docking",
        "description": "Caffeine binding to Adenosine A2A receptor",
        "protein_name": "Adenosine A2A Receptor",
        "protein_pdb_id": "4EIY",
        "ligand_smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
        "ligand_name": "Caffeine",
        "binding_affinity": -10.1,
        "rmsd": 0.5,
        "score": -16.8,
    },
}


def _generate_protein_pocket(pocket_center: Tuple[float, float, float] = (0, 0, 0), size: float = 10.0) -> Dict[str, Any]:
    atoms = []
    residue_names = ["SER", "THR", "TYR", "ASN", "GLN", "ASP", "GLU", "LYS", "ARG", "HIS", "ALA", "VAL", "LEU", "ILE", "PRO", "PHE", "TRP", "MET", "CYS", "GLY"]

    random.seed(42)
    np.random.seed(42)

    num_residues = 25
    atoms_per_residue = 8

    for res_idx in range(num_residues):
        res_name = random.choice(residue_names)
        theta = np.random.uniform(0, 2 * np.pi)
        phi = np.random.uniform(0, np.pi)
        r = np.random.uniform(size * 0.3, size * 0.9)

        base_x = pocket_center[0] + r * np.sin(phi) * np.cos(theta)
        base_y = pocket_center[1] + r * np.sin(phi) * np.sin(theta)
        base_z = pocket_center[2] + r * np.cos(phi)

        for atom_idx in range(atoms_per_residue):
            element = random.choice(["C", "C", "C", "N", "O", "C", "S", "N"])

            if element == "H":
                continue

            offset = np.random.normal(0, 0.6, 3)

            atom_idx_global = res_idx * atoms_per_residue + atom_idx

            atoms.append({
                "index": atom_idx_global,
                "symbol": element,
                "x": base_x + offset[0],
                "y": base_y + offset[1],
                "z": base_z + offset[2],
                "color": ATOM_COLORS.get(element, DEFAULT_ATOM_COLOR),
                "radius": ATOM_RADII.get(element, DEFAULT_ATOM_RADIUS) * 0.8,
                "residue": res_name,
                "residue_index": res_idx,
                "chain": "A",
            })

    return {
        "atoms": atoms,
        "center": pocket_center,
        "size": size,
    }


def _generate_interactions(
    ligand_atoms: List[Dict[str, Any]],
    protein_atoms: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    hydrogen_bonds = []
    hydrophobic = []
    pi_interactions = []
    salt_bridges = []

    random.seed(123)

    for lig_atom in ligand_atoms:
        lig_symbol = lig_atom["symbol"]

        for prot_atom in protein_atoms:
            prot_symbol = prot_atom["symbol"]

            dx = lig_atom["x"] - prot_atom["x"]
            dy = lig_atom["y"] - prot_atom["y"]
            dz = lig_atom["z"] - prot_atom["z"]
            distance = np.sqrt(dx * dx + dy * dy + dz * dz)

            if lig_symbol in ["N", "O"] and prot_symbol in ["N", "O"] and distance < 3.5:
                if random.random() < 0.3:
                    hydrogen_bonds.append({
                        "donor_atom_index": lig_atom["index"],
                        "acceptor_atom_index": prot_atom["index"],
                        "donor_symbol": lig_symbol,
                        "acceptor_symbol": prot_symbol,
                        "distance": round(distance, 2),
                        "type": "hydrogen_bond",
                    })

            if lig_symbol in ["C"] and prot_symbol in ["C"] and distance < 4.0:
                if random.random() < 0.15:
                    hydrophobic.append({
                        "ligand_atom_index": lig_atom["index"],
                        "protein_atom_index": prot_atom["index"],
                        "distance": round(distance, 2),
                        "type": "hydrophobic",
                    })

            if lig_symbol in ["C"] and prot_symbol in ["C"] and distance < 5.0:
                if random.random() < 0.05:
                    pi_interactions.append({
                        "ligand_atom_index": lig_atom["index"],
                        "protein_atom_index": prot_atom["index"],
                        "distance": round(distance, 2),
                        "type": "pi_stacking",
                    })

            if (lig_symbol in ["N", "O"] and lig_atom.get("charge", 0) != 0) and \
               (prot_symbol in ["N", "O"] and prot_atom.get("charge", 0) != 0):
                if distance < 4.0 and random.random() < 0.4:
                    salt_bridges.append({
                        "ligand_atom_index": lig_atom["index"],
                        "protein_atom_index": prot_atom["index"],
                        "distance": round(distance, 2),
                        "type": "salt_bridge",
                    })

    return {
        "hydrogen_bonds": hydrogen_bonds[:8],
        "hydrophobic_interactions": hydrophobic[:12],
        "pi_interactions": pi_interactions[:4],
        "salt_bridges": salt_bridges[:3],
    }


def generate_docking_result(
    ligand_smiles: str,
    protein_name: str = "Target Protein",
    protein_pdb_id: Optional[str] = None,
    name: Optional[str] = None,
) -> Dict[str, Any]:
    ligand_data = parse_smiles(ligand_smiles, include_hs=False)

    pocket_center = (0.0, 0.0, 0.0)
    pocket_size = 12.0

    protein_data = _generate_protein_pocket(pocket_center, pocket_size)

    center_lig_x = np.mean([a["x"] for a in ligand_data["atoms"]])
    center_lig_y = np.mean([a["y"] for a in ligand_data["atoms"]])
    center_lig_z = np.mean([a["z"] for a in ligand_data["atoms"]])

    for atom in ligand_data["atoms"]:
        atom["x"] -= center_lig_x
        atom["y"] -= center_lig_y
        atom["z"] -= center_lig_z

    interactions = _generate_interactions(ligand_data["atoms"], protein_data["atoms"])

    base_affinity = random.uniform(-11.0, -6.0)
    base_score = base_affinity * 1.5 - random.uniform(0, 2)

    result = {
        "name": name or f"Docking: {ligand_data.get('name', 'Ligand')}",
        "description": f"Generated docking result for {ligand_smiles}",
        "protein_name": protein_name,
        "protein_pdb_id": protein_pdb_id,
        "ligand_smiles": ligand_smiles,
        "ligand_name": ligand_data.get("name", "Ligand"),
        "binding_affinity": round(base_affinity, 2),
        "rmsd": round(random.uniform(0.3, 2.5), 2),
        "score": round(base_score, 2),
        "protein_coords": protein_data,
        "ligand_coords": {
            "atoms": ligand_data["atoms"],
            "bonds": ligand_data["bonds"],
        },
        "pocket_center": list(pocket_center),
        "pocket_size": pocket_size,
        **interactions,
    }

    return result


def get_predefined_docking(docking_id: str) -> Dict[str, Any]:
    if docking_id not in PREDEFINED_DOCKING_RESULTS:
        raise ValueError(f"Unknown docking result: {docking_id}")

    preset = PREDEFINED_DOCKING_RESULTS[docking_id]
    result = generate_docking_result(
        ligand_smiles=preset["ligand_smiles"],
        protein_name=preset["protein_name"],
        protein_pdb_id=preset["protein_pdb_id"],
        name=preset["name"],
    )

    result["binding_affinity"] = preset["binding_affinity"]
    result["rmsd"] = preset["rmsd"]
    result["score"] = preset["score"]
    result["description"] = preset["description"]

    return result


def list_predefined_dockings() -> List[Dict[str, Any]]:
    result = []
    for did, docking in PREDEFINED_DOCKING_RESULTS.items():
        result.append({
            "id": did,
            "name": docking["name"],
            "description": docking["description"],
            "protein_name": docking["protein_name"],
            "protein_pdb_id": docking["protein_pdb_id"],
            "ligand_name": docking["ligand_name"],
            "ligand_smiles": docking["ligand_smiles"],
            "binding_affinity": docking["binding_affinity"],
            "score": docking["score"],
        })
    return result
