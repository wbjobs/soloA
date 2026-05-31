from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models import Molecule
from app.schemas.molecule import (
    MoleculeData,
    MoleculeCreate,
    MoleculeResponse,
    MoleculeListResponse,
    SmilesParseRequest,
    SmilesValidationResponse,
)
from app.services import parse_smiles, validate_smiles

router = APIRouter(prefix="/api/molecules", tags=["Molecules"])


@router.post("/parse", response_model=MoleculeData)
def parse_smiles_endpoint(request: SmilesParseRequest):
    try:
        result = parse_smiles(request.smiles, include_hs=request.include_hs)
        return MoleculeData(**result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse SMILES: {str(e)}")


@router.post("/validate", response_model=SmilesValidationResponse)
def validate_smiles_endpoint(request: SmilesParseRequest):
    result = validate_smiles(request.smiles)
    return SmilesValidationResponse(**result)


@router.post("/save", response_model=MoleculeResponse)
def save_molecule(molecule: MoleculeCreate, db: Session = Depends(get_db)):
    try:
        mol_data = parse_smiles(molecule.smiles, include_hs=True)

        db_mol = Molecule(
            name=molecule.name or mol_data["name"],
            smiles=mol_data["canonical_smiles"],
            molecular_formula=mol_data.get("molecular_formula"),
            molecular_weight=mol_data.get("molecular_weight"),
            description=molecule.description,
            atom_coords=mol_data["atoms"],
            bonds=mol_data["bonds"],
        )

        db.add(db_mol)
        db.commit()
        db.refresh(db_mol)

        return db_mol
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to save molecule: {str(e)}")


@router.get("/", response_model=List[MoleculeListResponse])
def list_molecules(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    molecules = db.query(Molecule).order_by(Molecule.created_at.desc()).offset(skip).limit(limit).all()
    return molecules


@router.get("/{molecule_id}", response_model=MoleculeResponse)
def get_molecule(molecule_id: int, db: Session = Depends(get_db)):
    molecule = db.query(Molecule).filter(Molecule.id == molecule_id).first()
    if not molecule:
        raise HTTPException(status_code=404, detail="Molecule not found")
    return molecule


@router.delete("/{molecule_id}")
def delete_molecule(molecule_id: int, db: Session = Depends(get_db)):
    molecule = db.query(Molecule).filter(Molecule.id == molecule_id).first()
    if not molecule:
        raise HTTPException(status_code=404, detail="Molecule not found")

    db.delete(molecule)
    db.commit()

    return {"success": True, "message": "Molecule deleted"}
