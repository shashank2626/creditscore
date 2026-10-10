import io
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Body
from fastapi.responses import PlainTextResponse

from app.services.pdf_extractor import (
    extract_transactions_from_pdf,
    convert_reviewed_transactions_to_csv
)

router = APIRouter(prefix="/api/pdf", tags=["PDF Statement Converter"])

@router.post("/extract")
async def extract_pdf_statement(file: UploadFile = File(...)):
    """
    Extract transactions from an uploaded bank statement PDF.
    Supports multi-page PDFs, Indian currency formatting, separate Cr/Dr indicators.
    Filters out opening/closing balances and flags ambiguous lines for review.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a valid PDF bank statement (.pdf)."
        )

    content = await file.read()
    if not content or len(content) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded PDF file is completely empty."
        )

    result = extract_transactions_from_pdf(content, filename=file.filename)
    if not result["success"]:
        raise HTTPException(
            status_code=400,
            detail=result["error"]
        )

    return result

@router.post("/convert")
async def convert_reviewed_transactions(
    payload: Dict[str, Any] = Body(...)
):
    """
    Convert validated and reviewed transactions into the canonical
    2-column credit scoring CSV (transaction_date,amount).
    """
    transactions = payload.get("transactions", [])
    if not transactions or not isinstance(transactions, list):
        raise HTTPException(
            status_code=400,
            detail="No transaction rows provided for conversion."
        )

    res = convert_reviewed_transactions_to_csv(transactions)
    if not res["success"]:
        raise HTTPException(
            status_code=400,
            detail=res["error"]
        )

    return res

@router.post("/download-csv")
async def download_csv_file(
    payload: Dict[str, Any] = Body(...)
):
    """
    Return downloadable CSV file directly with exact transaction_date,amount headers.
    """
    transactions = payload.get("transactions", [])
    res = convert_reviewed_transactions_to_csv(transactions)
    if not res["success"]:
        raise HTTPException(
            status_code=400,
            detail=res["error"]
        )

    return PlainTextResponse(
        content=res["csv_content"],
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=standardized_transactions.csv"}
    )
