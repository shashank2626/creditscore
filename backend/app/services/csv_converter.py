import io
import re
import csv
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

DATE_CANDIDATES = [
    "transaction_date", "transaction date", "txn_date", "txn date", "date",
    "value_date", "value date", "posting_date", "posting date", "trans_date", "trans date"
]

AMOUNT_CANDIDATES = [
    "amount", "transaction_amount", "transaction amount", "txn_amount", "txn amount",
    "trans_amount", "trans amount", "net_amount", "net amount"
]

CREDIT_CANDIDATES = [
    "credit", "credit_amount", "credit amount", "deposit", "deposit_amount", "deposit amount",
    "cr", "cr_amount", "cr amount", "deposit (cr)", "credit (inr)", "credits"
]

DEBIT_CANDIDATES = [
    "debit", "debit_amount", "debit amount", "withdrawal", "withdrawal_amount", "withdrawal amount",
    "dr", "dr_amount", "dr amount", "withdrawal (dr)", "debit (inr)", "debits"
]

TYPE_CANDIDATES = [
    "transaction_type", "transaction type", "type", "txn_type", "txn type",
    "cr/dr", "cr_dr", "d/c", "indicator"
]

DESCRIPTION_CANDIDATES = [
    "description", "narration", "transaction_details", "transaction details",
    "particulars", "remarks", "details", "memo"
]

BALANCE_DESCRIPTION_PATTERNS = [
    r"\bopening\s+balance\b",
    r"\bclosing\s+balance\b",
    r"\bbalance\s+b/?f\b",
    r"\bbalance\s+c/?f\b",
    r"\bbrought\s+forward\b",
    r"\bcarried\s+forward\b",
    r"\btotal\b",
    r"\bsummary\b"
]

def normalize_header(header: str) -> str:
    """Normalize column header for matching: lowercase, strip, remove harmless punctuation."""
    cleaned = re.sub(r"[_\-\/\(\)]", " ", str(header).lower())
    return " ".join(cleaned.split())

def clean_amount_str(val: Any) -> Optional[float]:
    """Parse amount strings with currency symbols (INR ₹, $, etc.), commas, and signs."""
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in ["nan", "none", "-", "null", "nil"]:
        return None
    
    # Check for trailing or leading Cr/Dr indicators e.g. "500 Cr", "500 Dr"
    is_dr = False
    is_cr = False
    if re.search(r"\b(dr|debit)\b", s, re.IGNORECASE):
        is_dr = True
    elif re.search(r"\b(cr|credit)\b", s, re.IGNORECASE):
        is_cr = True

    # Check parentheses for negative: e.g. (1,250.00)
    is_paren_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_paren_negative = True
        s = s[1:-1]

    # Remove currency symbols (₹, Rs., INR, $, €, £), commas, whitespace, parentheses, and Cr/Dr text
    cleaned = re.sub(r"[₹\$\€\£\s\(\)]|rs\.?|inr|\b(cr|dr|credit|debit)\b", "", s, flags=re.IGNORECASE)
    cleaned = cleaned.replace(",", "").strip()

    try:
        amt = float(cleaned)
        if is_paren_negative:
            amt = -abs(amt)
        elif is_dr:
            amt = -abs(amt)
        elif is_cr:
            amt = abs(amt)
        return amt
    except ValueError:
        return None

def parse_date_str(val: Any) -> Optional[str]:
    """Parse date strings into YYYY-MM-DD. Rejects ambiguous or invalid values."""
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in ["nan", "none", "-", "null"]:
        return None

    # Common date formats
    date_formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        "%m/%d/%Y",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S"
    ]

    for fmt in date_formats:
        try:
            dt = datetime.strptime(s, fmt)
            # Sanity check: reasonable year range for bank transactions
            if 1990 <= dt.year <= 2100:
                return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Fallback to dateutil or pandas parse if unambiguous
    try:
        dt = pd.to_datetime(s, dayfirst=True, errors="raise")
        if 1990 <= dt.year <= 2100:
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    return None

def is_balance_or_summary_row(row_desc: str) -> bool:
    """Detect opening balance, closing balance, summary, or total rows."""
    if not row_desc:
        return False
    desc_lower = str(row_desc).lower()
    for pat in BALANCE_DESCRIPTION_PATTERNS:
        if re.search(pat, desc_lower):
            return True
    return False

