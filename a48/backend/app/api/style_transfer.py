from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import base64

from ..database import get_db
from ..models import Document, OCRResult, StyleTransferLog
from ..schemas import (
    StyleTransferRequest,
    StyleTransferResponse,
    StyleInfo,
)
from ..services.style_transfer import get_style_transfer_service, StyleTransferService
from ..services.storage_service import get_storage_service, StorageService

router = APIRouter(prefix="/api/style-transfer", tags=["style-transfer"])


AVAILABLE_STYLES = [
    StyleInfo(
        key="kaishu",
        name="楷书",
        description="标准楷书，工整规范，适合古籍正式文本"
    ),
    StyleInfo(
        key="xingshu",
        name="行书",
        description="行书风格，连笔流畅，具有一定的书写速度"
    ),
    StyleInfo(
        key="caoshu",
        name="草书",
        description="草书风格，笔画简约，艺术性强"
    ),
    StyleInfo(
        key="songti_gu",
        name="古宋体",
        description="古宋体风格，有刻本特色，适合复刻古籍"
    ),
    StyleInfo(
        key="weibei",
        name="魏碑",
        description="魏碑风格，方笔厚重，古朴有力"
    ),
]


@router.get("/styles", response_model=List[StyleInfo])
async def get_available_styles():
    return AVAILABLE_STYLES


@router.post("/transfer", response_model=StyleTransferResponse)
async def transfer_text_style(
    request: StyleTransferRequest,
    style_service: StyleTransferService = Depends(get_style_transfer_service),
):
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")

    if request.style_name not in [s.key for s in AVAILABLE_STYLES]:
        raise HTTPException(status_code=400, detail=f"Invalid style: {request.style_name}")

    result = style_service.transfer_style(
        text=request.text,
        target_style=request.style_name,
        strength=request.strength
    )

    has_image = False
    if request.generate_image:
        try:
            import cv2
            import numpy as np

            styled_img = style_service._apply_style_transform(
                text=request.text,
                style_params=style_service.STYLE_PARAMETERS.get(request.style_name, {}),
                strength=request.strength,
                font_size=request.font_size
            )

            if styled_img is not None:
                has_image = True
        except Exception:
            pass

    return StyleTransferResponse(
        original_text=result['original_text'],
        styled_text=result['styled_text'],
        style_name=result['style_name'],
        transfer_strength=result['transfer_strength'],
        has_image=has_image,
        metadata={
            'style_characteristics': result.get('transformations', []),
            'style_preservation': result.get('style_preservation', 0.0),
            'has_image': has_image
        }
    )


@router.post("/transfer/image")
async def transfer_text_style_with_image(
    text: str = Form(...),
    style_name: str = Form("kaishu"),
    strength: float = Form(0.7),
    font_size: int = Form(48),
    style_service: StyleTransferService = Depends(get_style_transfer_service),
):
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    if style_name not in [s.key for s in AVAILABLE_STYLES]:
        raise HTTPException(status_code=400, detail=f"Invalid style: {style_name}")

    styled_img = style_service._apply_style_transform(
        text=text,
        style_params=style_service.STYLE_PARAMETERS.get(style_name, {}),
        strength=strength,
        font_size=font_size
    )

    if styled_img is None:
        raise HTTPException(status_code=500, detail="Failed to generate styled image")

    import cv2
    import numpy as np

    success, encoded = cv2.imencode('.png', styled_img)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to encode image")

    image_bytes = encoded.tobytes()
    base64_image = base64.b64encode(image_bytes).decode('utf-8')

    result = style_service.transfer_style(
        text=text,
        target_style=style_name,
        strength=strength
    )

    return {
        'original_text': result['original_text'],
        'styled_text': result['styled_text'],
        'style_name': result['style_name'],
        'transfer_strength': result['transfer_strength'],
        'image_data': f"data:image/png;base64,{base64_image}",
        'metadata': {
            'style_characteristics': result.get('transformations', []),
            'style_preservation': result.get('style_preservation', 0.0),
        }
    }


