import pytest
import pandas as pd
from fastapi.testclient import TestClient
from app.main import app
from app.services.transaction_classifier import classify_single_transaction, classify_dataframe
from app.services.cashflow_synthesizer import compute_cashflow_features
from app.services.affordability_calculator import (
    calculate_loan_emi,
    compute_affordability_assessment
)
from app.auth.security import create_access_token
from app.database import init_db

init_db()
client = TestClient(app)


def test_transaction_classification_categories():
    """Verify classification into all required categories."""
    cases = [
        # (desc, amount, expected_category)
        ("MONTHLY SALARY CREDIT FROM ACME CORP", 75000.0, "income"),
        ("CLIENT PAYMENT INVOICE 109", 12000.0, "income"),
        ("AMAZON PAY INDIA PURCHASE", -1500.0, "expense"),
        ("SWIGGY FOOD ORDER", -450.0, "expense"),
        ("HDFC BANK AUTO LOAN EMI DEBIT", -8500.0, "loan_repayment"),
        ("BAJAJ FINANCE HOUSING EMI", -12000.0, "loan_repayment"),
        ("SELF TRANSFER TO GPAY WALLET", 5000.0, "internal_transfer"),
        ("TRANSFER FROM OWN SAVINGS A/C", 10000.0, "internal_transfer"),
        ("PERSONAL LOAN DISBURSAL CREDIT", 150000.0, "loan_disbursal"),
        ("LOAN DISBURSEMENT FROM NBFC", 50000.0, "loan_disbursal"),
        ("REFUND FOR CANCELLED FLIGHT TICKET", 4500.0, "refund"),
        ("IRCTC TICKET REFUND CR", 1200.0, "refund"),
        ("MISCELLANEOUS UNKNOWN COUNTERPARTY", 100.0, "other"),
    ]
    for desc, amt, expected_cat in cases:
        cat, conf, _ = classify_single_transaction(desc, amount=amt)
        assert cat == expected_cat, f"Expected {expected_cat} for '{desc}', got {cat}"
        assert conf >= 0.5


def test_non_earned_inflows_exclusion_from_earned_cashflow():
    """
    CRITICAL FINANCIAL INTEGRITY TEST:
    Internal transfers, loan disbursements, and refunds must NEVER be counted
    as earned operating inflow in cash-flow calculations.
    """
    data = [
        {"transaction_date": "2025-01-05", "amount": 60000.0, "description": "SALARY CREDIT INFOSYS"},
        {"transaction_date": "2025-01-10", "amount": 25000.0, "description": "SELF TRANSFER FROM OWN SAVINGS"},
        {"transaction_date": "2025-01-15", "amount": 100000.0, "description": "LOAN DISBURSAL CREDIT HDFC"},
        {"transaction_date": "2025-01-20", "amount": 3000.0, "description": "REFUND AMAZON RETURN"},
        {"transaction_date": "2025-01-25", "amount": -18000.0, "description": "RENT AND GROCERIES EXPENSE"},
        {"transaction_date": "2025-02-05", "amount": 60000.0, "description": "SALARY CREDIT INFOSYS"},
        {"transaction_date": "2025-02-12", "amount": 15000.0, "description": "TRANSFER TO SELF ACC"},
        {"transaction_date": "2025-02-25", "amount": -20000.0, "description": "SUPERMARKET AND UTILITIES"},
    ]
    df = pd.DataFrame(data)
    classified_df, breakdown = classify_dataframe(df)

    # Verify classification
    assert breakdown["income"]["count"] == 2
    assert breakdown["internal_transfer"]["count"] == 2
    assert breakdown["loan_disbursal"]["count"] == 1
    assert breakdown["refund"]["count"] == 1
    assert breakdown["expense"]["count"] == 2

    # Synthesize cash flow with classification
    cf = compute_cashflow_features(classified_df)

    # Gross earned inflow per month must be ~60,000, NOT ~190,000!
    assert cf["gross_business_inflow_monthly"] < 70000.0
    assert cf["gross_business_inflow_monthly"] >= 55000.0

    # Ensure excluded inflows total is captured
    excluded_total = cf.get("excluded_inflows_total", 0.0)
    # 25,000 + 100,000 + 3,000 + 15,000 = 143,000
    assert excluded_total >= 120000.0


def test_reducing_balance_emi_math():
    """Verify standard financial EMI mathematics."""
    # Principal: 100,000, 12 months, 18% annual interest rate
    emi = calculate_loan_emi(100000, 12, 18.0)
    # Standard formula P * r * (1+r)^n / ((1+r)^n - 1) gives ~9168
    assert 9150 <= emi <= 9180

    # Principal: 50,000, 6 months, 12% interest
    emi_short = calculate_loan_emi(50000, 6, 12.0)
    # Expected ~8627
    assert 8600 <= emi_short <= 8650


