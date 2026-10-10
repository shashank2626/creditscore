import math
from typing import Dict, Any

def calculate_loan_emi(
    principal: float,
    tenure_months: int = 12,
    annual_interest_rate: float = 14.0
) -> float:
    """Standard Reducing Balance EMI Formula."""
    if principal <= 0 or tenure_months <= 0:
        return 0.0
    r = annual_interest_rate / (12 * 100)
    try:
        emi = principal * r * ((1 + r) ** tenure_months) / (((1 + r) ** tenure_months) - 1)
        return round(emi, 2)
    except ZeroDivisionError:
        return round(principal / tenure_months, 2)

def compute_affordability_assessment(
    requested_amount: float,
    tenure_months: int = 12,
    declared_existing_debt: float = 0.0,
    detected_existing_debt_monthly: float = 0.0,
    stable_monthly_cash_flow: float = 0.0,
    gross_earned_income: float = 0.0,
    annual_interest_rate: float = 14.0
) -> Dict[str, Any]:
    """
    Computes comprehensive loan affordability, Fixed Obligation to Income Ratio (FOIR),
    net disposable surplus, and safe borrowing capacity.
    """
    proposed_emi = calculate_loan_emi(requested_amount, tenure_months, annual_interest_rate)
    total_repayment = round(proposed_emi * tenure_months, 2)
    total_interest = round(total_repayment - requested_amount, 2)
    
    # Active monthly debt obligations (higher of declared vs detected)
    active_existing_debt = max(float(declared_existing_debt), float(detected_existing_debt_monthly))
    total_monthly_obligations = round(active_existing_debt + proposed_emi, 2)
    
    # Income baseline for FOIR (earned income or net cash flow fallback)
    income_base = max(gross_earned_income, stable_monthly_cash_flow, 1000.0)
    foir_percentage = round((total_monthly_obligations / income_base) * 100, 1)
    
    # Net disposable surplus after proposed loan installment
    net_disposable_surplus = round(stable_monthly_cash_flow - proposed_emi, 2)
    
    # Debt Service Coverage Ratio (DSCR proxy: cashflow / EMI)
    dscr = round(stable_monthly_cash_flow / max(proposed_emi, 1.0), 2) if proposed_emi > 0 else 2.0
    
    # Safe borrowing capacity (Max loan where FOIR <= 45%)
    max_safe_emi = max(0.0, (income_base * 0.45) - active_existing_debt)
    r = annual_interest_rate / (12 * 100)
    if r > 0 and tenure_months > 0:
        factor = (((1 + r) ** tenure_months) - 1) / (r * ((1 + r) ** tenure_months))
        max_safe_loan = round(max_safe_emi * factor, -2)
    else:
        max_safe_loan = round(max_safe_emi * tenure_months, -2)

    # Affordability Verdict
    if net_disposable_surplus > (proposed_emi * 0.5) and foir_percentage <= 45.0:
        verdict = "Affordable"
        verdict_color = "emerald"
        explanation = "Borrower demonstrates strong net surplus and a conservative debt-burden ratio."
    elif net_disposable_surplus > 0 and foir_percentage <= 60.0:
        verdict = "Moderate Burden"
        verdict_color = "amber"
        explanation = "Repayment is serviceable from net cash flows, but debt obligations consume a significant portion of earnings."
    else:
        verdict = "Stretched / High Risk"
        verdict_color = "rose"
        explanation = "Proposed repayment exceeds safe cash flow limits or results in negative monthly surplus."

    return {
        "requested_amount": requested_amount,
        "tenure_months": tenure_months,
        "annual_interest_rate": annual_interest_rate,
        "proposed_monthly_emi": proposed_emi,
        "total_interest_payable": total_interest,
        "total_repayment_amount": total_repayment,
        "declared_existing_debt_monthly": round(declared_existing_debt, 2),
        "detected_existing_debt_monthly": round(detected_existing_debt_monthly, 2),
        "active_monthly_debt": round(active_existing_debt, 2),
        "total_monthly_debt_burden": total_monthly_obligations,
        "foir_percentage": foir_percentage,
        "net_disposable_surplus": net_disposable_surplus,
        "dscr_ratio": dscr,
        "max_safe_loan_capacity": max(5000.0, max_safe_loan),
        "affordability_verdict": verdict,
        "verdict_color": verdict_color,
        "affordability_rationale": explanation
    }
