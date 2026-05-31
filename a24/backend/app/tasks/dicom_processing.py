from ..celery_app import celery
from ..database import SessionLocal
from .. import crud
from ..models import TaskStatus


@celery.task(bind=True)
def process_dicom_upload(self, file_info_list):
    task_id = self.request.id
    results = {
        "processed": 0,
        "failed": 0,
        "errors": [],
        "patient_ids": set(),
        "study_uids": set(),
        "series_uids": set()
    }

    db = SessionLocal()
    try:
        for file_info in file_info_list:
            try:
                metadata = file_info["metadata"]
                minio_object_name = file_info["minio_object_name"]

                patient_meta = metadata["patient"]
                patient = crud.get_patient_by_patient_id(db, patient_meta["patient_id"])
                if not patient:
                    patient = crud.create_patient(
                        db,
                        patient_id=patient_meta["patient_id"],
                        name=patient_meta["name"],
                        birth_date=patient_meta["birth_date"],
                        gender=patient_meta["gender"]
                    )
                results["patient_ids"].add(patient.id)

                study_meta = metadata["study"]
                study = crud.get_study_by_uid(db, study_meta["study_uid"])
                if not study:
                    study = crud.create_study(
                        db,
                        study_uid=study_meta["study_uid"],
                        patient_id=patient.id,
                        study_date=study_meta["study_date"],
                        study_time=study_meta["study_time"],
                        study_description=study_meta["study_description"],
                        modalities=[study_meta["modality"]] if study_meta["modality"] else [],
                        institution=study_meta["institution"],
                        referring_physician=study_meta["referring_physician"]
                    )
                results["study_uids"].add(study.study_uid)

                series_meta = metadata["series"]
                series = crud.get_series_by_uid(db, series_meta["series_uid"])
                if not series:
                    series = crud.create_series(
                        db,
                        series_uid=series_meta["series_uid"],
                        study_id=study.id,
                        series_number=series_meta["series_number"],
                        modality=series_meta["modality"],
                        series_description=series_meta["series_description"],
                        body_part=series_meta["body_part"],
                        rows=series_meta["rows"],
                        columns=series_meta["columns"],
                        slice_thickness=series_meta["slice_thickness"],
                        slice_spacing=series_meta["slice_spacing"],
                        pixel_spacing=series_meta["pixel_spacing"],
                        image_orientation=series_meta["image_orientation"],
                        image_position=series_meta["image_position"],
                        window_center=series_meta["window_center"],
                        window_width=series_meta["window_width"],
                        instance_count=1
                    )
                else:
                    series.instance_count = (series.instance_count or 0) + 1
                    db.commit()
                    db.refresh(series)
                results["series_uids"].add(series.series_uid)

                instance_meta = metadata["instance"]
                existing_instance = crud.get_instance_by_uid(db, instance_meta["instance_uid"])
                if not existing_instance:
                    crud.create_instance(
                        db,
                        instance_uid=instance_meta["instance_uid"],
                        series_id=series.id,
                        minio_object_name=minio_object_name,
                        instance_number=instance_meta["instance_number"],
                        sop_class_uid=instance_meta["sop_class_uid"],
                        image_position=instance_meta["image_position"],
                        slice_location=instance_meta["slice_location"]
                    )

                results["processed"] += 1

            except Exception as e:
                results["failed"] += 1
                results["errors"].append(f"File {file_info.get('filename', 'unknown')}: {str(e)}")

    finally:
        db.close()

    results["patient_ids"] = list(results["patient_ids"])
    results["study_uids"] = list(results["study_uids"])
    results["series_uids"] = list(results["series_uids"])
    return results