def test_affordability_verdicts_and_metrics():
    """Verify affordability verdict logic under varied financial profiles."""
    # Profile 1: Strong cashflow, affordable loan
    result_strong = compute_affordability_assessment(
        requested_amount=50000,
        tenure_months=12,
        annual_interest_rate=18.0,
        gross_earned_income=65000,
        stable_monthly_cash_flow=35000,
        declared_existing_debt=3000
    )
    assert result_strong["affordability_verdict"] == "Affordable"
    assert result_strong["foir_percentage"] < 40.0
    assert result_strong["net_disposable_surplus"] > 20000
    assert result_strong["dscr_ratio"] > 1.5

    # Profile 2: High debt obligation, unaffordable loan
    result_tight = compute_affordability_assessment(
        requested_amount=150000,
        tenure_months=12,
        annual_interest_rate=18.0,
        gross_earned_income=30000,
        stable_monthly_cash_flow=8000,
        declared_existing_debt=12000
    )
    assert result_tight["affordability_verdict"] in ["Stretched / High Risk", "Moderate Burden"]
    assert result_tight["foir_percentage"] > 50.0
    assert result_tight["net_disposable_surplus"] < 0


def test_borrower_profile_application_creation_and_retrieval():
    """Verify creating and retrieving an application with borrower profile parameters."""
    import uuid
    uname = f"u_{uuid.uuid4().hex[:8]}"
    signup = client.post("/api/auth/signup", json={
        "username": uname,
        "password": "Password123!",
        "full_name": "Rahul Verma",
        "email": f"{uname}@example.com",
        "role": "borrower"
    })
    assert signup.status_code == 200
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "requested_amount": 75000,
        "occupation": "Software Engineer",
        "income_source": "Salary Direct Deposit",
        "declared_income": 95000,
        "existing_debt": 5000,
        "tenure_months": 18
    }

    create_res = client.post("/api/applications", json=payload, headers=headers)
    assert create_res.status_code in [200, 201]
    app_data = create_res.json()

    assert app_data["requested_amount"] == 75000
    assert app_data["occupation"] == "Software Engineer"
    assert app_data["income_source"] == "Salary Direct Deposit"
    assert app_data["declared_income"] == 95000
    assert app_data["existing_debt"] == 5000
    assert app_data["tenure_months"] == 18

    # Verify retrieval
    app_id = app_data["id"]
    get_res = client.get(f"/api/applications/{app_id}", headers=headers)
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["occupation"] == "Software Engineer"
    assert fetched["tenure_months"] == 18


def test_full_analysis_returns_affordability_and_breakdown():
    """Verify that running analysis generates affordability summary and category breakdown."""
    import uuid
    uname = f"u_{uuid.uuid4().hex[:8]}"
    signup = client.post("/api/auth/signup", json={
        "username": uname,
        "password": "Password123!",
        "full_name": "Priya Nair",
        "email": f"{uname}@example.com",
        "role": "borrower"
    })
    assert signup.status_code == 200
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create application
    app_payload = {
        "requested_amount": 60000,
        "occupation": "Healthcare Professional",
        "income_source": "Hospital Payroll",
        "declared_income": 70000,
        "existing_debt": 4000,
        "tenure_months": 12
    }
    app_res = client.post("/api/applications", json=app_payload, headers=headers)
    assert app_res.status_code in [200, 201]
    app_id = app_res.json()["id"]

    # 2. Upload transaction CSV (with diverse categories)
    csv_content = """transaction_date,amount,description
2025-01-05,70000.00,SALARY DIRECT DEPOSIT
2025-01-10,-4000.00,CAR LOAN EMI DEBIT
2025-01-15,10000.00,SELF TRANSFER FROM SAVINGS
2025-01-20,-15000.00,HOUSE RENT
2025-01-28,-8000.00,GROCERIES AND UTILITIES
2025-02-05,70000.00,SALARY DIRECT DEPOSIT
2025-02-10,-4000.00,CAR LOAN EMI DEBIT
2025-02-18,2500.00,REFUND FROM FLIPKART
2025-02-25,-18000.00,CREDIT CARD PAYMENT
"""
    files = {
        "transactions_file": ("statement.csv", csv_content, "text/csv")
    }
    data = {
        "application_id": app_id
    }

    analysis_res = client.post("/api/analysis", data=data, files=files, headers=headers)
    assert analysis_res.status_code in [200, 201]
    analysis_data = analysis_res.json()

    # Verify affordability summary present and valid
    assert "affordability" in analysis_data
    affordability = analysis_data["affordability"]
    assert affordability["requested_amount"] == 60000
    assert affordability["tenure_months"] == 12
    assert affordability["proposed_monthly_emi"] > 0
    assert affordability["foir_percentage"] > 0
    assert "affordability_verdict" in affordability

    # Verify borrower profile present
    assert "borrower_profile" in analysis_data
    assert analysis_data["borrower_profile"]["occupation"] == "Healthcare Professional"

    # Verify category breakdown present in cashflow / data
    assert "cashflow" in analysis_data
    assert "data" in analysis_data
    assert "category_breakdown" in analysis_data["cashflow"]
    assert "excluded_inflows_total" in analysis_data["cashflow"]
    assert analysis_data["cashflow"]["excluded_inflows_total"] > 0  # 10,000 transfer + 2,500 refund
    assert "uncertainty_indicators" in analysis_data["data"]
    assert "missing_evidence" in analysis_data["data"]
