import io
import re
import uuid
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import pandas as pd
from pypdf import PdfReader

from app.services.csv_converter import (
    clean_amount_str,
    parse_date_str,
    is_balance_or_summary_row,
    BALANCE_DESCRIPTION_PATTERNS
)
from app.services.transaction_classifier import classify_single_transaction

# Common words to filter out if a line is just table headers
TABLE_HEADER_KEYWORDS = [
    "txn date", "transaction date", "value date", "post date",
    "particulars", "narration", "description", "transaction details",
    "chq no", "cheque", "ref no", "reference",
    "withdrawal", "deposit", "debit", "credit", "balance", "cr/dr", "amount"
]

CREDIT_KEYWORDS = [
    "credit", "deposit", "dep", "inward", "salary", "refund", "reversal",
    "interest", "received", "cr", "by transfer", "upi inward", "neft in", "reward", "cashback"
]

DEBIT_KEYWORDS = [
    "debit", "withdrawal", "wdl", "outward", "atm", "pos", "charge",
    "fee", "bill", "tax", "dr", "to transfer", "upi outward", "neft out", "purchase", "paid"
]

# Month abbreviation mapping
MONTH_MAP = {
    "jan": "01", "january": "01",
    "feb": "02", "february": "02",
    "mar": "03", "march": "03",
    "apr": "04", "april": "04",
    "may": "05",
    "jun": "06", "june": "06",
    "jul": "07", "july": "07",
    "aug": "08", "august": "08",
    "sep": "09", "september": "09",
    "oct": "10", "october": "10",
    "nov": "11", "november": "11",
    "dec": "12", "december": "12"
}

# Regex for dates in bank statements, supporting optional spaces between day and month (e.g. 05May,2026)
DATE_REGEX = re.compile(
    r"\b("
    r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|"
    r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|"
    r"\d{1,2}[-\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]*\d{2,4}|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}"
    r")\b",
    re.IGNORECASE
)

# Currency and amount tokens: e.g. "₹1,250.00", "Rs. 450", "-650.00", "2,450.00 Cr", "(500.00)", "₹40,000"
AMOUNT_TOKEN_REGEX = re.compile(
    r"(?:[-+]?(?:₹|Rs\.?|INR|\$|€|£)?\s*(?:\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:Cr|Dr|\(Cr\)|\(Dr\))?|\(\d+(?:\.\d{1,2})?\))",
    re.IGNORECASE
)

# Google Pay specific date regex: e.g. "05May,2026", "05 May, 2026", "08Jul,2026"
GPAY_DATE_REGEX = re.compile(
    r"^(\d{1,2})\s*([A-Za-z]{3,9})\s*,?\s*(\d{4})$",
    re.IGNORECASE
)

# Time regex: e.g. "08:54PM", "08:54 PM", "01:18PM"
TIME_REGEX = re.compile(
    r"^(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)$",
    re.IGNORECASE
)

# UPI Transaction ID regex: e.g. "UPITransactionID:612567034075", "UPI Ref No: 12345"
UPI_ID_REGEX = re.compile(
    r"(?:UPI\s*(?:Transaction\s*ID|Ref(?:erence)?\s*(?:No|ID)?)|UTR)\s*[:\-]?\s*(\w+)",
    re.IGNORECASE
)

# Standalone amount regex for Google Pay rows: e.g. "₹100", "₹40,000", "₹90,000", "Rs. 15,500"
GPAY_AMOUNT_REGEX = re.compile(
    r"^[-+]?[^\d\-+]*\s*([\d,]+(?:\.\d{1,2})?)$",
    re.IGNORECASE
)

# Statement period regex: e.g. "01April2026-30September2026" or "01 April 2026 - 30 September 2026"
STATEMENT_PERIOD_REGEX = re.compile(
    r"(\d{1,2}\s*[A-Za-z]{3,9}\s*,?\s*\d{4})\s*[-–to]+\s*(\d{1,2}\s*[A-Za-z]{3,9}\s*,?\s*\d{4})",
    re.IGNORECASE
)


