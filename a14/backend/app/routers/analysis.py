from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from .. import crud, schemas
from ..services.parser_service import load_universe
from ..services.analysis_service import calculate_rmsd, calculate_rmsf, calculate_rdf

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/rmsd/{file_id}")
def run_rmsd_analysis(
    file_id: int,
    start: int = Query(0, ge=0),
    stop: Optional[int] = Query(None),
    step: int = Query(1, ge=1),
    selection: str = Query("backbone"),
    reference_selection: Optional[str] = Query(None),
    save: bool = Query(True),
    project_id: Optional[int] = Query(None),
    name: str = Query("RMSD Analysis"),
    db: Session = Depends(get_db)
):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        
        result = calculate_rmsd(
            universe=universe,
            start=start,
            stop=stop,
            step=step,
            selection=selection,
            reference_selection=reference_selection
        )
        
        if save and project_id:
            config = {
                'start': start,
                'stop': stop,
                'step': step,
                'selection': selection,
                'reference_selection': reference_selection,
                'file_id': file_id
            }
            db_result = crud.create_analysis_result(
                db=db,
                project_id=project_id,
                data=schemas.AnalysisResultCreate(
                    analysis_type='rmsd',
                    name=name,
                    config=config,
                    result_data=result
                )
            )
            return {"saved": True, "result_id": db_result.id, "data": result}
        
        return {"saved": False, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RMSD analysis failed: {str(e)}")


@router.post("/rmsf/{file_id}")
def run_rmsf_analysis(
    file_id: int,
    start: int = Query(0, ge=0),
    stop: Optional[int] = Query(None),
    step: int = Query(1, ge=1),
    selection: str = Query("name CA"),
    save: bool = Query(True),
    project_id: Optional[int] = Query(None),
    name: str = Query("RMSF Analysis"),
    db: Session = Depends(get_db)
):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        
        result = calculate_rmsf(
            universe=universe,
            start=start,
            stop=stop,
            step=step,
            selection=selection
        )
        
        if save and project_id:
            config = {
                'start': start,
                'stop': stop,
                'step': step,
                'selection': selection,
                'file_id': file_id
            }
            db_result = crud.create_analysis_result(
                db=db,
                project_id=project_id,
                data=schemas.AnalysisResultCreate(
                    analysis_type='rmsf',
                    name=name,
                    config=config,
                    result_data=result
                )
            )
            return {"saved": True, "result_id": db_result.id, "data": result}
        
        return {"saved": False, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RMSF analysis failed: {str(e)}")


@router.post("/rdf/{file_id}")
def run_rdf_analysis(
    file_id: int,
    start: int = Query(0, ge=0),
    stop: Optional[int] = Query(None),
    step: int = Query(1, ge=1),
    nbins: int = Query(75, ge=1),
    range_start: float = Query(0.0),
    range_end: float = Query(15.0),
    g1: str = Query("name O"),
    g2: str = Query("name O"),
    save: bool = Query(True),
    project_id: Optional[int] = Query(None),
    name: str = Query("RDF Analysis"),
    db: Session = Depends(get_db)
):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        
        result = calculate_rdf(
            universe=universe,
            g1=g1,
            g2=g2,
            start=start,
            stop=stop,
            step=step,
            nbins=nbins,
            range_start=range_start,
            range_end=range_end
        )
        
        if save and project_id:
            config = {
                'start': start,
                'stop': stop,
                'step': step,
                'nbins': nbins,
                'range_start': range_start,
                'range_end': range_end,
                'g1': g1,
                'g2': g2,
                'file_id': file_id
            }
            db_result = crud.create_analysis_result(
                db=db,
                project_id=project_id,
                data=schemas.AnalysisResultCreate(
                    analysis_type='rdf',
                    name=name,
                    config=config,
                    result_data=result
                )
            )
            return {"saved": True, "result_id": db_result.id, "data": result}
        
        return {"saved": False, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RDF analysis failed: {str(e)}")


@router.get("/result/{result_id}")
def get_analysis_result(result_id: int, db: Session = Depends(get_db)):
    db_result = crud.get_analysis_result(db, result_id=result_id)
    if db_result is None:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    return db_result


@router.delete("/result/{result_id}")
def delete_analysis_result(result_id: int, db: Session = Depends(get_db)):
    success = crud.delete_analysis_result(db, result_id=result_id)
    if not success:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    return {"message": "Analysis result deleted successfully"}
