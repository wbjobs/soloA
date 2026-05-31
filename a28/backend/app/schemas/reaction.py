from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from .molecule import Atom, Bond


class TransitionBonds(BaseModel):
    begin: int
    end: int
    order: float
    style: str
    type: str
    is_aromatic: bool = False

    class Config:
        from_attributes = True


class ReactionData(BaseModel):
    atoms: List[Atom]
    bonds: List[Bond]

    class Config:
        from_attributes = True


class ReactionFrame(BaseModel):
    atoms: List[Atom]

    class Config:
        from_attributes = True


class PredefinedReactionListItem(BaseModel):
    id: str
    name: str
    reaction_type: str
    equation: str
    reactant_smiles: List[str]
    product_smiles: List[str]

    class Config:
        from_attributes = True


class ReactionDetail(BaseModel):
    id: Optional[str] = None
    name: str
    reaction_type: str
    reactant_smiles: List[str]
    product_smiles: List[str]
    byproduct_smiles: Optional[List[str]] = None
    equation: Optional[str] = None
    activation_energy: Optional[float] = None
    enthalpy: Optional[float] = None
    conditions: Optional[Dict[str, Any]] = None
    reactant_coords: ReactionData
    product_coords: ReactionData
    transition_coords: Dict[str, Any]
    frames: List[ReactionFrame]
    transition_bonds: List[TransitionBonds]
    num_frames: int

    class Config:
        from_attributes = True


class CustomReactionRequest(BaseModel):
    reactant_smiles: List[str]
    product_smiles: List[str]
    name: str = "Custom Reaction"
    reaction_type: str = "custom"


class ReactionResponse(BaseModel):
    id: int
    name: str
    reaction_type: str
    reactant_smiles: List[str]
    product_smiles: List[str]
    reaction_equation: Optional[str] = None
    activation_energy: Optional[float] = None
    enthalpy: Optional[float] = None
    conditions: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
