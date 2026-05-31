from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from .models import (User, Patient, Study, Series, Instance, AIDetection, Report,
                     UserRole, TaskStatus)
from .auth import get_password_hash


def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()


def create_user(db: Session, username: str, email: str, password: str,
                full_name: str, role: UserRole = UserRole.DOCTOR) -> User:
    hashed_password = get_password_hash(password)
    db_user = User(
        username=username,
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        role=role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def get_patient_by_patient_id(db: Session, patient_id: str) -> Optional[Patient]:
    return db.query(Patient).filter(Patient.patient_id == patient_id).first()


def create_patient(db: Session, patient_id: str, name: str, birth_date: str = None,
                   gender: str = None, age: int = None) -> Patient:
    db_patient = Patient(
        patient_id=patient_id,
        name=name,
        birth_date=birth_date,
        gender=gender,
        age=age
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient


def get_patients(db: Session, search: str = None, skip: int = 0, limit: int = 100) -> List[Patient]:
    query = db.query(Patient)
    if search:
        query = query.filter(or_(
            Patient.name.contains(search),
            Patient.patient_id.contains(search)
        ))
    return query.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()


def get_study_by_uid(db: Session, study_uid: str) -> Optional[Study]:
    return db.query(Study).filter(Study.study_uid == study_uid).first()


def create_study(db: Session, study_uid: str, patient_id: int, study_date: str = None,
                 study_time: str = None, study_description: str = None, modalities: list = None,
                 institution: str = None, referring_physician: str = None) -> Study:
    db_study = Study(
        study_uid=study_uid,
        patient_id=patient_id,
        study_date=study_date,
        study_time=study_time,
        study_description=study_description,
        modalities=modalities or [],
        institution=institution,
        referring_physician=referring_physician
    )
    db.add(db_study)
    db.commit()
    db.refresh(db_study)
    return db_study


def get_studies_by_patient(db: Session, patient_id: int) -> List[Study]:
    return db.query(Study).filter(Study.patient_id == patient_id).order_by(Study.study_date.desc()).all()


def get_series_by_uid(db: Session, series_uid: str) -> Optional[Series]:
    return db.query(Series).filter(Series.series_uid == series_uid).first()


def create_series(db: Session, series_uid: str, study_id: int, **kwargs) -> Series:
    db_series = Series(
        series_uid=series_uid,
        study_id=study_id,
        **kwargs
    )
    db.add(db_series)
    db.commit()
    db.refresh(db_series)
    return db_series


def get_series_by_study(db: Session, study_id: int) -> List[Series]:
    return db.query(Series).filter(Series.study_id == study_id).order_by(Series.series_number).all()


def get_instance_by_uid(db: Session, instance_uid: str) -> Optional[Instance]:
    return db.query(Instance).filter(Instance.instance_uid == instance_uid).first()


def create_instance(db: Session, instance_uid: str, series_id: int, minio_object_name: str,
                    **kwargs) -> Instance:
    db_instance = Instance(
        instance_uid=instance_uid,
        series_id=series_id,
        minio_object_name=minio_object_name,
        **kwargs
    )
    db.add(db_instance)
    db.commit()
    db.refresh(db_instance)
    return db_instance


def get_instances_by_series(db: Session, series_id: int) -> List[Instance]:
    return db.query(Instance).filter(Instance.series_id == series_id).order_by(Instance.instance_number).all()


def get_instances_by_series_paginated(db: Session, series_id: int, skip: int = 0, limit: int = 50) -> List[Instance]:
    return db.query(Instance).filter(Instance.series_id == series_id).order_by(Instance.instance_number).offset(skip).limit(limit).all()


def get_instance_count_by_series(db: Session, series_id: int) -> int:
    return db.query(Instance).filter(Instance.series_id == series_id).count()


def create_ai_detection(db: Session, series_id: int, task_id: str) -> AIDetection:
    db_detection = AIDetection(
        series_id=series_id,
        task_id=task_id,
        status=TaskStatus.PENDING
    )
    db.add(db_detection)
    db.commit()
    db.refresh(db_detection)
    return db_detection


def update_ai_detection_status(db: Session, task_id: str, status: TaskStatus,
                               results: dict = None, error_message: str = None) -> Optional[AIDetection]:
    detection = db.query(AIDetection).filter(AIDetection.task_id == task_id).first()
    if detection:
        detection.status = status
        if results:
            detection.results = results
        if error_message:
            detection.error_message = error_message
        db.commit()
        db.refresh(detection)
    return detection


def get_ai_detections_by_series(db: Session, series_id: int) -> List[AIDetection]:
    return db.query(AIDetection).filter(AIDetection.series_id == series_id).order_by(AIDetection.created_at.desc()).all()


def get_report_by_study(db: Session, study_id: int) -> Optional[Report]:
    return db.query(Report).filter(Report.study_id == study_id).first()


def create_or_update_report(db: Session, study_id: int, doctor_id: int,
                            findings: str = None, impression: str = None,
                            recommendations: str = None, follow_up: str = None,
                            is_final: bool = False) -> Report:
    report = get_report_by_study(db, study_id)
    if report:
        if findings is not None:
            report.findings = findings
        if impression is not None:
            report.impression = impression
        if recommendations is not None:
            report.recommendations = recommendations
        if follow_up is not None:
            report.follow_up = follow_up
        report.is_final = is_final
        report.doctor_id = doctor_id
    else:
        report = Report(
            study_id=study_id,
            doctor_id=doctor_id,
            findings=findings,
            impression=impression,
            recommendations=recommendations,
            follow_up=follow_up,
            is_final=is_final
        )
        db.add(report)
    db.commit()
    db.refresh(report)
    return report


from .models import Annotation, AnnotationReview, ReportTemplate, AnnotationType, ReviewStatus


def create_annotation(db: Session, series_id: int, instance_id: int, created_by: int,
                      annotation_type: str, coordinates: dict, description: str = None,
                      pathology: str = None, confidence: float = None, is_draft: bool = True,
                      parent_id: int = None) -> Annotation:
    annotation = Annotation(
        series_id=series_id,
        instance_id=instance_id,
        created_by=created_by,
        annotation_type=AnnotationType(annotation_type),
        coordinates=coordinates,
        description=description,
        pathology=pathology,
        confidence=confidence,
        is_draft=is_draft,
        parent_id=parent_id
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


def get_annotations_by_series(db: Session, series_id: int) -> List[Annotation]:
    return db.query(Annotation).filter(Annotation.series_id == series_id).order_by(Annotation.created_at.desc()).all()


def get_annotations_by_instance(db: Session, instance_id: int) -> List[Annotation]:
    return db.query(Annotation).filter(Annotation.instance_id == instance_id).order_by(Annotation.created_at.desc()).all()


def get_annotation_by_id(db: Session, annotation_id: int) -> Optional[Annotation]:
    return db.query(Annotation).filter(Annotation.id == annotation_id).first()


def update_annotation(db: Session, annotation_id: int, created_by: int,
                      coordinates: dict = None, description: str = None,
                      pathology: str = None, confidence: float = None,
                      is_draft: bool = None) -> Optional[Annotation]:
    annotation = get_annotation_by_id(db, annotation_id)
    if annotation:
        if coordinates is not None:
            annotation.coordinates = coordinates
        if description is not None:
            annotation.description = description
        if pathology is not None:
            annotation.pathology = pathology
        if confidence is not None:
            annotation.confidence = confidence
        if is_draft is not None:
            annotation.is_draft = is_draft
        db.commit()
        db.refresh(annotation)
    return annotation


def delete_annotation(db: Session, annotation_id: int) -> bool:
    annotation = get_annotation_by_id(db, annotation_id)
    if annotation:
        db.delete(annotation)
        db.commit()
        return True
    return False


def create_annotation_review(db: Session, annotation_id: int, reviewed_by: int,
                             status: str, comment: str = None,
                             modified_coordinates: dict = None) -> AnnotationReview:
    review = AnnotationReview(
        annotation_id=annotation_id,
        reviewed_by=reviewed_by,
        status=ReviewStatus(status),
        comment=comment,
        modified_coordinates=modified_coordinates
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


def get_reviews_by_annotation(db: Session, annotation_id: int) -> List[AnnotationReview]:
    return db.query(AnnotationReview).filter(AnnotationReview.annotation_id == annotation_id).order_by(AnnotationReview.created_at.desc()).all()


def create_report_template(db: Session, name: str, created_by: int,
                           category: str = None, modality: str = None,
                           body_part: str = None, findings_template: str = None,
                           impression_template: str = None, recommendations_template: str = None,
                           is_default: bool = False, is_public: bool = True) -> ReportTemplate:
    if is_default:
        db.query(ReportTemplate).filter(
            ReportTemplate.modality == modality,
            ReportTemplate.body_part == body_part,
            ReportTemplate.is_default == True
        ).update({ReportTemplate.is_default: False})

    template = ReportTemplate(
        name=name,
        category=category,
        modality=modality,
        body_part=body_part,
        findings_template=findings_template,
        impression_template=impression_template,
        recommendations_template=recommendations_template,
        is_default=is_default,
        is_public=is_public,
        created_by=created_by
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_report_templates(db: Session, modality: str = None, body_part: str = None,
                         created_by: int = None) -> List[ReportTemplate]:
    query = db.query(ReportTemplate).filter(ReportTemplate.is_public == True)

    if modality:
        query = query.filter(ReportTemplate.modality == modality)
    if body_part:
        query = query.filter(ReportTemplate.body_part == body_part)
    if created_by:
        from sqlalchemy import or_
        query = query.filter(or_(ReportTemplate.created_by == created_by, ReportTemplate.is_public == True))

    return query.order_by(ReportTemplate.is_default.desc(), ReportTemplate.created_at.desc()).all()


def get_report_template_by_id(db: Session, template_id: int) -> Optional[ReportTemplate]:
    return db.query(ReportTemplate).filter(ReportTemplate.id == template_id).first()


def update_report_template(db: Session, template_id: int, name: str = None,
                           findings_template: str = None, impression_template: str = None,
                           recommendations_template: str = None, is_default: bool = None) -> Optional[ReportTemplate]:
    template = get_report_template_by_id(db, template_id)
    if template:
        if name is not None:
            template.name = name
        if findings_template is not None:
            template.findings_template = findings_template
        if impression_template is not None:
            template.impression_template = impression_template
        if recommendations_template is not None:
            template.recommendations_template = recommendations_template
        if is_default is not None and is_default:
            db.query(ReportTemplate).filter(
                ReportTemplate.modality == template.modality,
                ReportTemplate.body_part == template.body_part,
                ReportTemplate.is_default == True
            ).update({ReportTemplate.is_default: False})
            template.is_default = True
        db.commit()
        db.refresh(template)
    return template


def delete_report_template(db: Session, template_id: int) -> bool:
    template = get_report_template_by_id(db, template_id)
    if template:
        db.delete(template)
        db.commit()
        return True
    return False
