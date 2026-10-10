import pytest
import io
import pandas as pd
from app.services.csv_converter import convert_bank_csv, detect_column_mappings

def test_csv_with_transaction_date_and_signed_amount():
    csv_content = b"""transaction_date,amount,description
2025-08-01,2450.00,Client Payment
2025-08-03,-650.00,Grocery Restock
2025-08-07,1800.50,UPI Transfer
2025-08-10,-320.00,Utility Bill
"""
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    assert result["valid_rows"] == 4
    assert result["invalid_rows"] == 0
    
    # Verify exact header format
    lines = result["converted_csv"].strip().split("\n")
    assert lines[0] == "transaction_date,amount"
    assert lines[1] == "2025-08-01,2450.00"
    assert lines[2] == "2025-08-03,-650.00"
    assert lines[3] == "2025-08-07,1800.50"
    assert lines[4] == "2025-08-10,-320.00"

def test_csv_with_separate_credit_and_debit_columns():
    csv_content = b"""Date,Particulars,Withdrawal Amount,Deposit Amount
01/08/2025,Sales Credit,,12000.00
03/08/2025,Wholesale Purchase,4500.00,
05/08/2025,Stall Rent,2000.00,
08/08/2025,Retail Sales,,3500.00
"""
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    assert result["valid_rows"] == 4
    
    df = pd.read_csv(io.StringIO(result["converted_csv"]))
    assert list(df.columns) == ["transaction_date", "amount"]
    # 01/08/2025 is 2025-08-01
    assert df.iloc[0]["transaction_date"] == "2025-08-01"
    assert df.iloc[0]["amount"] == 12000.00
    assert df.iloc[1]["amount"] == -4500.00
    assert df.iloc[2]["amount"] == -2000.00
    assert df.iloc[3]["amount"] == 3500.00

def test_csv_with_indian_currency_formatting():
    # Note: ₹ currency symbol, Rs., commas in Indian grouping 1,25,000.00
    csv_content = """Txn Date,Details,Debit,Credit
2025-07-01,Bulk Invoice,,"₹1,25,000.00"
2025-07-05,Electricity Bill,"Rs. 2,450.00",
2025-07-10,Supplier Advance,"₹ 15,000.00",
2025-07-15,Store Collections,,"INR 45,200.50"
""".encode("utf-8")
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    assert result["valid_rows"] == 4
    
    df = pd.read_csv(io.StringIO(result["converted_csv"]))
    assert df.iloc[0]["amount"] == 125000.00
    assert df.iloc[1]["amount"] == -2450.00
    assert df.iloc[2]["amount"] == -15000.00
    assert df.iloc[3]["amount"] == 45200.50

def test_csv_with_invalid_dates_and_missing_amounts():
    csv_content = b"""Date,Amount,Description
2025-08-01,1500.00,Valid Row 1
Invalid-Date,2000.00,Bad Date Row
2025-08-05,NotANumber,Bad Amount Row
2025-08-10,,Empty Amount Row
2025-08-12,3500.00,Valid Row 2
"""
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    assert result["valid_rows"] == 2
    assert result["invalid_rows"] == 3
    assert len(result["warnings"]) > 0

def test_csv_with_ambiguous_column_names_and_override():
    csv_content = b"""ColA,ColB,ColC,ColD
2025-09-01,Vendor Payment,5000.00,Debit
2025-09-05,Client Deposit,8000.00,Credit
"""
    # Without mapping, detection confidence is Low and conversion fails safely
    res_no_map = convert_bank_csv(csv_content)
    assert res_no_map["success"] is False
    assert "manually" in res_no_map["error"].lower()

    # With user-provided mapping override
    res_mapped = convert_bank_csv(csv_content, mapping_overrides={
        "date_col": "ColA",
        "amount_col": "ColC",
        "type_col": "ColD"
    })
    assert res_mapped["success"] is True
    assert res_mapped["valid_rows"] == 2
    df = pd.read_csv(io.StringIO(res_mapped["converted_csv"]))
    assert df.iloc[0]["amount"] == -5000.00
    assert df.iloc[1]["amount"] == 8000.00

def test_empty_csv():
    result = convert_bank_csv(b"")
    assert result["success"] is False
    assert "empty" in result["error"].lower()

def test_csv_with_opening_and_closing_balance_rows():
    csv_content = b"""Date,Description,Amount
2025-06-01,Opening Balance B/F,50000.00
2025-06-05,Daily Sales Collection,14500.00
2025-06-10,Shop Rent,-6000.00
2025-06-30,Closing Balance C/F,58500.00
"""
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    # The 2 balance rows must be skipped; only the 2 real transactions converted
    assert result["valid_rows"] == 2
    assert result["skipped_rows"] == 2
    
    df = pd.read_csv(io.StringIO(result["converted_csv"]))
    assert len(df) == 2
    assert df.iloc[0]["amount"] == 14500.00
    assert df.iloc[1]["amount"] == -6000.00

def test_csv_with_duplicate_transactions():
    csv_content = b"""Date,Amount,Description
2025-08-01,2450.00,Client Payment
2025-08-01,2450.00,Client Payment
2025-08-03,-650.00,Restock
"""
    result = convert_bank_csv(csv_content)
    assert result["success"] is True
    assert result["valid_rows"] == 3
    assert result["duplicate_count"] == 1
    assert any("duplicate" in w.lower() for w in result["warnings"])

def test_converted_csv_pipeline_integration():
    from app.services.data_ingestion import parse_transaction_csv
    from app.services.cashflow_synthesizer import compute_cashflow_features
    from app.services.ml_engine import ml_engine
    from app.services.shap_explainer import shap_explainer

    # Realistic bank statement
    bank_csv = b"""Txn Date,Description,Withdrawal Amount,Deposit Amount
01/01/2025,OPENING BALANCE B/F,0.00,0.00
05/01/2025,UPI Inward Payment,,15000.00
12/01/2025,Inventory Purchase,4500.00,
20/01/2025,Utility Bill,1200.00,
31/01/2025,CLOSING BALANCE,0.00,0.00
"""
    # 1. Convert
    conv_res = convert_bank_csv(bank_csv)
    assert conv_res["success"] is True
    assert conv_res["valid_rows"] == 3
    assert conv_res["skipped_rows"] == 2

    # 2. Ingest
    tx_res = parse_transaction_csv(conv_res["converted_csv"].encode("utf-8"), "converted.csv")
    assert tx_res["status"] != "invalid"
    assert tx_res["row_count"] == 3

    # 3. Features
    features = compute_cashflow_features(tx_res["dataframe"], punctuality_rate=0.85)
    features["requested_amount"] = 50000.0
    assert "stable_monthly_cash_flow" in features

    # 4. Predict
    pred = ml_engine.predict(features, data_confidence=tx_res["quality_level"])
    assert 300 <= pred["score"] <= 900

    # 5. SHAP explain
    shap = shap_explainer.explain(features)
    assert len(shap) == 11

