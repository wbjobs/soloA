from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.schemas.molecule import SmilesParseRequest
from app.services.docking_service import (
    list_predefined_dockings,
    get_predefined_docking,
    generate_docking_result,
)
from app.services.chemistry_service import validate_smiles

router = APIRouter(prefix="/api/docking", tags=["Docking"])


@router.get("/predefined")
def list_predefined():
    return list_predefined_dockings()


@router.get("/predefined/{docking_id}")
def get_predefined(docking_id: str):
    try:
        return get_predefined_docking(docking_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/generate")
def generate_custom(request: SmilesParseRequest):
    validation = validate_smiles(request.smiles)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid SMILES"))

    try:
        result = generate_docking_result(
            ligand_smiles=request.smiles,
            protein_name="Custom Target Protein",
            name=f"Docking: Ligand",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate docking: {str(e)}")