def detect_column_mappings(df_or_data: Any) -> Dict[str, Any]:
    """Automatically detect column mapping from DataFrame headers, string, or bytes."""
    if isinstance(df_or_data, (bytes, str)):
        if isinstance(df_or_data, str):
            text = df_or_data
        else:
            try:
                text = df_or_data.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = df_or_data.decode("latin-1")
        try:
            df = pd.read_csv(io.StringIO(text), nrows=20)
        except Exception:
            return {
                "detected": {
                    "date_col": None,
                    "amount_col": None,
                    "credit_col": None,
                    "debit_col": None,
                    "type_col": None,
                    "description_col": None
                },
                "confidence": "Low",
                "available_columns": [],
                "detection_notes": ["Could not parse CSV data."]
            }
    else:
        df = df_or_data

    original_cols = list(df.columns)
    normalized = {col: normalize_header(col) for col in original_cols}
    
    detected: Dict[str, Optional[str]] = {
        "date_col": None,
        "amount_col": None,
        "credit_col": None,
        "debit_col": None,
        "type_col": None,
        "description_col": None
    }
    
    confidence = "Low"

    # 1. Detect Date Column
    for orig, norm in normalized.items():
        if norm in DATE_CANDIDATES or any(c in norm for c in ["date"]):
            detected["date_col"] = orig
            break

    # 2. Detect Separate Credit and Debit Columns
    for orig, norm in normalized.items():
        if norm in CREDIT_CANDIDATES or any(c == norm for c in ["credit", "deposit", "cr"]):
            detected["credit_col"] = orig
        elif norm in DEBIT_CANDIDATES or any(c == norm for c in ["debit", "withdrawal", "dr"]):
            detected["debit_col"] = orig

    # 3. Detect Single Amount Column if separate credit/debit not fully found
    if not (detected["credit_col"] and detected["debit_col"]):
        for orig, norm in normalized.items():
            if norm in AMOUNT_CANDIDATES or ("amount" in norm and norm not in CREDIT_CANDIDATES and norm not in DEBIT_CANDIDATES):
                detected["amount_col"] = orig
                break

    # 4. Detect Type Column
    for orig, norm in normalized.items():
        if norm in TYPE_CANDIDATES or "type" in norm:
            detected["type_col"] = orig
            break

    # 5. Detect Description Column
    for orig, norm in normalized.items():
        if norm in DESCRIPTION_CANDIDATES or any(c in norm for c in ["narration", "particulars", "remarks"]):
            detected["description_col"] = orig
            break

    # Assess confidence
    has_date = detected["date_col"] is not None
    has_amounts = (detected["credit_col"] and detected["debit_col"]) or (detected["amount_col"] is not None)
    
    if has_date and has_amounts:
        confidence = "High"
    elif has_date or has_amounts:
        confidence = "Medium"
    else:
        confidence = "Low"

    return {
        "detected": detected,
        "confidence": confidence,
        "available_columns": original_cols
    }