def clean_gpay_text(text: str) -> str:
    """Clean and space out concatenated strings common in PDF text extraction."""
    if not text:
        return ""
    # Split camelCase words: e.g. ShashankVasudevaMestha -> Shashank Vasudeva Mestha
    t = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
    # Fix common joined tokens
    t = re.sub(r"(Pay)(rewards)", r"\1 \2", t, flags=re.IGNORECASE)
    t = re.sub(r"(Bank)(\d)", r"\1 \2", t, flags=re.IGNORECASE)
    # Ensure space after Paid/Received prefix
    t = re.sub(r"^(Paid|Received)\s*(to|from|by)\s*", r"\1 \2 ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_date_flexible(val: str) -> Optional[str]:
    """Parse various bank statement date formats into standard YYYY-MM-DD."""
    if not val:
        return None
    val_clean = val.strip()
    
    # Try GPay date regex (e.g. 05May,2026 or 05 May 2026)
    m = GPAY_DATE_REGEX.match(val_clean)
    if m:
        day, mon, yr = m.groups()
        mon_key = mon.lower()[:3]
        mon_num = MONTH_MAP.get(mon_key)
        if mon_num:
            return f"{yr}-{mon_num}-{int(day):02d}"

    # Try standard parse_date_str
    parsed = parse_date_str(val_clean)
    if parsed:
        return parsed

    # Insert spaces between letters and numbers if concatenated (e.g. 05May2026)
    spaced = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2 ", val_clean)
    spaced = re.sub(r"([a-zA-Z]+)(\d+)", r"\1 \2", spaced)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    return parse_date_str(spaced)


def is_header_line(line: str) -> bool:
    """Check if a line is likely a table column header line."""
    line_lower = line.lower().strip()
    matches = sum(1 for kw in TABLE_HEADER_KEYWORDS if kw in line_lower)
    return matches >= 2


def is_page_footer_or_meta(line: str) -> bool:
    """Check if line is pagination or bank disclaimer metadata."""
    line_lower = line.lower().strip()
    if re.search(r"\bpage\s*\d+\s*(?:of|\/)\s*\d+\b", line_lower):
        return True
    if any(m in line_lower for m in [
        "computer generated", "system generated", "confidential",
        "registered office", "customer care", "ifsc code", "micr code",
        "branch code", "nomination registered", "statement of account",
        "statement period", "period of statement", "date range",
        "transaction statement period", "transactionstatementperiod"
    ]):
        return True
    return False


# ==============================================================================
# Google Pay Statement Parser
# ==============================================================================

def is_google_pay_statement(text: str) -> bool:
    """Detect whether the document contains Google Pay statement markers."""
    t_lower = text.lower()
    gpay_indicators = [
        "google pay",
        "gpay",
        "transactionstatement",
        "transaction statement period",
        "upitransactionid:",
        "upi transaction id",
        "paidbysaraswatbank",
        "paid by saraswat bank",
        "paidto",
        "receivedfrom"
    ]
    matches = sum(1 for ind in gpay_indicators if ind in t_lower)
    return matches >= 2


def _extract_google_pay_statement(
    pages_lines: List[Tuple[int, List[str]]],
    filename: str = "statement.pdf"
) -> Optional[Dict[str, Any]]:
    """
    Format-specific parser for Google Pay transaction statements.
    Extracts multi-line transaction blocks containing:
      - Date (e.g. 05May,2026)
      - Time (e.g. 08:54PM)
      - Description (e.g. PaidtoShashankVasudevaMestha, ReceivedfromVASUDEVAP)
      - UPI Transaction ID (e.g. UPITransactionID:612567034075)
      - Bank Details (e.g. PaidbySaraswatBank7942)
      - Amount (e.g. ₹100, ₹40,000)
    Excludes top-level summary totals (Sent/Received summary) and page metadata.
    """
    all_transactions: List[Dict[str, Any]] = []
    warnings: List[str] = []
    
    declared_sent: Optional[float] = None
    declared_received: Optional[float] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None

    # Step 1: Scan for statement period and top-level summary totals
    full_text_first_page = " ".join([l for _, lines in pages_lines[:2] for l in lines])
    
    # Statement period match (e.g. 01April2026-30September2026)
    period_match = STATEMENT_PERIOD_REGEX.search(full_text_first_page)
    if period_match:
        p_start_raw, p_end_raw = period_match.groups()
        period_start = parse_date_flexible(p_start_raw)
        period_end = parse_date_flexible(p_end_raw)

    # Search for summary Sent and Received lines
    for p_idx, lines in pages_lines[:2]:
        for idx, line in enumerate(lines):
            line_clean = line.strip().lower()
            if line_clean == "sent" and idx + 1 < len(lines):
                amt_m = GPAY_AMOUNT_REGEX.match(lines[idx + 1])
                if amt_m:
                    try:
                        declared_sent = float(amt_m.group(1).replace(",", ""))
                    except ValueError:
                        pass
            elif line_clean == "received" and idx + 1 < len(lines):
                amt_m = GPAY_AMOUNT_REGEX.match(lines[idx + 1])
                if amt_m:
                    try:
                        declared_received = float(amt_m.group(1).replace(",", ""))
                    except ValueError:
                        pass

    # Step 2: Parse transactions page by page
    for page_num, lines in pages_lines:
        i = 0
        n = len(lines)
        while i < n:
            line = lines[i]

            # Check if this line is a Google Pay date
            date_match = GPAY_DATE_REGEX.match(line)
            if not date_match:
                i += 1
                continue

            # Found a transaction date anchor
            raw_date_str = line
            iso_date = parse_date_flexible(raw_date_str)

            time_str = ""
            desc_raw = ""
            upi_id = ""
            bank_detail = ""
            raw_amt_str = ""
            amt_num = 0.0

            j = i + 1
            # Scan subsequent lines for time, description, UPI ID, bank info, and amount
            while j < n and not GPAY_DATE_REGEX.match(lines[j]) and (j - i) <= 8:
                sub_line = lines[j].strip()
                sub_lower = sub_line.lower()

                # Check for time line
                if TIME_REGEX.match(sub_line) and not time_str:
                    time_str = clean_gpay_text(sub_line)

                # Check for UPI Transaction ID
                elif UPI_ID_REGEX.search(sub_line):
                    upi_m = UPI_ID_REGEX.search(sub_line)
                    if upi_m:
                        upi_id = upi_m.group(1)

                # Check for bank account reference
                elif ("paidby" in sub_lower or "paid by" in sub_lower or 
                      ("paidto" in sub_lower and any(w in sub_lower for w in ["bank", "a/c", "account", "wallet"])) or
                      ("paid to" in sub_lower and any(w in sub_lower for w in ["bank", "a/c", "account", "wallet"]))):
                    bank_detail = clean_gpay_text(sub_line)

                # Check for Amount line (usually terminates the block)
                elif GPAY_AMOUNT_REGEX.match(sub_line):
                    raw_amt_str = sub_line
                    num_cleaned = GPAY_AMOUNT_REGEX.match(sub_line).group(1).replace(",", "")
                    try:
                        amt_num = float(num_cleaned)
                    except ValueError:
                        amt_num = 0.0
                    j += 1
                    break

                # Otherwise description line
                elif not desc_raw:
                    desc_raw = sub_line
                else:
                    # Append secondary description if it's not metadata
                    if not any(k in sub_lower for k in ["transactionstatement", "note:", "page"]):
                        desc_raw = f"{desc_raw} {sub_line}".strip()

                j += 1

            # Advance outer pointer
            i = j

            if amt_num <= 0.0001:
                # No valid amount found for this block
                continue

            # Determine polarity and clean description
            desc_lower = desc_raw.lower()
            is_credit = False
            counterparty = ""

            if desc_lower.startswith(("receivedfrom", "received from")):
                is_credit = True
                raw_counterparty = re.sub(r"^received\s*from\s*", "", desc_raw, flags=re.IGNORECASE).strip()
                counterparty = clean_gpay_text(raw_counterparty)
                clean_desc = f"Received from {counterparty}"
            elif desc_lower.startswith(("paidto", "paid to")):
                is_credit = False
                raw_counterparty = re.sub(r"^paid\s*to\s*", "", desc_raw, flags=re.IGNORECASE).strip()
                counterparty = clean_gpay_text(raw_counterparty)
                clean_desc = f"Paid to {counterparty}"
            else:
                # Fallback keyword inspection
                if any(k in desc_lower for k in CREDIT_KEYWORDS):
                    is_credit = True
                elif any(k in desc_lower for k in DEBIT_KEYWORDS):
                    is_credit = False
                else:
                    is_credit = False
                clean_desc = clean_gpay_text(desc_raw)
                counterparty = clean_desc

            polarity = "credit" if is_credit else "debit"
            signed_amount = amt_num if is_credit else -amt_num

            # Classify transaction
            cat, cat_conf, cat_rat = classify_single_transaction(clean_desc, polarity, signed_amount)

            # Build normalized transaction record
            record = {
                "id": f"tx_{uuid.uuid4().hex[:8]}",
                "original_row": f"Page {page_num}",
                "raw_text": f"{raw_date_str} {time_str} {desc_raw} {raw_amt_str}".strip(),
                "transaction_date": iso_date or raw_date_str,
                "time": time_str,
                "description": clean_desc,
                "counterparty": counterparty,
                "transaction_id": upi_id,
                "bank_detail": bank_detail,
                "source": "Google Pay Statement",
                "category": cat,
                "category_confidence": cat_conf,
                "classification_rationale": cat_rat,
                "raw_amount": raw_amt_str,
                "amount": round(signed_amount, 2),
                "type": polarity,
                "transaction_type": polarity,
                "status": "valid" if iso_date else "needs_review",
                "review_reason": None if iso_date else f"Date '{raw_date_str}' could not be unambiguously verified.",
                "page": page_num
            }
            all_transactions.append(record)

    if not all_transactions:
        return None

    # Deduplicate transactions using reliable identifier (UPI ID) or (date, amount, desc)
    seen_ids = set()
    seen_fingerprints = set()
    dup_count = 0
    unique_records = []

    for tx in all_transactions:
        is_dup = False
        if tx.get("transaction_id"):
            if tx["transaction_id"] in seen_ids:
                is_dup = True
            else:
                seen_ids.add(tx["transaction_id"])
        else:
            fingerprint = (tx["transaction_date"], tx["amount"], tx["description"])
            if fingerprint in seen_fingerprints:
                is_dup = True
            else:
                seen_fingerprints.add(fingerprint)

        if is_dup:
            dup_count += 1
        else:
            unique_records.append(tx)

    if dup_count > 0:
        warnings.append(f"{dup_count} duplicate Google Pay transactions were detected and filtered.")

    # Reconcile with declared totals
    valid_txs = [r for r in unique_records if r["status"] == "valid"]
    actual_credits = round(sum(r["amount"] for r in valid_txs if r["amount"] > 0), 2)
    actual_debits = round(sum(abs(r["amount"]) for r in valid_txs if r["amount"] < 0), 2)

    is_reconciled = None
    if declared_sent is not None and declared_received is not None:
        is_reconciled = (
            abs(actual_debits - declared_sent) < 0.01 and
            abs(actual_credits - declared_received) < 0.01
        )
        if is_reconciled:
            warnings.append(
                f"Full Reconciliation Verified: Extracted debits (₹{actual_debits:,.2f}) and credits (₹{actual_credits:,.2f}) match statement summary exactly."
            )
        else:
            warnings.append(
                f"Reconciliation Note: Extracted debits ₹{actual_debits:,.2f} (summary: ₹{declared_sent:,.2f}), credits ₹{actual_credits:,.2f} (summary: ₹{declared_received:,.2f})."
            )

    # Coverage period calculation
    valid_dates = []
    for r in valid_txs:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", r["transaction_date"]):
            try:
                valid_dates.append(datetime.strptime(r["transaction_date"], "%Y-%m-%d"))
            except ValueError:
                pass

    cov_start = period_start or ""
    cov_end = period_end or ""
    cov_months = 0.0

    if valid_dates:
        valid_dates.sort()
        if not cov_start:
            cov_start = valid_dates[0].strftime("%Y-%m-%d")
        if not cov_end:
            cov_end = valid_dates[-1].strftime("%Y-%m-%d")

    if cov_start and cov_end:
        try:
            s_dt = datetime.strptime(cov_start, "%Y-%m-%d")
            e_dt = datetime.strptime(cov_end, "%Y-%m-%d")
            cov_months = round((e_dt - s_dt).days / 30.4375, 1)
            if cov_months < 1.0:
                cov_months = 1.0
        except ValueError:
            cov_months = 1.0

    summary = {
        "filename": filename,
        "format_detected": "Google Pay Statement",
        "total_pages": len(pages_lines),
        "total_rows_extracted": len(unique_records),
        "valid_rows_count": len(valid_txs),
        "needs_review_count": sum(1 for r in unique_records if r["status"] == "needs_review"),
        "invalid_rows_count": sum(1 for r in unique_records if r["status"] == "invalid"),
        "skipped_balance_rows_count": 0,
        "duplicate_count": dup_count,
        "coverage_start_date": cov_start,
        "coverage_end_date": cov_end,
        "coverage_months": cov_months,
        "total_credits": actual_credits,
        "total_debits": actual_debits,
        "declared_summary_totals": {
            "sent": declared_sent,
            "received": declared_received
        },
        "is_reconciled": is_reconciled
    }

    return {
        "success": True,
        "filename": filename,
        "transactions": unique_records,
        "summary": summary,
        "warnings": warnings,
        "confirmation_rules": "Credits are positive (+), debits are negative (-). Sorted ascending by date."
    }


# ==============================================================================
# Tabular Bank Statement Parser (SBI, HDFC, ICICI, Axis, etc.)
# ==============================================================================

def _extract_tabular_statement(
    raw_lines: List[Tuple[int, int, str]],
    total_pages: int,
    filename: str = "statement.pdf"
) -> Optional[Dict[str, Any]]:
    """
    Parser for standard tabular bank statements where dates, descriptions,
    and amounts appear on a single line or adjacent table rows.
    """
    extracted_records: List[Dict[str, Any]] = []
    skipped_balance_count = 0
    warnings: List[str] = []

    i = 0
    n = len(raw_lines)

    while i < n:
        page_num, line_num, line = raw_lines[i]
        i += 1

        # Check headers and metadata
        if is_header_line(line) or is_page_footer_or_meta(line):
            continue

        # Check balance and summary rows
        if is_balance_or_summary_row(line):
            skipped_balance_count += 1
            continue

        # Check for date in the line
        date_match = DATE_REGEX.search(line)
        if not date_match:
            # If previous transaction exists, check if this is an overflowing description
            if extracted_records:
                last_rec = extracted_records[-1]
                if not re.search(r"\d{3,}", line) and len(line) < 120:
                    last_rec["description"] = f"{last_rec['description']} {line}".strip()
            continue

        raw_date_str = date_match.group(1)
        iso_date = parse_date_flexible(raw_date_str)

        # Extract amount tokens from the line
        remainder = line[date_match.end():].strip()
        if not remainder:
            remainder = line

        num_matches = [m.group(0).strip() for m in AMOUNT_TOKEN_REGEX.finditer(remainder)]

        valid_amt_tokens = []
        for token in num_matches:
            val = clean_amount_str(token)
            if val is not None and abs(val) > 0.0001:
                valid_amt_tokens.append((token, val))

        if not valid_amt_tokens:
            if len(line.split()) >= 3:
                extracted_records.append({
                    "id": f"tx_{uuid.uuid4().hex[:8]}",
                    "original_row": f"Page {page_num}, Line {line_num}",
                    "raw_text": line,
                    "transaction_date": iso_date or raw_date_str,
                    "description": remainder or line,
                    "counterparty": "",
                    "transaction_id": "",
                    "source": "Bank Statement PDF",
                    "raw_amount": "",
                    "amount": 0.0,
                    "type": "debit",
                    "transaction_type": "debit",
                    "status": "invalid",
                    "review_reason": "No valid numeric transaction amount found on this line.",
                    "page": page_num
                })
            continue

        # Determine transaction amount vs running balance:
        # If 2 amounts: [Transaction Amount, Running Balance]
        # If 1 amount: [Transaction Amount]
        tx_token, tx_val = valid_amt_tokens[0]

        # Determine credit vs debit polarity
        line_lower = line.lower()
        polarity: Optional[str] = None

        if re.search(r"\b(cr|credit|deposit)\b", tx_token.lower()) or " cr" in line_lower:
            polarity = "credit"
        elif re.search(r"\b(dr|debit|wdl|withdrawal)\b", tx_token.lower()) or " dr" in line_lower:
            polarity = "debit"
        elif tx_token.startswith("+") or (tx_val is not None and tx_val > 0 and "+" in tx_token):
            polarity = "credit"
        elif tx_token.startswith("-") or tx_token.startswith("(") or (tx_val is not None and tx_val < 0):
            polarity = "debit"
        elif any(ckw in line_lower for ckw in CREDIT_KEYWORDS):
            polarity = "credit"
        elif any(dkw in line_lower for dkw in DEBIT_KEYWORDS):
            polarity = "debit"

        # Determine status and review requirements
        status = "valid"
        review_reason = None

        if not iso_date:
            status = "needs_review"
            review_reason = f"Date '{raw_date_str}' is ambiguous or unverified. Please confirm YYYY-MM-DD."
        elif polarity is None:
            status = "needs_review"
            review_reason = "Ambiguous credit/debit direction. Please specify if this transaction is Credit (+) or Debit (-)."
            polarity = "debit"
        elif tx_val is None or tx_val == 0.0:
            status = "invalid"
            review_reason = "Transaction amount is zero or unparseable."

        final_amount = 0.0
        if tx_val is not None:
            abs_val = abs(tx_val)
            final_amount = abs_val if polarity == "credit" else -abs_val

        # Extract description: remove date and amount tokens from line
        desc = remainder
        for tok, _ in valid_amt_tokens:
            desc = desc.replace(tok, " ")
        desc = re.sub(r"\s+", " ", desc).strip()
        if not desc:
            desc = "Bank Transaction"

        cat, cat_conf, cat_rat = classify_single_transaction(desc, polarity or "debit", final_amount)

        extracted_records.append({
            "id": f"tx_{uuid.uuid4().hex[:8]}",
            "original_row": f"Page {page_num}, Line {line_num}",
            "raw_text": line,
            "transaction_date": iso_date or raw_date_str,
            "description": desc,
            "counterparty": "",
            "transaction_id": "",
            "source": "Bank Statement PDF",
            "category": cat,
            "category_confidence": cat_conf,
            "classification_rationale": cat_rat,
            "raw_amount": tx_token,
            "amount": round(final_amount, 2),
            "type": polarity or "debit",
            "transaction_type": polarity or "debit",
            "status": status,
            "review_reason": review_reason,
            "page": page_num
        })

    if not extracted_records:
        return None

    # Deduplication
    seen_keys = set()
    dup_count = 0
    for r in extracted_records:
        if r["status"] == "valid":
            key = (r["transaction_date"], r["amount"], r["description"])
            if key in seen_keys:
                dup_count += 1
            else:
                seen_keys.add(key)

    if dup_count > 0:
        warnings.append(f"{dup_count} potential duplicate transactions were found in the statement.")

    if skipped_balance_count > 0:
        warnings.append(f"{skipped_balance_count} opening/closing balance or summary rows were safely excluded.")

    valid_dates = []
    for r in extracted_records:
        if r["status"] == "valid" and re.match(r"^\d{4}-\d{2}-\d{2}$", r["transaction_date"]):
            try:
                valid_dates.append(datetime.strptime(r["transaction_date"], "%Y-%m-%d"))
            except ValueError:
                pass

    coverage_start = ""
    coverage_end = ""
    coverage_months = 0.0

    if valid_dates:
        valid_dates.sort()
        start_dt = valid_dates[0]
        end_dt = valid_dates[-1]
        coverage_start = start_dt.strftime("%Y-%m-%d")
        coverage_end = end_dt.strftime("%Y-%m-%d")
        coverage_months = round((end_dt - start_dt).days / 30.4375, 1)
        if coverage_months < 1.0:
            coverage_months = 1.0

    valid_count = sum(1 for r in extracted_records if r["status"] == "valid")
    needs_review_count = sum(1 for r in extracted_records if r["status"] == "needs_review")
    invalid_count = sum(1 for r in extracted_records if r["status"] == "invalid")

    total_credits = sum(r["amount"] for r in extracted_records if r["status"] == "valid" and r["amount"] > 0)
    total_debits = sum(abs(r["amount"]) for r in extracted_records if r["status"] == "valid" and r["amount"] < 0)

    summary = {
        "filename": filename,
        "format_detected": "Tabular Commercial Bank Statement",
        "total_pages": total_pages,
        "total_rows_extracted": len(extracted_records),
        "valid_rows_count": valid_count,
        "needs_review_count": needs_review_count,
        "invalid_rows_count": invalid_count,
        "skipped_balance_rows_count": skipped_balance_count,
        "duplicate_count": dup_count,
        "coverage_start_date": coverage_start,
        "coverage_end_date": coverage_end,
        "coverage_months": coverage_months,
        "total_credits": round(total_credits, 2),
        "total_debits": round(total_debits, 2)
    }

    return {
        "success": True,
        "filename": filename,
        "transactions": extracted_records,
        "summary": summary,
        "warnings": warnings,
        "confirmation_rules": "Credits are positive (+), debits are negative (-). Sorted ascending by date."
    }


# ==============================================================================
# Multi-line Fallback Statement Parser
# ==============================================================================

def _extract_multiline_statement(
    pages_lines: List[Tuple[int, List[str]]],
    filename: str = "statement.pdf"
) -> Optional[Dict[str, Any]]:
    """
    Fallback parser for statements where date, description, and amount
    are split across consecutive lines without tabular alignment.
    """
    extracted_records: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for page_num, lines in pages_lines:
        i = 0
        n = len(lines)
        while i < n:
            line = lines[i]

            # Look for line with a date
            date_match = DATE_REGEX.search(line)
            if not date_match:
                i += 1
                continue

            raw_date_str = date_match.group(1)
            iso_date = parse_date_flexible(raw_date_str)

            # Look ahead across next lines for description and amount
            block_lines = [line]
            j = i + 1
            amt_token = None
            amt_val = None

            while j < n and (j - i) <= 6:
                next_line = lines[j]
                if is_header_line(next_line) or is_page_footer_or_meta(next_line):
                    j += 1
                    continue
                if DATE_REGEX.search(next_line) and j != i:
                    break

                # Check if this line has an amount
                num_matches = [m.group(0).strip() for m in AMOUNT_TOKEN_REGEX.finditer(next_line)]
                for tok in num_matches:
                    val = clean_amount_str(tok)
                    if val is not None and abs(val) > 0.0001:
                        amt_token = tok
                        amt_val = val
                        break

                block_lines.append(next_line)
                if amt_val is not None:
                    j += 1
                    break
                j += 1

            i = j

            if amt_val is None or abs(amt_val) <= 0.0001:
                continue

            # Combine non-amount text into description
            full_block_text = " ".join(block_lines)
            desc_text = full_block_text.replace(raw_date_str, "").replace(amt_token or "", "")
            desc_text = re.sub(r"\s+", " ", desc_text).strip()
            if not desc_text:
                desc_text = "Account Transaction"

            # Determine polarity
            block_lower = full_block_text.lower()
            polarity: Optional[str] = None
            if "cr" in block_lower or any(ckw in block_lower for ckw in CREDIT_KEYWORDS):
                polarity = "credit"
            elif "dr" in block_lower or any(dkw in block_lower for dkw in DEBIT_KEYWORDS):
                polarity = "debit"

            status = "valid"
            review_reason = None
            if polarity is None:
                polarity = "debit"
                status = "needs_review"
                review_reason = "Ambiguous transaction direction. Please confirm Credit (+) or Debit (-)."

            signed_amt = abs(amt_val) if polarity == "credit" else -abs(amt_val)
            cat, cat_conf, cat_rat = classify_single_transaction(desc_text, polarity, signed_amt)

            extracted_records.append({
                "id": f"tx_{uuid.uuid4().hex[:8]}",
                "original_row": f"Page {page_num}",
                "raw_text": full_block_text,
                "transaction_date": iso_date or raw_date_str,
                "description": desc_text,
                "counterparty": "",
                "transaction_id": "",
                "source": "Bank Statement PDF",
                "category": cat,
                "category_confidence": cat_conf,
                "classification_rationale": cat_rat,
                "raw_amount": amt_token or "",
                "amount": round(signed_amt, 2),
                "type": polarity,
                "transaction_type": polarity,
                "status": status,
                "review_reason": review_reason,
                "page": page_num
            })

    if not extracted_records:
        return None

    valid_dates = []
    for r in extracted_records:
        if r["status"] == "valid" and re.match(r"^\d{4}-\d{2}-\d{2}$", r["transaction_date"]):
            try:
                valid_dates.append(datetime.strptime(r["transaction_date"], "%Y-%m-%d"))
            except ValueError:
                pass

    coverage_start = ""
    coverage_end = ""
    coverage_months = 0.0

    if valid_dates:
        valid_dates.sort()
        start_dt = valid_dates[0]
        end_dt = valid_dates[-1]
        coverage_start = start_dt.strftime("%Y-%m-%d")
        coverage_end = end_dt.strftime("%Y-%m-%d")
        coverage_months = round((end_dt - start_dt).days / 30.4375, 1)
        if coverage_months < 1.0:
            coverage_months = 1.0

    valid_count = sum(1 for r in extracted_records if r["status"] == "valid")
    needs_review_count = sum(1 for r in extracted_records if r["status"] == "needs_review")
    invalid_count = sum(1 for r in extracted_records if r["status"] == "invalid")

    total_credits = sum(r["amount"] for r in extracted_records if r["status"] == "valid" and r["amount"] > 0)
    total_debits = sum(abs(r["amount"]) for r in extracted_records if r["status"] == "valid" and r["amount"] < 0)

    summary = {
        "filename": filename,
        "format_detected": "Structured Multi-line Bank Statement",
        "total_pages": len(pages_lines),
        "total_rows_extracted": len(extracted_records),
        "valid_rows_count": valid_count,
        "needs_review_count": needs_review_count,
        "invalid_rows_count": invalid_count,
        "skipped_balance_rows_count": 0,
        "duplicate_count": 0,
        "coverage_start_date": coverage_start,
        "coverage_end_date": coverage_end,
        "coverage_months": coverage_months,
        "total_credits": round(total_credits, 2),
        "total_debits": round(total_debits, 2)
    }

    return {
        "success": True,
        "filename": filename,
        "transactions": extracted_records,
        "summary": summary,
        "warnings": warnings,
        "confirmation_rules": "Credits are positive (+), debits are negative (-). Sorted ascending by date."
    }


# ==============================================================================
# Layered Extraction Controller
# ==============================================================================

def extract_transactions_from_pdf(
    pdf_bytes: bytes,
    filename: str = "statement.pdf"
) -> Dict[str, Any]:
    """
    Extract bank transaction rows from multi-page PDF statements using a
    layered extraction pipeline:
      1. Text layer extraction via pypdf.
      2. Specialized Google Pay (GPay) UPI statement parser.
      3. Tabular commercial bank statement parser (SBI, HDFC, ICICI, Axis).
      4. Structured multi-line fallback parser.
      5. Informative error diagnostics for scanned / image-only or unsupported PDFs.
    """
    if not pdf_bytes or len(pdf_bytes) == 0:
        return {
            "success": False,
            "error": "The uploaded PDF file is empty.",
            "transactions": [],
            "summary": {},
            "warnings": ["Uploaded file is empty."]
        }

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to read PDF file: {str(e)}. The document may be corrupted or password-protected.",
            "transactions": [],
            "summary": {},
            "warnings": [f"Corrupt or unreadable PDF: {str(e)}"]
        }

    total_pages = len(reader.pages)
    if total_pages == 0:
        return {
            "success": False,
            "error": "The PDF statement contains no pages.",
            "transactions": [],
            "summary": {},
            "warnings": ["PDF has 0 pages."]
        }

    all_raw_lines: List[Tuple[int, int, str]] = []
    pages_lines: List[Tuple[int, List[str]]] = []
    total_extracted_chars = 0
    full_document_text = ""

    for page_idx, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""

        page_clean = page_text.strip()
        total_extracted_chars += len(page_clean)
        full_document_text += " " + page_clean

        if page_clean:
            lines = [l.strip() for l in page_text.splitlines() if l.strip()]
            pages_lines.append((page_idx, lines))
            for line_idx, line in enumerate(lines, start=1):
                all_raw_lines.append((page_idx, line_idx, line))
        else:
            pages_lines.append((page_idx, []))

    # Diagnostic check for scanned or image-only documents
    if total_extracted_chars < 30 or len(all_raw_lines) == 0:
        return {
            "success": False,
            "error": "This PDF appears to be a scanned image or document without an embedded text layer. Scanned documents require an OCR layer. Please upload a digital bank statement PDF with selectable text.",
            "transactions": [],
            "summary": {
                "total_pages": total_pages,
                "is_scanned": True
            },
            "warnings": ["No selectable embedded text layer detected across all pages."]
        }

    # Layer 1: Google Pay Parser
    if is_google_pay_statement(full_document_text):
        gpay_result = _extract_google_pay_statement(pages_lines, filename=filename)
        if gpay_result and gpay_result.get("success") and len(gpay_result.get("transactions", [])) > 0:
            return gpay_result

    # Layer 2: Tabular Bank Statement Parser (SBI, HDFC, ICICI, Axis)
    tabular_result = _extract_tabular_statement(all_raw_lines, total_pages=total_pages, filename=filename)
    if tabular_result and tabular_result.get("success") and len(tabular_result.get("transactions", [])) > 0:
        return tabular_result

    # Layer 3: Multi-line Fallback Parser
    multiline_result = _extract_multiline_statement(pages_lines, filename=filename)
    if multiline_result and multiline_result.get("success") and len(multiline_result.get("transactions", [])) > 0:
        return multiline_result

    # Layer 4: If all parsers produced 0 transactions from readable text
    return {
        "success": False,
        "error": "The PDF contains readable text, but its transaction layout is not yet supported. Please review the statement format or convert using standard CSV.",
        "transactions": [],
        "summary": {
            "total_pages": total_pages,
            "has_text": True
        },
        "warnings": ["The document has selectable text, but no supported statement layout patterns matched."]
    }


