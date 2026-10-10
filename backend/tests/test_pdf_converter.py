import os
import io
import re
import pytest
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.services.pdf_extractor import (
    extract_transactions_from_pdf,
    convert_reviewed_transactions_to_csv
)
from app.services.data_ingestion import parse_transaction_csv
from app.services.cashflow_synthesizer import compute_cashflow_features
from app.services.ml_engine import ml_engine
from app.services.shap_explainer import shap_explainer

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "gpay_statement_20260401_20260930.pdf")

def create_synthetic_pdf_bytes(pages_lines: list[list[str]]) -> bytes:
    """Helper to generate multi-page PDF statements with reportlab."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for lines in pages_lines:
        y = 750
        for line in lines:
            c.drawString(50, y, line)
            y -= 20
        c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()

# ==============================================================================
# Existing Bank Statement & CSV Parser Regression Tests
# ==============================================================================

def test_single_page_pdf_extraction_with_balances():
    # PDF with opening/closing balances, INR currency formatting, and debits/credits
    page_1 = [
        "STATE BANK OF INDIA - ACCOUNT STATEMENT",
        "Account Number: 38291049281 | Branch: INDIRANAGAR",
        "Txn Date Description Debit Credit Balance",
        "01/06/2025 OPENING BALANCE B/F 0.00 45,000.00",
        "03/06/2025 UPI/Vendor Restock 4,500.00 Dr 40,500.00",
        "10/06/2025 Client Invoice NEFT 25,000.00 Cr 65,500.00",
        "15/06/2025 ATM Cash Wdl 2,000.00 63,500.00",
        "28/06/2025 Store Collections Inward 18,500.00 82,000.00",
        "30/06/2025 CLOSING BALANCE C/F 0.00 82,000.00",
        "Page 1 of 1 - Computer Generated Statement"
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page_1])
    res = extract_transactions_from_pdf(pdf_bytes, filename="sbi_statement.pdf")

    assert res["success"] is True
    assert res["summary"]["total_pages"] == 1
    assert res["summary"]["skipped_balance_rows_count"] == 2
    
    txs = res["transactions"]
    assert len(txs) == 4

    # Verify debit vs credit signs
    # 03/06/2025 Vendor Restock -> Debit (-4500)
    assert txs[0]["transaction_date"] == "2025-06-03"
    assert txs[0]["amount"] == -4500.00
    assert txs[0]["type"] == "debit"
    assert txs[0]["status"] == "valid"

    # 10/06/2025 Client Invoice -> Credit (+25000)
    assert txs[1]["transaction_date"] == "2025-06-10"
    assert txs[1]["amount"] == 25000.00
    assert txs[1]["type"] == "credit"
    assert txs[1]["status"] == "valid"

    # 15/06/2025 ATM Cash Wdl -> Debit (-2000)
    assert txs[2]["transaction_date"] == "2025-06-15"
    assert txs[2]["amount"] == -2000.00
    assert txs[2]["type"] == "debit"

    # 28/06/2025 Inward -> Credit (+18500)
    assert txs[3]["transaction_date"] == "2025-06-28"
    assert txs[3]["amount"] == 18500.00
    assert txs[3]["type"] == "credit"

def test_multi_page_pdf_statement():
    page_1 = [
        "HDFC BANK - RETAIL ACCOUNT STATEMENT",
        "Statement Period: 01/04/2025 to 30/05/2025",
        "Date Narration Chq/Ref Withdrawal Deposit Balance",
        "01/04/2025 OPENING BALANCE 0.00 20,000.00",
        "05/04/2025 Supplier Payment 6,200.00 Dr 13,800.00",
        "20/04/2025 Customer Deposit 15,000.00 Cr 28,800.00",
        "Page 1 of 2"
    ]
    page_2 = [
        "HDFC BANK - RETAIL ACCOUNT STATEMENT (CONTINUED)",
        "Date Narration Chq/Ref Withdrawal Deposit Balance",
        "02/05/2025 Rent Transfer 8,000.00 Dr 20,800.00",
        "18/05/2025 POS Merchant Settlement 22,000.00 Cr 42,800.00",
        "30/05/2025 TOTAL SUMMARY / CLOSING BALANCE 0.00 42,800.00",
        "Page 2 of 2"
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page_1, page_2])
    res = extract_transactions_from_pdf(pdf_bytes, filename="hdfc_multipage.pdf")

    assert res["success"] is True
    assert res["summary"]["total_pages"] == 2
    assert res["summary"]["skipped_balance_rows_count"] == 2
    assert len(res["transactions"]) == 4

    # Verify transactions from both pages are present
    dates = [t["transaction_date"] for t in res["transactions"]]
    assert dates == ["2025-04-05", "2025-04-20", "2025-05-02", "2025-05-18"]

def test_statement_coverage_duration():
    # 3-month statement (July 2025 to September 2025)
    page = [
        "Date Narration Debit Credit",
        "01/07/2025 Q3 Inward Deposit 10,000.00 Cr",
        "15/08/2025 Intermediate Bill Pay 2,000.00 Dr",
        "30/09/2025 Final Settlement 12,000.00 Cr"
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page])
    res = extract_transactions_from_pdf(pdf_bytes)

    assert res["success"] is True
    assert res["summary"]["coverage_start_date"] == "2025-07-01"
    assert res["summary"]["coverage_end_date"] == "2025-09-30"
    # ~3 months (91 days / 30.4375 ≈ 3.0)
    assert 2.8 <= res["summary"]["coverage_months"] <= 3.2

def test_ambiguous_row_flagged_for_review():
    # A row with no Cr/Dr, no keyword clues, and neutral wording
    page = [
        "Date Details Amount",
        "2025-08-01 Alpha Corp Transfer 5000.00", # Neutral, ambiguous direction
        "2025-08-05 Supplier Debit 1200.00 Dr"     # Clear debit
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page])
    res = extract_transactions_from_pdf(pdf_bytes)

    assert res["success"] is True
    # The ambiguous row must have status 'needs_review'
    ambig_tx = [t for t in res["transactions"] if "Alpha Corp" in t["description"]][0]
    assert ambig_tx["status"] == "needs_review"
    assert "ambiguous" in ambig_tx["review_reason"].lower()

def test_convert_reviewed_to_csv():
    reviewed_txs = [
        {"transaction_date": "2025-08-05", "amount": 1200.00, "type": "debit", "status": "valid"},
        {"transaction_date": "2025-08-01", "amount": 5000.00, "type": "credit", "status": "valid"},
        {"transaction_date": "invalid-date", "amount": 200.00, "type": "debit", "status": "invalid"},
    ]
    csv_res = convert_reviewed_transactions_to_csv(reviewed_txs)
    assert csv_res["success"] is True
    assert csv_res["row_count"] == 2
    assert csv_res["skipped_count"] == 1
    lines = csv_res["csv_content"].strip().split("\n")
    assert lines[0] == "transaction_date,amount"
    # Sorted ascending: 2025-08-01 comes first (+5000.00), then 2025-08-05 (-1200.00)
    assert lines[1] == "2025-08-01,5000.00"
    assert lines[2] == "2025-08-05,-1200.00"

def test_empty_and_invalid_pdf():
    res_empty = extract_transactions_from_pdf(b"")
    assert res_empty["success"] is False
    assert "empty" in res_empty["error"].lower()

    res_corrupt = extract_transactions_from_pdf(b"This is not a pdf file")
    assert res_corrupt["success"] is False
    assert "pdf" in res_corrupt["error"].lower()

def test_end_to_end_pdf_to_scoring_pipeline():
    page = [
        "CREDENCE BANK - STATEMENT",
        "Txn Date Particulars Debit Credit Balance",
        "01/01/2025 OPENING BALANCE B/F 0.00 30,000.00",
        "05/01/2025 Client Payout Inward 25,000.00 Cr 55,000.00",
        "15/01/2025 Inventory Purchase 8,000.00 Dr 47,000.00",
        "25/01/2025 Utility Bill Pay 1,500.00 Dr 45,500.00",
        "31/01/2025 CLOSING BALANCE C/F 0.00 45,500.00"
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page])
    
    # 1. Extract from PDF
    extract_res = extract_transactions_from_pdf(pdf_bytes)
    assert extract_res["success"] is True
    assert extract_res["summary"]["valid_rows_count"] == 3

    # 2. Convert to CSV
    csv_res = convert_reviewed_transactions_to_csv(extract_res["transactions"])
    assert csv_res["success"] is True

    # 3. Feed directly into existing underwriting pipeline
    tx_res = parse_transaction_csv(csv_res["csv_content"].encode("utf-8"), "converted_from_pdf.csv")
    assert tx_res["status"] != "invalid"

    # 4. Features & Scoring
    features = compute_cashflow_features(tx_res["dataframe"], punctuality_rate=0.90)
    features["requested_amount"] = 50000.0
    pred = ml_engine.predict(features, data_confidence=tx_res["quality_level"])
    assert 300 <= pred["score"] <= 900

    # 5. SHAP Explanations
    shap = shap_explainer.explain(features)
    assert len(shap) == 11

# ==============================================================================
# Google Pay Statement Fixture Tests (Multi-page, Reconciliation, Normalization)
# ==============================================================================

def test_uploaded_google_pay_fixture_extraction():
    """Verify parsing of the actual multi-page Google Pay statement fixture."""
    assert os.path.exists(FIXTURE_PATH), f"Fixture not found at {FIXTURE_PATH}"

    with open(FIXTURE_PATH, "rb") as f:
        pdf_bytes = f.read()

    res = extract_transactions_from_pdf(pdf_bytes, filename="gpay_statement_20260401_20260930.pdf")

    assert res["success"] is True
    summary = res["summary"]

    assert summary["format_detected"] == "Google Pay Statement"
    assert summary["total_pages"] == 5
    assert summary["total_rows_extracted"] == 46
    assert summary["valid_rows_count"] == 46
    assert summary["needs_review_count"] == 0
    assert summary["invalid_rows_count"] == 0

    # Check financial reconciliation with declared summary
    # Sent: ₹90,101 | Received: ₹47,005
    assert summary["total_debits"] == 90101.00
    assert summary["total_credits"] == 47005.00
    assert summary["is_reconciled"] is True

    # Check declared totals were NOT inserted as phantom transactions
    txs = res["transactions"]
    assert len(txs) == 46
    phantom_90101 = [t for t in txs if t["description"] == "Sent" or t["description"] == "Received"]
    assert len(phantom_90101) == 0

    # Check date coverage parsed from statement period
    assert summary["coverage_start_date"] == "2026-04-01"
    assert summary["coverage_end_date"] == "2026-09-30"
    assert 5.8 <= summary["coverage_months"] <= 6.2

    # Check incoming vs outgoing transactions
    debits = [t for t in txs if t["type"] == "debit"]
    credits = [t for t in txs if t["type"] == "credit"]
    assert len(debits) == 3
    assert len(credits) == 43

    # Check multi-line extraction details: time, UPI ID, counterparties
    # First transaction: Paid to Shashank Vasudeva Mestha ₹100
    tx0 = txs[0]
    assert tx0["transaction_date"] == "2026-05-05"
    assert "08:54" in tx0["time"]
    assert tx0["type"] == "debit"
    assert tx0["amount"] == -100.00
    assert tx0["transaction_id"] == "612567034075"
    assert "Shashank" in tx0["counterparty"]
    assert tx0["source"] == "Google Pay Statement"

    # Second transaction: Received from Google Pay rewards ₹21
    tx1 = txs[1]
    assert tx1["transaction_date"] == "2026-05-05"
    assert tx1["type"] == "credit"
    assert tx1["amount"] == 21.00
    assert tx1["transaction_id"] == "868836591266"
    assert tx1["category"] == "refund"  # Rewards categorized as non-operating refund/cashback

    # Large comma-separated transactions: ₹40,000 and ₹90,000
    large_credits = [t for t in txs if t["amount"] == 40000.00]
    large_debits = [t for t in txs if t["amount"] == -90000.00]
    assert len(large_credits) == 1
    assert len(large_debits) == 1
    assert large_debits[0]["transaction_date"] == "2026-07-13"
    assert "kkwhostel" in large_debits[0]["description"].lower()

def test_synthetic_google_pay_statement():
    """Verify synthetic Google Pay statement with separate date, time, desc, ID, amount lines."""
    gpay_page_1 = [
        "Transactionstatement",
        "9876543210,test@example.com",
        "Note: This statement reflects payments made by you on the Google Pay app.",
        "Page1of2",
        "Transactionstatementperiod",
        "01January2026-28February2026",
        "Sent",
        "₹15,500",
        "Received",
        "₹25,000",
        "Date&time Transactiondetails Amount",
        "10Jan,2026",
        "10:15AM",
        "ReceivedfromClientConsulting",
        "UPITransactionID:998877665544",
        "PaidtoSaraswatBank1234",
        "₹25,000",
        "15Jan,2026",
        "02:30PM",
        "PaidtoEquipmentSupplier",
        "UPITransactionID:112233445566",
        "PaidbySaraswatBank1234",
        "₹15,500"
    ]
    pdf_bytes = create_synthetic_pdf_bytes([gpay_page_1])
    res = extract_transactions_from_pdf(pdf_bytes, filename="synthetic_gpay.pdf")

    assert res["success"] is True
    assert res["summary"]["format_detected"] == "Google Pay Statement"
    assert len(res["transactions"]) == 2
    assert res["summary"]["total_credits"] == 25000.00
    assert res["summary"]["total_debits"] == 15500.00
    assert res["summary"]["is_reconciled"] is True

    t1, t2 = res["transactions"]
    assert t1["transaction_date"] == "2026-01-10"
    assert t1["type"] == "credit"
    assert t1["amount"] == 25000.00
    assert t1["transaction_id"] == "998877665544"

    assert t2["transaction_date"] == "2026-01-15"
    assert t2["type"] == "debit"
    assert t2["amount"] == -15500.00
    assert t2["transaction_id"] == "112233445566"

def test_scanned_pdf_error_handling():
    """Verify that image-only or scanned PDFs without a text layer return informative error."""
    # PDF with 0 text rendered
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.showPage()
    c.save()
    blank_pdf = buf.getvalue()

    res = extract_transactions_from_pdf(blank_pdf, filename="scanned_scan.pdf")
    assert res["success"] is False
    assert "scanned" in res["error"].lower()
    assert "ocr" in res["error"].lower()

def test_unsupported_text_pdf_error_handling():
    """Verify that text PDFs with non-financial text return layout unsupported message."""
    page = [
        "LITERATURE ESSAY ON ART AND PHILOSOPHY",
        "Chapter 1: The Foundations of Modernist Architecture",
        "This document contains academic commentary and historical reviews.",
        "There are no transaction records or bank statements in this file."
    ]
    pdf_bytes = create_synthetic_pdf_bytes([page])
    res = extract_transactions_from_pdf(pdf_bytes, filename="essay.pdf")
    assert res["success"] is False
    assert "layout is not yet supported" in res["error"].lower()

def test_gpay_to_end_to_end_underwriting_pipeline():
    """Verify end-to-end integration: GPay PDF -> CSV -> Ingestion -> Cashflow -> ML Model -> SHAP."""
    with open(FIXTURE_PATH, "rb") as f:
        pdf_bytes = f.read()

    # 1. Extract from GPay PDF
    extract_res = extract_transactions_from_pdf(pdf_bytes, filename="gpay.pdf")
    assert extract_res["success"] is True

    # 2. Convert to normalized CSV
    csv_res = convert_reviewed_transactions_to_csv(extract_res["transactions"])
    assert csv_res["success"] is True
    assert csv_res["row_count"] == 46

    # 3. Data ingestion
    ingest = parse_transaction_csv(csv_res["csv_content"].encode("utf-8"), "gpay_transactions.csv")
    assert ingest["status"] != "invalid"
    assert ingest["row_count"] == 46

    # 4. Feature computation
    features = compute_cashflow_features(ingest["dataframe"])
    assert features["history_months"] > 0
    assert "gross_business_inflow_monthly" in features
    assert "category_breakdown" in features
    features["requested_amount"] = 50000.0

    # 5. Underwriting ML engine
    pred = ml_engine.predict(features, data_confidence=ingest["quality_level"])
    assert 300 <= pred["score"] <= 900
    assert "probability_label" in pred

    # 6. SHAP Explainability
    shap = shap_explainer.explain(features)
    assert len(shap) == 11