@router.post("/detect-style")
async def detect_image_style(
    document_id: Optional[int] = None,
    ocr_result_id: Optional[int] = None,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    style_service: StyleTransferService = Depends(get_style_transfer_service),
):
    image_bytes = None

    if document_id:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        image_path = doc.inpainted_image_path or doc.processed_image_path or doc.original_image_path
        if image_path:
            image_bytes = storage.download_file(image_path)

    if not image_bytes and ocr_result_id:
        ocr = db.query(OCRResult).filter(OCRResult.id == ocr_result_id).first()
        if ocr:
            doc = db.query(Document).filter(Document.id == ocr.document_id).first()
            if doc:
                image_path = doc.inpainted_image_path or doc.processed_image_path or doc.original_image_path
                if image_path:
                    image_bytes = storage.download_file(image_path)

    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image available for style detection")

    import cv2
    import numpy as np
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    result = style_service.analyze_image_style(image)

    return {
        'detected_style': result['detected_style'],
        'style_name': result['style_name'],
        'confidence': result['confidence'],
        'characteristics': result['characteristics']
    }


@router.post("/preview")
async def preview_style_transfer(
    request: StyleTransferRequest,
    style_service: StyleTransferService = Depends(get_style_transfer_service),
):
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")

    if request.style_name not in [s.key for s in AVAILABLE_STYLES]:
        raise HTTPException(status_code=400, detail=f"Invalid style: {request.style_name}")

    strengths = [0.3, 0.5, 0.7, 0.9]
    previews = []

    for strength in strengths:
        result = style_service.transfer_style(
            text=request.text,
            target_style=request.style_name,
            strength=strength
        )
        previews.append({
            'strength': strength,
            'styled_text': result['styled_text'],
            'style_characteristics': result.get('transformations', [])
        })

    return {
        'original_text': request.text,
        'style_name': request.style_name,
        'previews': previews
    }


@router.post("/apply-to-ocr/{ocr_result_id}")
async def apply_style_transfer_to_ocr(
    ocr_result_id: int,
    style_name: str = Form("kaishu"),
    strength: float = Form(0.7),
    db: Session = Depends(get_db),
    style_service: StyleTransferService = Depends(get_style_transfer_service),
    storage: StorageService = Depends(get_storage_service),
):
    ocr = db.query(OCRResult).filter(OCRResult.id == ocr_result_id).first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR result not found")

    text = ocr.corrected_text or ocr.text

    result = style_service.transfer_style(
        text=text,
        target_style=style_name,
        strength=strength
    )

    styled_img = style_service._apply_style_transform(
        text=text,
        style_params=style_service.STYLE_PARAMETERS.get(style_name, {}),
        strength=strength,
        font_size=48
    )

    image_path = None
    if styled_img is not None:
        import cv2
        success, encoded = cv2.imencode('.png', styled_img)
        if success:
            key = f"style_transfer/{ocr.document_id}/ocr_{ocr_result_id}_{style_name}_{strength}.png"
            storage.upload_file_bytes(key, encoded.tobytes(), 'image/png')
            image_path = key

    log = StyleTransferLog(
        document_id=ocr.document_id,
        ocr_result_id=ocr_result_id,
        original_text=text,
        styled_text=result['styled_text'],
        style_name=style_name,
        transfer_strength=strength,
        image_path=image_path
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        'log_id': log.id,
        'original_text': result['original_text'],
        'styled_text': result['styled_text'],
        'style_name': result['style_name'],
        'transfer_strength': result['transfer_strength'],
        'image_path': image_path
    }


@router.get("/history/document/{document_id}")
async def get_style_transfer_history(
    document_id: int,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    logs = db.query(StyleTransferLog).filter(
        StyleTransferLog.document_id == document_id
    ).order_by(StyleTransferLog.created_at.desc()).all()

    return {
        'document_id': document_id,
        'history': [
            {
                'id': log.id,
                'ocr_result_id': log.ocr_result_id,
                'original_text': log.original_text[:50] + '...' if len(log.original_text) > 50 else log.original_text,
                'styled_text': log.styled_text[:50] + '...' if log.styled_text and len(log.styled_text) > 50 else log.styled_text,
                'style_name': log.style_name,
                'transfer_strength': log.transfer_strength,
                'image_path': log.image_path,
                'created_at': log.created_at
            }
            for log in logs
        ]
    }