# ==============================================================================
# CSV Standardization & Export
# ==============================================================================

def convert_reviewed_transactions_to_csv(
    transactions: List[Dict[str, Any]],
    include_details: bool = False
) -> Dict[str, Any]:
    """
    Takes reviewed/validated transactions from frontend and compiles them into
    the canonical credit scoring CSV.
    By default outputs 2 columns: transaction_date,amount.
    Ensures dates are YYYY-MM-DD, amounts are signed numeric, sorted ascending.
    """
    valid_txs = []
    skipped_items = []

    for tx in transactions:
        status = tx.get("status", "valid")
        if status not in ["valid", "approved"]:
            skipped_items.append(tx)
            continue

        raw_date = str(tx.get("transaction_date", "")).strip()
        iso_date = parse_date_flexible(raw_date) or raw_date

        if not re.match(r"^\d{4}-\d{2}-\d{2}$", iso_date):
            skipped_items.append(tx)
            continue

        # Extract amount and ensure sign corresponds to type
        tx_type = str(tx.get("type") or tx.get("transaction_type") or "debit").lower().strip()
        raw_amt = tx.get("amount", 0.0)
        try:
            amt_num = float(raw_amt)
        except (ValueError, TypeError):
            skipped_items.append(tx)
            continue

        if abs(amt_num) < 0.0001:
            skipped_items.append(tx)
            continue

        # Enforce polarity: credit positive, debit negative
        if tx_type == "credit":
            final_amt = abs(amt_num)
        else:
            final_amt = -abs(amt_num)

        valid_txs.append({
            "transaction_date": iso_date,
            "amount": final_amt,
            "description": str(tx.get("description", "")).strip(),
            "transaction_type": tx_type,
            "transaction_id": str(tx.get("transaction_id", "")).strip(),
            "counterparty": str(tx.get("counterparty", "")).strip()
        })

    if not valid_txs:
        return {
            "success": False,
            "error": "No valid transactions to convert into CSV.",
            "csv_content": "",
            "row_count": 0
        }

    # Sort ascending by date
    valid_txs.sort(key=lambda x: x["transaction_date"])

    output = io.StringIO()
    if include_details:
        output.write("transaction_date,amount,description,transaction_type,transaction_id,counterparty\n")
        for tx in valid_txs:
            desc_clean = tx["description"].replace('"', '""')
            output.write(f'{tx["transaction_date"]},{tx["amount"]:.2f},"{desc_clean}",{tx["transaction_type"]},{tx["transaction_id"]},"{tx["counterparty"]}"\n')
    else:
        output.write("transaction_date,amount\n")
        for tx in valid_txs:
            output.write(f"{tx['transaction_date']},{tx['amount']:.2f}\n")

    csv_text = output.getvalue()

    return {
        "success": True,
        "csv_content": csv_text,
        "row_count": len(valid_txs),
        "skipped_count": len(skipped_items)
    }
