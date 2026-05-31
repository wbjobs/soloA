from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List
import asyncio

from ..database import get_db
from ..models import Document, LayoutAnalysis, OCRResult, Entity, EntityRelation
from ..schemas import PipelineResult, ProcessingStatus
from ..services.storage_service import get_storage_service, StorageService
from ..services.image_preprocessing import get_preprocessor, ImagePreprocessor
from ..services.inpainting_service import get_inpainting_service, InpaintingService
from ..services.layout_analysis import get_layout_analyzer, LayoutAnalyzer
from ..services.ocr_service import get_ocr_service, OCRService
from ..services.knowledge_graph import get_knowledge_graph_service, KnowledgeGraphService

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/{document_id}/preprocess", response_model=ProcessingStatus)
async def preprocess_document(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    preprocessor: ImagePreprocessor = Depends(get_preprocessor),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.original_image_path:
        raise HTTPException(status_code=400, detail="No original image available")

    try:
        doc.status = "processing_preprocess"
        db.commit()

        original_bytes = storage.download_file(doc.original_image_path)

        processed_bytes, binary_bytes = preprocessor.preprocess_bytes(original_bytes)

        processed_path = f"documents/{document_id}/processed.png"
        storage.upload_file(processed_path, processed_bytes, content_type="image/png")

        doc.processed_image_path = processed_path
        doc.status = "preprocessed"
        db.commit()

        return ProcessingStatus(
            document_id=document_id,
            status="preprocessed",
            step="preprocessing",
            message="Image preprocessing completed successfully"
        )
    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {str(e)}")


@router.post("/{document_id}/inpaint", response_model=ProcessingStatus)
async def inpaint_document(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    inpainting: InpaintingService = Depends(get_inpainting_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    source_path = doc.processed_image_path or doc.original_image_path
    if not source_path:
        raise HTTPException(status_code=400, detail="No image available for inpainting")

    try:
        doc.status = "processing_inpaint"
        db.commit()

        image_bytes = storage.download_file(source_path)

        inpainted_bytes, mask_bytes = inpainting.inpaint_bytes(image_bytes)

        inpainted_path = f"documents/{document_id}/inpainted.png"
        storage.upload_file(inpainted_path, inpainted_bytes, content_type="image/png")

        doc.inpainted_image_path = inpainted_path
        doc.status = "inpainted"
        db.commit()

        return ProcessingStatus(
            document_id=document_id,
            status="inpainted",
            step="inpainting",
            message="Inpainting completed successfully"
        )
    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Inpainting failed: {str(e)}")


@router.post("/{document_id}/analyze-layout", response_model=ProcessingStatus)
async def analyze_layout(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    analyzer: LayoutAnalyzer = Depends(get_layout_analyzer),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    source_path = doc.processed_image_path or doc.original_image_path
    if not source_path:
        raise HTTPException(status_code=400, detail="No image available for analysis")

    try:
        doc.status = "processing_layout"
        db.commit()

        for existing in doc.layout_analysis:
            db.delete(existing)
        db.commit()

        image_bytes = storage.download_file(source_path)

        layout_regions = analyzer.analyze_bytes(image_bytes)

        for region in layout_regions:
            db_region = LayoutAnalysis(
                document_id=document_id,
                region_type=region['region_type'],
                x=region['x'],
                y=region['y'],
                width=region['width'],
                height=region['height'],
                confidence=region.get('confidence', 0.5),
                is_vertical=region.get('is_vertical', False),
                metadata=region.get('metadata', {})
            )
            db.add(db_region)

        doc.status = "layout_analyzed"
        db.commit()
        db.refresh(doc)

        return ProcessingStatus(
            document_id=document_id,
            status="layout_analyzed",
            step="layout_analysis",
            message=f"Found {len(layout_regions)} regions"
        )
    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Layout analysis failed: {str(e)}")


@router.post("/{document_id}/ocr", response_model=ProcessingStatus)
async def run_ocr(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    ocr: OCRService = Depends(get_ocr_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    source_path = doc.inpainted_image_path or doc.processed_image_path or doc.original_image_path
    if not source_path:
        raise HTTPException(status_code=400, detail="No image available for OCR")

    try:
        doc.status = "processing_ocr"
        db.commit()

        for existing in doc.ocr_results:
            db.delete(existing)
        db.commit()
        db.refresh(doc)

        image_bytes = storage.download_file(source_path)

        layout_regions = []
        for region in doc.layout_analysis:
            layout_regions.append({
                'region_type': region.region_type,
                'x': region.x,
                'y': region.y,
                'width': region.width,
                'height': region.height,
                'is_vertical': region.is_vertical,
            })

        ocr_results = ocr.ocr_bytes(image_bytes, layout_regions if layout_regions else None)

        for i, result in enumerate(ocr_results):
            layout_region_id = None
            if 'layout_region_index' in result and layout_regions:
                idx = result['layout_region_index']
                if idx < len(doc.layout_analysis):
                    layout_region_id = doc.layout_analysis[idx].id

            db_ocr = OCRResult(
                document_id=document_id,
                layout_region_id=layout_region_id,
                text=result['text'],
                confidence=result.get('confidence', 0.5),
                is_vertical=result.get('is_vertical', False),
                is_corrected=False,
                metadata={'region_info': result.get('region_info', {})}
            )
            db.add(db_ocr)

        doc.status = "ocr_completed"
        db.commit()
        db.refresh(doc)

        return ProcessingStatus(
            document_id=document_id,
            status="ocr_completed",
            step="ocr",
            message=f"OCR completed with {len(ocr_results)} results"
        )
    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")


@router.post("/{document_id}/knowledge-graph", response_model=ProcessingStatus)
async def build_knowledge_graph(
    document_id: int,
    db: Session = Depends(get_db),
    kg_service: KnowledgeGraphService = Depends(get_knowledge_graph_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        doc.status = "processing_kg"
        db.commit()

        for existing in doc.entities:
            db.delete(existing)
        for existing in doc.relations:
            db.delete(existing)
        db.commit()
        db.refresh(doc)

        ocr_list = []
        for ocr in doc.ocr_results:
            ocr_list.append({'text': ocr.text})

        entities_data, relations_data = kg_service.process_ocr_results(ocr_list)

        entity_map = {}
        for ent_data in entities_data:
            db_entity = Entity(
                document_id=document_id,
                entity_type=ent_data['entity_type'],
                entity_text=ent_data['entity_text'],
                start_index=ent_data.get('start_index'),
                end_index=ent_data.get('end_index'),
                confidence=ent_data.get('confidence', 0.5),
                metadata=ent_data.get('metadata', {})
            )
            db.add(db_entity)
            db.flush()
            entity_map[ent_data['entity_text']] = db_entity.id

        db.commit()

        for rel_data in relations_data:
            source_id = entity_map.get(rel_data['source_entity'])
            target_id = entity_map.get(rel_data['target_entity'])
            
            if source_id and target_id:
                db_relation = EntityRelation(
                    document_id=document_id,
                    source_entity_id=source_id,
                    target_entity_id=target_id,
                    relation_type=rel_data['relation_type'],
                    confidence=rel_data.get('confidence', 0.5),
                    evidence_text=rel_data.get('evidence_text')
                )
                db.add(db_relation)

        doc.status = "kg_completed"
        db.commit()
        db.refresh(doc)

        return ProcessingStatus(
            document_id=document_id,
            status="kg_completed",
            step="knowledge_graph",
            message=f"Knowledge graph built: {len(entities_data)} entities, {len(relations_data)} relations"
        )
    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Knowledge graph failed: {str(e)}")


@router.post("/{document_id}/full", response_model=PipelineResult)
async def run_full_pipeline(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    preprocessor: ImagePreprocessor = Depends(get_preprocessor),
    inpainting: InpaintingService = Depends(get_inpainting_service),
    analyzer: LayoutAnalyzer = Depends(get_layout_analyzer),
    ocr: OCRService = Depends(get_ocr_service),
    kg_service: KnowledgeGraphService = Depends(get_knowledge_graph_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        doc.status = "processing"
        db.commit()

        if doc.original_image_path:
            original_bytes = storage.download_file(doc.original_image_path)

            processed_bytes, _ = preprocessor.preprocess_bytes(original_bytes)
            processed_path = f"documents/{document_id}/processed.png"
            storage.upload_file(processed_path, processed_bytes, content_type="image/png")
            doc.processed_image_path = processed_path
            db.commit()

            inpainted_bytes, _ = inpainting.inpaint_bytes(processed_bytes)
            inpainted_path = f"documents/{document_id}/inpainted.png"
            storage.upload_file(inpainted_path, inpainted_bytes, content_type="image/png")
            doc.inpainted_image_path = inpainted_path
            db.commit()

            for existing in doc.layout_analysis:
                db.delete(existing)
            db.commit()
            db.refresh(doc)

            layout_regions = analyzer.analyze_bytes(processed_bytes)
            for region in layout_regions:
                db_region = LayoutAnalysis(
                    document_id=document_id,
                    region_type=region['region_type'],
                    x=region['x'],
                    y=region['y'],
                    width=region['width'],
                    height=region['height'],
                    confidence=region.get('confidence', 0.5),
                    is_vertical=region.get('is_vertical', False),
                    metadata=region.get('metadata', {})
                )
                db.add(db_region)
            db.commit()
            db.refresh(doc)

            for existing in doc.ocr_results:
                db.delete(existing)
            db.commit()
            db.refresh(doc)

            layout_for_ocr = []
            for region in doc.layout_analysis:
                layout_for_ocr.append({
                    'region_type': region.region_type,
                    'x': region.x,
                    'y': region.y,
                    'width': region.width,
                    'height': region.height,
                    'is_vertical': region.is_vertical,
                })

            ocr_results = ocr.ocr_bytes(inpainted_bytes, layout_for_ocr if layout_for_ocr else None)
            
            for i, result in enumerate(ocr_results):
                layout_region_id = None
                if 'layout_region_index' in result and layout_for_ocr:
                    idx = result['layout_region_index']
                    if idx < len(doc.layout_analysis):
                        layout_region_id = doc.layout_analysis[idx].id

                db_ocr = OCRResult(
                    document_id=document_id,
                    layout_region_id=layout_region_id,
                    text=result['text'],
                    confidence=result.get('confidence', 0.5),
                    is_vertical=result.get('is_vertical', False),
                    is_corrected=False,
                    metadata={'region_info': result.get('region_info', {})}
                )
                db.add(db_ocr)
            db.commit()
            db.refresh(doc)

            for existing in doc.entities:
                db.delete(existing)
            for existing in doc.relations:
                db.delete(existing)
            db.commit()
            db.refresh(doc)

            ocr_list = [{'text': ocr.text} for ocr in doc.ocr_results]
            entities_data, relations_data = kg_service.process_ocr_results(ocr_list)

            entity_map = {}
            for ent_data in entities_data:
                db_entity = Entity(
                    document_id=document_id,
                    entity_type=ent_data['entity_type'],
                    entity_text=ent_data['entity_text'],
                    start_index=ent_data.get('start_index'),
                    end_index=ent_data.get('end_index'),
                    confidence=ent_data.get('confidence', 0.5),
                    metadata=ent_data.get('metadata', {})
                )
                db.add(db_entity)
                db.flush()
                entity_map[ent_data['entity_text']] = db_entity.id
            db.commit()

            for rel_data in relations_data:
                source_id = entity_map.get(rel_data['source_entity'])
                target_id = entity_map.get(rel_data['target_entity'])
                if source_id and target_id:
                    db_relation = EntityRelation(
                        document_id=document_id,
                        source_entity_id=source_id,
                        target_entity_id=target_id,
                        relation_type=rel_data['relation_type'],
                        confidence=rel_data.get('confidence', 0.5),
                        evidence_text=rel_data.get('evidence_text')
                    )
                    db.add(db_relation)

        doc.status = "completed"
        db.commit()
        db.refresh(doc)

        return PipelineResult(
            document_id=document_id,
            status="completed",
            layout_regions=len(doc.layout_analysis),
            ocr_results=len(doc.ocr_results),
            entities=len(doc.entities),
            relations=len(doc.relations),
            message="Full pipeline completed successfully"
        )

    except Exception as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")
