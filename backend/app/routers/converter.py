import io
import json
import pandas as pd
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.csv_converter import detect_column_mappings, convert_bank_csv

router = APIRouter(prefix="/api/converter", tags=["CSV Converter"])

@router.post("/detect")
async def detect_csv_format(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files (.csv) are supported.")
        
    content = await file.read()
    if not content or len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to decode file as UTF-8 or Latin-1.")

    try:
        df = pd.read_csv(io.StringIO(text), nrows=10)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV headers: {str(e)}")

    if len(df.columns) == 0:
        raise HTTPException(status_code=400, detail="CSV does not contain any columns.")

    detection = detect_column_mappings(df)

    # Return sample rows (max 5) for user preview
    sample_rows = df.head(5).fillna("").to_dict(orient="records")

    return {
        "filename": file.filename,
        "total_columns": len(df.columns),
        "available_columns": list(df.columns),
        "detected": detection["detected"],
        "confidence": detection["confidence"],
        "sample_rows": sample_rows
    }

@router.post("/convert")
async def convert_csv_endpoint(
    file: UploadFile = File(...),
    mappings_json: Optional[str] = Form(None)
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files (.csv) are supported.")

    content = await file.read()
    if not content or len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    mapping_overrides = None
    if mappings_json:
        try:
            mapping_overrides = json.loads(mappings_json)
        except Exception:
            mapping_overrides = None

    result = convert_bank_csv(content, mapping_overrides=mapping_overrides)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Conversion failed."))

    return result
