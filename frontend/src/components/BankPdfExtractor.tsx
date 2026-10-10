import React, { useState } from "react";
import { api } from "../services/api";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  Trash2,
  RefreshCw,
  Edit2,
  Check,
  Layers,
  ArrowUpDown,
  X
} from "lucide-react";

export interface ExtractedTx {
  id: string;
  original_row: string;
  raw_text: string;
  transaction_date: string;
  time?: string;
  description: string;
  counterparty?: string;
  transaction_id?: string;
  bank_detail?: string;
  source?: string;
  category?: string;
  category_confidence?: number;
  raw_amount: string;
  amount: number;
  type: "credit" | "debit";
  status: "valid" | "needs_review" | "invalid";
  review_reason?: string | null;
  page: number;
}

interface BankPdfExtractorProps {
  onValidated: (convertedFile: File, summary: any) => void;
  onClear: () => void;
}

export const BankPdfExtractor: React.FC<BankPdfExtractorProps> = ({
  onValidated,
  onClear
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ExtractedTx[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; desc: string; amount: string; type: "credit" | "debit" }>({
    date: "",
    desc: "",
    amount: "",
    type: "debit"
  });

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF document (.pdf).");
      return;
    }

    setSelectedFile(file);
    setError(null);
    setExtracting(true);
    setTransactions([]);
    setSummary(null);
    setWarnings([]);

    try {
      const res = await api.extractPdfStatement(file);
      setTransactions(res.transactions || []);
      setSummary(res.summary || null);
      setWarnings(res.warnings || []);

      // If all rows are already valid, compile CSV immediately and notify parent
      const invalidOrReview = (res.transactions || []).filter(
        (t: ExtractedTx) => t.status !== "valid"
      );
      if (invalidOrReview.length === 0 && res.transactions?.length > 0) {
        await compileAndEmitCsv(res.transactions, res.summary, file.name);
      }
    } catch (err: any) {
      setError(err.message || "Failed to extract transactions from PDF statement.");
      setSelectedFile(null);
    } finally {
      setExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setTransactions([]);
    setSummary(null);
    setError(null);
    setWarnings([]);
    setEditingTxId(null);
    onClear();
  };

  // Compile validated transactions into standard 2-column CSV File
  const compileAndEmitCsv = async (
    txList: ExtractedTx[],
    currentSummary: any,
    origFilename: string
  ) => {
    const validTxs = txList.filter(t => t.status === "valid");
    if (validTxs.length === 0) return;

    try {
      const convRes = await api.convertPdfTransactions(validTxs);
      const csvBlob = new Blob([convRes.csv_content], { type: "text/csv;charset=utf-8;" });
      const csvFile = new File(
        [csvBlob],
        origFilename.replace(/\.pdf$/i, "_standardized.csv"),
        { type: "text/csv" }
      );
      onValidated(csvFile, currentSummary);
    } catch (err: any) {
      setError(err.message || "Failed to compile validated transactions to CSV.");
    }
  };

  // Toggle credit / debit on a row
  const togglePolarity = (id: string) => {
    setTransactions(prev => {
      const updated: ExtractedTx[] = prev.map(t => {
        if (t.id === id) {
          const newType: "credit" | "debit" = t.type === "credit" ? "debit" : "credit";
          const newAmt = newType === "credit" ? Math.abs(t.amount) : -Math.abs(t.amount);
          return {
            ...t,
            type: newType,
            amount: newAmt,
            status: "valid" as const,
            review_reason: null
          };
        }
        return t;
      });
      syncSummaryAndParent(updated);
      return updated;
    });
  };

  // Delete / Exclude a problematic row
  const deleteRow = (id: string) => {
    setTransactions(prev => {
      const updated = prev.filter(t => t.id !== id);
      syncSummaryAndParent(updated);
      return updated;
    });
  };

  // Start inline editing
  const startEdit = (t: ExtractedTx) => {
    setEditingTxId(t.id);
    setEditForm({
      date: t.transaction_date,
      desc: t.description,
      amount: Math.abs(t.amount).toString(),
      type: t.type
    });
  };

  // Save inline edit
  const saveEdit = (id: string) => {
    const parsedAmt = parseFloat(editForm.amount.replace(/,/g, ""));
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      alert("Please enter a positive numeric amount.");
      return;
    }

    setTransactions(prev => {
      const updated = prev.map(t => {
        if (t.id === id) {
          const finalAmt = editForm.type === "credit" ? parsedAmt : -parsedAmt;
          return {
            ...t,
            transaction_date: editForm.date,
            description: editForm.desc,
            amount: finalAmt,
            type: editForm.type,
            status: "valid" as const,
            review_reason: null
          };
        }
        return t;
      });
      setEditingTxId(null);
      syncSummaryAndParent(updated);
      return updated;
    });
  };

  // Re-calculate summary counts & notify parent if all valid
  const syncSummaryAndParent = (txList: ExtractedTx[]) => {
    const validCount = txList.filter(t => t.status === "valid").length;
    const reviewCount = txList.filter(t => t.status === "needs_review").length;
    const invalidCount = txList.filter(t => t.status === "invalid").length;

    const totalCreds = txList
      .filter(t => t.status === "valid" && t.amount > 0)
      .reduce((acc, t) => acc + t.amount, 0);
    const totalDebs = txList
      .filter(t => t.status === "valid" && t.amount < 0)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    const newSummary = {
      ...summary,
      total_rows_extracted: txList.length,
      valid_rows_count: validCount,
      needs_review_count: reviewCount,
      invalid_rows_count: invalidCount,
      total_credits: Math.round(totalCreds * 100) / 100,
      total_debits: Math.round(totalDebs * 100) / 100
    };
    setSummary(newSummary);

    if (reviewCount === 0 && invalidCount === 0 && selectedFile) {
      compileAndEmitCsv(txList, newSummary, selectedFile.name);
    }
  };

  // Download converted CSV
  const handleDownloadCsv = async () => {
    const validTxs = transactions.filter(t => t.status === "valid");
    if (validTxs.length === 0) return;

    try {
      const convRes = await api.convertPdfTransactions(validTxs);
      const blob = new Blob([convRes.csv_content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", selectedFile ? selectedFile.name.replace(/\.pdf$/i, "_converted.csv") : "standardized_transactions.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Failed to download CSV: " + err.message);
    }
  };

  const pendingReviewCount = transactions.filter(t => t.status === "needs_review").length;
  const invalidRowCount = transactions.filter(t => t.status === "invalid").length;
  const validRowCount = transactions.filter(t => t.status === "valid").length;
  const isAllValid = transactions.length > 0 && pendingReviewCount === 0 && invalidRowCount === 0;

  return (
    <div className="space-y-4">
      {/* Label and mandatory requirement as instructed */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-700">
          1. Transaction History PDF File <span className="text-rose-600">* Mandatory</span>
        </label>
        {selectedFile && (
          <span className="text-[11px] text-slate-500 font-mono">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Upload your bank account transaction history as a PDF. Credence AI will extract the transactions, convert them into the required CSV format, and use the validated data for credit analysis.
      </p>

      {/* Drag & Drop Upload Zone */}
      {!selectedFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all ${
            isDragOver
              ? "border-[#0D9488] bg-teal-50/50"
              : "border-slate-200 hover:border-[#0D9488] bg-slate-50"
          }`}
        >
          <input
            type="file"
            accept=".pdf"
            id="pdf-upload-input"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />
          <label htmlFor="pdf-upload-input" className="cursor-pointer space-y-2 block">
            <Upload className="w-9 h-9 text-[#0D9488] mx-auto" />
            <div className="text-xs font-bold text-slate-800">
              Click to browse bank statement PDF or drag & drop file
            </div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Supports digital statements from Google Pay (GPay), SBI, HDFC, ICICI, Axis, and other major financial institutions.
            </p>
          </label>
        </div>
      )}

      {/* Extraction in progress */}
      {extracting && (
        <div className="border border-teal-200 bg-teal-50/70 rounded-2xl p-6 text-center space-y-3">
          <RefreshCw className="w-7 h-7 text-[#0D9488] animate-spin mx-auto" />
          <div className="text-xs font-bold text-teal-900">
            Extracting transactions from bank statement PDF...
          </div>
          <p className="text-[11px] text-teal-700 max-w-sm mx-auto">
            Parsing document structure, normalizing currency, excluding balance summaries, and verifying date coverage.
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">{error}</span>
            <p className="text-[11px] text-rose-600">
              {error.toLowerCase().includes("scanned")
                ? "This document appears to be an image scan without selectable text. Please upload an electronic digital statement or run OCR."
                : error.toLowerCase().includes("layout")
                ? "The document contains selectable text, but its structure is not yet recognized. Supported formats include Google Pay (GPay), SBI, HDFC, ICICI, Axis, or upload standardized CSV."
                : error.toLowerCase().includes("empty")
                ? "The selected file is empty. Please choose a valid PDF statement."
                : "Please provide a supported text-layer bank or UPI statement PDF, or use the CSV upload option."}
            </p>
          </div>
        </div>
      )}

      {/* File Loaded & Transaction Review Step */}
      {selectedFile && !extracting && summary && (
        <div className="border border-slate-200 bg-white rounded-2xl p-5 shadow-xs space-y-5">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0D9488]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>{selectedFile.name}</span>
                  <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-mono">
                    {summary.total_pages} Page{summary.total_pages > 1 ? "s" : ""}
                  </span>
                  {summary.format_detected && (
                    <span className="bg-teal-50 border border-teal-200 text-teal-800 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                      {summary.format_detected}
                    </span>
                  )}
                  {summary.is_reconciled && (
                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Reconciled
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {summary.coverage_start_date && summary.coverage_end_date ? (
                    <span>Period: {summary.coverage_start_date} to {summary.coverage_end_date} ({summary.coverage_months} months observed)</span>
                  ) : (
                    <span>{transactions.length} total rows parsed</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={validRowCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium transition-colors disabled:opacity-50"
                title="Download the standardized 2-column CSV file"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Download Converted CSV
              </button>

              <button
                type="button"
                onClick={handleRemoveFile}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Replace PDF
              </button>
            </div>
          </div>

          {/* Statement Extraction Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Document Extraction Notes:</span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Valid Rows</div>
              <div className="text-lg font-extrabold text-emerald-700 mt-0.5">
                {validRowCount}
              </div>
              <div className="text-[10px] text-emerald-600">Ready for underwriting</div>
            </div>

            <div className={`rounded-xl p-3 border ${
              pendingReviewCount > 0
                ? "bg-amber-50 border-amber-200"
                : "bg-slate-50 border-slate-100"
            }`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${
                pendingReviewCount > 0 ? "text-amber-800" : "text-slate-500"
              }`}>
                Needs Review
              </div>
              <div className={`text-lg font-extrabold mt-0.5 ${
                pendingReviewCount > 0 ? "text-amber-700" : "text-slate-700"
              }`}>
                {pendingReviewCount}
              </div>
              <div className="text-[10px] text-slate-500">Ambiguous direction</div>
            </div>

            <div className={`rounded-xl p-3 border ${
              invalidRowCount > 0
                ? "bg-rose-50 border-rose-200"
                : "bg-slate-50 border-slate-100"
            }`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider ${
                invalidRowCount > 0 ? "text-rose-800" : "text-slate-500"
              }`}>
                Invalid Rows
              </div>
              <div className={`text-lg font-extrabold mt-0.5 ${
                invalidRowCount > 0 ? "text-rose-700" : "text-slate-700"
              }`}>
                {invalidRowCount}
              </div>
              <div className="text-[10px] text-slate-500">Unparseable/Missing</div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Excluded Balances</div>
              <div className="text-lg font-extrabold text-slate-700 mt-0.5">
                {summary.skipped_balance_rows_count || 0}
              </div>
              <div className="text-[10px] text-slate-500">Opening/Closing rows</div>
            </div>
          </div>

          {/* Polarity Rules Confirmation Notice */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0" />
              <span>
                <strong>Format Standard:</strong> Credits are converted to <strong>positive (+)</strong> amounts; debits are converted to <strong>negative (-)</strong> amounts.
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-500">
              Total Credits: <span className="font-bold text-emerald-700">₹{summary.total_credits?.toLocaleString("en-IN")}</span> • Debits: <span className="font-bold text-rose-700">₹{summary.total_debits?.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Action Reminder Banner if pending rows exist */}
          {!isAllValid && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Action Required Before Analysis:</span>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Please review the {pendingReviewCount + invalidRowCount} flagged row(s) below. Click <strong>Toggle Cr/Dr</strong> or <strong>Edit</strong> to resolve polarity, or <strong>Delete</strong> to exclude unneeded records.
                </p>
              </div>
            </div>
          )}

          {/* Review & Edit Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100/75 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Extracted Transaction Review Table ({transactions.length} rows)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">Sorted chronologically</span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[11px] sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold">Description / Narration</th>
                    <th className="py-2.5 px-3 font-semibold">Type</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Normalized Amount</th>
                    <th className="py-2.5 px-3 font-semibold">Validation Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => {
                    const isEditing = editingTxId === t.id;

                    if (isEditing) {
                      return (
                        <tr key={t.id} className="bg-amber-50/50">
                          <td className="py-2 px-3">
                            <input
                              type="date"
                              value={editForm.date}
                              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-[#0D9488]"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={editForm.desc}
                              onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-[#0D9488]"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={editForm.type}
                              onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#0D9488]"
                            >
                              <option value="credit">Credit (+)</option>
                              <option value="debit">Debit (-)</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.amount}
                              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs w-24 text-right focus:outline-none focus:border-[#0D9488]"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-[10px] text-amber-700 font-semibold">Editing</span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => saveEdit(t.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                title="Save changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTxId(null)}
                                className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={t.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          t.status === "needs_review"
                            ? "bg-amber-50/30"
                            : t.status === "invalid"
                            ? "bg-rose-50/30"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800">
                          <div>{t.transaction_date}</div>
                          {t.time && <div className="text-[10px] text-slate-400 font-normal">{t.time}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate max-w-[200px] font-medium" title={t.description}>{t.description}</span>
                            {t.category && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight shrink-0 ${
                                t.category === 'income' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                t.category === 'loan_repayment' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                t.category === 'internal_transfer' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                t.category === 'loan_disbursal' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                t.category === 'refund' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                                t.category === 'expense' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {t.category.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          {(t.counterparty || t.transaction_id || t.bank_detail) && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {t.counterparty && <span className="text-slate-600">Party: {t.counterparty}</span>}
                              {t.transaction_id && <span className="text-slate-400">• Ref: {t.transaction_id}</span>}
                              {t.bank_detail && <span className="text-slate-400">• {t.bank_detail}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => togglePolarity(t.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-transform active:scale-95 ${
                              t.type === "credit"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                            }`}
                            title="Click to toggle between Credit and Debit"
                          >
                            <ArrowUpDown className="w-2.5 h-2.5" />
                            {t.type === "credit" ? "Credit (+)" : "Debit (-)"}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span className={t.amount >= 0 ? "text-emerald-700" : "text-rose-700"}>
                            {t.amount >= 0 ? `+${t.amount.toFixed(2)}` : t.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {t.status === "valid" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Valid
                            </span>
                          ) : t.status === "needs_review" ? (
                            <span
                              className="inline-flex items-center gap-1 text-amber-700 font-semibold text-[11px] cursor-help"
                              title={t.review_reason || "Ambiguous row"}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Review ({t.review_reason?.slice(0, 24)}...)
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px] cursor-help"
                              title={t.review_reason || "Invalid row"}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Invalid
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 text-slate-400">
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              className="p-1 hover:text-slate-800 hover:bg-slate-100 rounded"
                              title="Edit transaction fields"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRow(t.id)}
                              className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Exclude row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation Ready Badge */}
          {isAllValid && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-900 shadow-xs">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>All {validRowCount} transaction rows validated and standardized for underwriting analysis.</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium">Ready to proceed</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
