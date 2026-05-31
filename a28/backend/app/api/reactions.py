from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas.reaction import (
    PredefinedReactionListItem,
    ReactionDetail,
    CustomReactionRequest,
)
from app.services import (
    get_predefined_reaction,
    list_predefined_reactions,
    create_reaction_from_smiles,
)

router = APIRouter(prefix="/api/reactions", tags=["Reactions"])


@router.get("/predefined", response_model=List[PredefinedReactionListItem])
def list_predefined():
    return list_predefined_reactions()


@router.get("/predefined/{reaction_id}", response_model=ReactionDetail)
def get_predefined(reaction_id: str):
    try:
        reaction = get_predefined_reaction(reaction_id)
        return ReactionDetail(**reaction)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load reaction: {str(e)}")


@router.post("/custom", response_model=ReactionDetail)
def create_custom(request: CustomReactionRequest):
    try:
        if not request.reactant_smiles or not request.product_smiles:
            raise HTTPException(
                status_code=400,
                detail="Both reactant and product SMILES are required"
            )

        reaction = create_reaction_from_smiles(
            request.reactant_smiles,
            request.product_smiles,
            name=request.name,
            reaction_type=request.reaction_type,
        )

        return ReactionDetail(**reaction)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create reaction: {str(e)}")
