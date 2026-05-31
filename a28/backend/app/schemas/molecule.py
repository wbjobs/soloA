from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class Atom(BaseModel):
    index: int
    symbol: str
    x: float
    y: float
    z: float
    color: str
    radius: float
    atomic_number: Optional[int] = None
    charge: Optional[int] = None
    molecule_idx: Optional[int] = None

    class Config:
        from_attributes = True


class Bond(BaseModel):
    begin: int
    end: int
    order: float
    style: str
    is_aromatic: bool = False
    is_conjugated: bool = False
    type: Optional[str] = None
    molecule_idx: Optional[int] = None

    class Config:
        from_attributes = True


class MoleculeData(BaseModel):
    smiles: str
    canonical_smiles: str
    name: str
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    num_atoms: int
    num_bonds: int
    atoms: List[Atom]
    bonds: List[Bond]

    class Config:
        from_attributes = True


class MoleculeCreate(BaseModel):
    name: str
    smiles: str
    description: Optional[str] = None


class MoleculeResponse(BaseModel):
    id: int
    name: str
    smiles: str
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    description: Optional[str] = None
    atom_coords: List[Atom] = Field(alias="atoms")
    bonds: List[Bond]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


class SmilesParseRequest(BaseModel):
    smiles: str
    include_hs: bool = True


class SmilesValidationResponse(BaseModel):
    valid: bool
    canonical_smiles: Optional[str] = None
    error: Optional[str] = None

    class Config:
        from_attributes = True


class MoleculeListResponse(BaseModel):
    id: int
    name: str
    smiles: str
    molecular_formula: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
