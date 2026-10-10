import re
from typing import Dict, Any, List, Tuple
import pandas as pd
import numpy as np

# Keywords for categorization
INCOME_KEYWORDS = [
    "salary", "payroll", "client", "customer", "invoice", "sales", "merchant",
    "settlement", "pos settlement", "upi inward", "neft in", "imps in", "rtgs in",
    "collections", "revenue", "consulting", "stipend", "honorarium", "payout in",
    "by transfer", "credited by", "received from"
]

EXPENSE_KEYWORDS = [
    "vendor", "purchase", "inventory", "stock", "grocery", "bill", "electricity",
    "utility", "water", "gas", "broadband", "recharge", "rent", "fuel", "petrol",
    "diesel", "pos purchase", "atm", "cash wdl", "swiggy", "zomato", "amazon",
    "flipkart", "travel", "uber", "ola", "hotel", "food", "dining", "hardware",
    "maintenance", "repairs", "supplies"
]

LOAN_REPAYMENT_KEYWORDS = [
    "emi", "loan deb", "loan debit", "loan repayment", "nach", "ach debit",
    "auto debit loan", "bajaj", "hdb", "chola", "muthoot", "tvs credit",
    "tatacapital", "l&t finance", "iifl", "credit card payment", "card payment",
    "housing loan", "personal loan debit", "vehicle loan", "installment"
]

INTERNAL_TRANSFER_KEYWORDS = [
    "self transfer", "transfer to self", "transfer from self", "own account", "intra account",
    "sweep in", "sweep out", "auto sweep", "mod balance", "savings to current",
    "current to savings", "transfer to own", "transfer from own", "own savings", "own a/c",
    "self upi", "linked account", "from own"
]

LOAN_DISBURSAL_KEYWORDS = [
    "loan disbursal", "loan disbursed", "disbursement", "loan cr", "loan credit",
    "credit line", "fintech loan", "personal loan cr", "business loan cr",
    "gold loan disbursal", "sanction disbursal"
]

REFUND_KEYWORDS = [
    "refund", "reversal", "chargeback", "cashback", "reward", "rewards",
    "google pay rewards", "gpay rewards", "failed tx refund",
    "dispute return", "cancelled order", "merchant refund", "irctc refund"
]

def classify_single_transaction(
    description: str,
    tx_type: str = "debit",
    amount: float = 0.0
) -> Tuple[str, float, str]:
    """
    Classifies a transaction into one of:
    - 'income' (earned operating income)
    - 'expense' (operating outflow)
    - 'loan_repayment' (debt service)
    - 'internal_transfer' (own account transfer, excluded from income)
    - 'loan_disbursal' (borrowed inflow, excluded from earned income)
    - 'refund' (reversal/cashback, excluded from earned income)
    - 'other' (unclassified)
    
    Returns: (category, confidence, rationale)
    """
    desc = str(description).lower().strip()
    if isinstance(tx_type, (int, float)):
        amount = float(tx_type)
        tx_type = "credit" if amount > 0 else "debit"
    is_credit = (str(tx_type).lower() == "credit") or (amount > 0)
    
    # 1. Internal Transfers (both credit & debit)
    if any(k in desc for k in INTERNAL_TRANSFER_KEYWORDS):
        return ("internal_transfer", 0.95, "Matched internal or own-account transfer pattern")
        
    # 2. Loan Disbursal (inflow)
    if any(k in desc for k in LOAN_DISBURSAL_KEYWORDS):
        return ("loan_disbursal", 0.95, "Identified loan proceeds or debt disbursement (excluded from earned income)")
        
    # 3. Refunds & Reversals (inflow)
    if any(k in desc for k in REFUND_KEYWORDS):
        return ("refund", 0.90, "Identified merchant refund or transaction reversal (excluded from earned income)")
        
    # 4. Debt & Loan Repayments (outflow)
    if any(k in desc for k in LOAN_REPAYMENT_KEYWORDS):
        return ("loan_repayment", 0.90, "Identified loan installment or credit card repayment (debt obligation)")
        
    # 5. Credits: Operating Income vs Other
    if is_credit:
        if any(k in desc for k in INCOME_KEYWORDS):
            return ("income", 0.85, "Matched earned operating revenue or client payment pattern")
        if any(k in desc for k in ["misc", "unknown", "counterparty", "adjustment", "round off"]):
            return ("other", 0.50, "Unclassified credit - uncertain provenance")
        # Default credit without exclusion markers is potential income with moderate confidence
        return ("income", 0.70, "Inflow credit classified as operating receipt")
        
    # 6. Debits: Operating Expenses vs Other
    if not is_credit:
        if any(k in desc for k in EXPENSE_KEYWORDS):
            return ("expense", 0.85, "Matched business operating cost or personal expense pattern")
        return ("expense", 0.70, "Outflow debit classified as operational expenditure")
        
    return ("other", 0.50, "Unclassified transaction")

def classify_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Applies categorization across all rows in a transaction DataFrame.
    Adds 'category', 'category_confidence', and 'is_earned_income' columns.
    Returns categorized DataFrame and comprehensive category breakdown statistics.
    """
    df_cat = df.copy()
    
    if "description" not in df_cat.columns:
        df_cat["description"] = "Transaction"
        
    if "transaction_type" not in df_cat.columns:
        if "amount" in df_cat.columns:
            df_cat["transaction_type"] = np.where(df_cat["amount"] >= 0, "credit", "debit")
        else:
            df_cat["transaction_type"] = "debit"

    categories = []
    confidences = []
    rationales = []
    is_earned_incomes = []

    for _, row in df_cat.iterrows():
        desc = row.get("description", "")
        tx_type = row.get("transaction_type", "debit")
        amt = row.get("amount", 0.0)
        
        cat, conf, rat = classify_single_transaction(desc, tx_type, amt)
        categories.append(cat)
        confidences.append(conf)
        rationales.append(rat)
        
        # Earned income ONLY includes real income, strictly excluding transfers, loans, and refunds
        is_earned = (cat == "income" and tx_type == "credit")
        is_earned_incomes.append(is_earned)

    df_cat["category"] = categories
    df_cat["category_confidence"] = confidences
    df_cat["classification_rationale"] = rationales
    df_cat["is_earned_income"] = is_earned_incomes

    # Aggregate category statistics
    # Categories: income, expense, loan_repayment, internal_transfer, loan_disbursal, refund, other
    summary: Dict[str, Any] = {}
    total_tx = len(df_cat)
    
    for cat_name in ["income", "expense", "loan_repayment", "internal_transfer", "loan_disbursal", "refund", "other"]:
        subset = df_cat[df_cat["category"] == cat_name]
        cnt = len(subset)
        tot_amt = float(subset["amount"].abs().sum()) if cnt > 0 else 0.0
        summary[cat_name] = {
            "count": cnt,
            "total_amount": round(tot_amt, 2),
            "percentage_of_transactions": round((cnt / total_tx) * 100, 1) if total_tx > 0 else 0.0
        }

    return df_cat, summary