def convert_bank_csv(
    file_content: Any,
    mapping_overrides: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """Convert raw bank transaction CSV into standardized 2-column format (transaction_date,amount)."""
    
    # 1. Parse CSV Content safely
    if isinstance(file_content, str):
        text = file_content
    elif isinstance(file_content, bytes):
        try:
            # Try UTF-8 with BOM or standard UTF-8/Latin1
            text = file_content.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = file_content.decode("latin-1")
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Encoding error reading CSV file: {str(e)}",
                    "converted_csv": "",
                    "valid_rows": 0,
                    "invalid_rows": 0,
                    "skipped_rows": 0,
                    "skipped_balance_rows": 0,
                    "warnings": ["File encoding could not be decoded as UTF-8 or Latin-1."]
                }
    else:
        text = str(file_content)

    if not text.strip():
        return {
            "success": False,
            "error": "The uploaded CSV file is completely empty.",
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": 0,
            "skipped_rows": 0,
            "warnings": ["Uploaded file has zero bytes or empty content."]
        }

    try:
        # Use pandas with flexible delimiter sniffing
        df = pd.read_csv(io.StringIO(text), skipinitialspace=True)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to parse CSV format: {str(e)}",
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": 0,
            "skipped_rows": 0,
            "warnings": [str(e)]
        }

    if len(df) == 0:
        return {
            "success": False,
            "error": "CSV contains headers but no transaction rows.",
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": 0,
            "skipped_rows": 0,
            "warnings": ["Zero rows found."]
        }

    # 2. Determine column mappings
    detection = detect_column_mappings(df)
    mappings = detection["detected"].copy()

    if mapping_overrides:
        for k, v in mapping_overrides.items():
            if v and v in df.columns:
                mappings[k] = v

    date_col = mappings.get("date_col")
    amount_col = mappings.get("amount_col")
    credit_col = mappings.get("credit_col")
    debit_col = mappings.get("debit_col")
    type_col = mappings.get("type_col")
    desc_col = mappings.get("description_col")

    warnings: List[str] = []
    
    if not date_col:
        return {
            "success": False,
            "error": "Could not identify a transaction date column. Please map the Date column manually.",
            "detected_columns": detection,
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": 0,
            "skipped_rows": 0,
            "warnings": ["Missing date column."]
        }

    has_split_amounts = bool(credit_col and debit_col and credit_col in df.columns and debit_col in df.columns)
    has_single_amount = bool(amount_col and amount_col in df.columns)

    if not has_split_amounts and not has_single_amount:
        return {
            "success": False,
            "error": "Could not identify Amount or Credit/Debit columns. Please map columns manually.",
            "detected_columns": detection,
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": 0,
            "skipped_rows": 0,
            "warnings": ["Missing amount/credit/debit columns."]
        }

    # 3. Process Rows
    valid_transactions = []
    invalid_rows = 0
    skipped_rows = 0
    duplicate_count = 0
    seen_tx_keys = set()
    total_credit_sum = 0.0
    total_debit_sum = 0.0

    for row_idx, (_, row) in enumerate(df.iterrows(), start=2):
        row_num = row_idx
        
        # Check if description denotes opening/closing balance or summary
        row_desc = str(row[desc_col]) if desc_col and pd.notna(row[desc_col]) else ""
        if is_balance_or_summary_row(row_desc):
            skipped_rows += 1
            continue

        # Parse Date
        date_raw = row[date_col]
        date_iso = parse_date_str(date_raw)
        if not date_iso:
            invalid_rows += 1
            continue

        # Parse Amount
        final_amt: Optional[float] = None

        if has_split_amounts:
            cr_val = clean_amount_str(row[credit_col])
            dr_val = clean_amount_str(row[debit_col])

            if cr_val is not None and cr_val > 0:
                final_amt = cr_val
            elif dr_val is not None and dr_val > 0:
                final_amt = -dr_val
            elif cr_val is not None and cr_val == 0 and dr_val is not None and dr_val == 0:
                # Zero transaction
                final_amt = 0.0
            elif cr_val is not None:
                final_amt = cr_val
            elif dr_val is not None:
                final_amt = -abs(dr_val)
        elif has_single_amount:
            raw_amt = clean_amount_str(row[amount_col])
            if raw_amt is not None:
                # Check type_col if available e.g. "CR" vs "DR"
                if type_col and pd.notna(row[type_col]):
                    t_str = str(row[type_col]).strip().lower()
                    if t_str in ["dr", "debit", "withdrawal", "w", "d"]:
                        final_amt = -abs(raw_amt)
                    elif t_str in ["cr", "credit", "deposit", "c"]:
                        final_amt = abs(raw_amt)
                    else:
                        final_amt = raw_amt
                else:
                    final_amt = raw_amt

        if final_amt is None:
            invalid_rows += 1
            continue

        # Track credits / debits sums
        if final_amt > 0:
            total_credit_sum += final_amt
        elif final_amt < 0:
            total_debit_sum += abs(final_amt)

        # Duplicate check (date + amount)
        tx_key = (date_iso, round(final_amt, 2), row_desc)
        if tx_key in seen_tx_keys:
            duplicate_count += 1
        else:
            seen_tx_keys.add(tx_key)

        valid_transactions.append({
            "transaction_date": date_iso,
            "amount": final_amt,
            "original_row": row_num
        })

    if len(valid_transactions) == 0:
        return {
            "success": False,
            "error": "No valid transaction rows could be converted. Please verify date and amount formats.",
            "detected_columns": detection,
            "converted_csv": "",
            "valid_rows": 0,
            "invalid_rows": invalid_rows,
            "skipped_rows": skipped_rows,
            "warnings": ["Zero valid rows produced after conversion."]
        }

    # 4. Sort transactions by date ascending
    valid_transactions.sort(key=lambda x: (x["transaction_date"], x["original_row"]))

    # 5. Build standardized CSV string: transaction_date,amount
    # Exactly two columns, ISO date, formatted 2 decimal places, UTF-8
    output_buffer = io.StringIO()
    writer = csv.writer(output_buffer, lineterminator="\n")
    writer.writerow(["transaction_date", "amount"])

    for tx in valid_transactions:
        formatted_amount = f"{tx['amount']:.2f}"
        writer.writerow([tx["transaction_date"], formatted_amount])

    converted_csv_str = output_buffer.getvalue()

    if invalid_rows > 0:
        warnings.append(f"{invalid_rows} rows had invalid dates or unparseable amounts and were safely skipped.")
    if skipped_rows > 0:
        warnings.append(f"{skipped_rows} opening/closing balance or summary rows were excluded from transactions.")
    if duplicate_count > 0:
        warnings.append(f"{duplicate_count} potential duplicate transactions were detected in source data.")

    # Prepare preview of first 15 rows
    preview = [
        {
            "transaction_date": tx["transaction_date"],
            "amount": round(tx["amount"], 2),
            "original_row": tx["original_row"],
            "type": "Credit (+)" if tx["amount"] >= 0 else "Debit (-)"
        }
        for tx in valid_transactions[:15]
    ]

    return {
        "success": True,
        "converted_csv": converted_csv_str,
        "total_source_rows": len(df),
        "valid_rows": len(valid_transactions),
        "invalid_rows": invalid_rows,
        "skipped_rows": skipped_rows,
        "duplicate_count": duplicate_count,
        "total_credits_sum": round(total_credit_sum, 2),
        "total_debits_sum": round(total_debit_sum, 2),
        "detected_columns": detection,
        "warnings": warnings,
        "preview": preview,
        "rules_confirmation": "Credits are mapped to positive (+) values and debits to negative (-) values."
    }
