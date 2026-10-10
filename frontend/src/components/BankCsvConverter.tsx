import React, { useState } from "react";
import { api } from "../services/api";
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  Download,
  Sliders,
  RefreshCw,
  Check,
  X
} from "lucide-react";

interface BankCsvConverterProps {
  onUseConvertedFile: (file: File) => void;
}

export const BankCsvConverter: React.FC<BankCsvConverterProps> = ({ onUseConvertedFile }) => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [customMappings, setCustomMappings] = useState<Record<string, string>>({});
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (file: File) => {
    setSourceFile(file);
    setError(null);
    setConversionResult(null);
    setDetecting(true);

    try {
      const detectRes = await api.detectCsvFormat(file);
      setDetectionResult(detectRes);

      // Pre-fill custom mappings from detection
      const initMap: Record<string, string> = {};
      if (detectRes.detected.date_col) initMap["date_col"] = detectRes.detected.date_col;
      if (detectRes.detected.amount_col) initMap["amount_col"] = detectRes.detected.amount_col;
      if (detectRes.detected.credit_col) initMap["credit_col"] = detectRes.detected.credit_col;
      if (detectRes.detected.debit_col) initMap["debit_col"] = detectRes.detected.debit_col;
      if (detectRes.detected.type_col) initMap["type_col"] = detectRes.detected.type_col;
      if (detectRes.detected.description_col) initMap["description_col"] = detectRes.detected.description_col;
      setCustomMappings(initMap);

      // If detection confidence is High, automatically convert immediately
      if (detectRes.confidence === "High") {
        await executeConversion(file, initMap);
      } else {
        setShowMappingEditor(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze bank statement CSV.");
    } finally {
      setDetecting(false);
    }
  };

  const executeConversion = async (file: File, mappingsToUse: Record<string, string>) => {
    setConverting(true);
    setError(null);
    try {
      const res = await api.convertCsv(file, mappingsToUse);
      setConversionResult(res);
    } catch (err: any) {
      setError(err.message || "Failed to convert CSV format.");
    } finally {
      setConverting(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!conversionResult?.converted_csv) return;
    const blob = new Blob([conversionResult.converted_csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const originalName = sourceFile?.name.replace(/\.[^/.]+$/, "") || "bank_statement";
    link.setAttribute("download", `${originalName}_standardized.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyToPipeline = () => {
    if (!conversionResult?.converted_csv) return;
    const blob = new Blob([conversionResult.converted_csv], { type: "text/csv;charset=utf-8;" });
    const convertedFile = new File([blob], `${sourceFile?.name.replace(/\.[^/.]+$/, "") || "converted"}_model_ready.csv`, {
      type: "text/csv"
    });
    onUseConvertedFile(convertedFile);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200/60 flex items-center justify-center text-[#0D9488]">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Bank Statement CSV Converter</h2>
            <p className="text-xs text-slate-500">
              Upload statements from Indian or global banks to standardize into <code className="bg-slate-100 text-teal-800 px-1 py-0.5 rounded font-mono">transaction_date,amount</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md font-medium border border-slate-200">
            Rule: Credits (+) &bull; Debits (-)
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 1: Upload Box */}
      {!conversionResult && (
        <div className="border-2 border-dashed border-slate-200 hover:border-[#0D9488] bg-slate-50/70 rounded-2xl p-6 text-center transition-all">
          <input
            type="file"
            accept=".csv"
            id="bank-file-input"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <label htmlFor="bank-file-input" className="cursor-pointer space-y-2 block">
            <Upload className="w-8 h-8 text-[#0D9488] mx-auto" />
            <div className="text-xs font-bold text-slate-800">
              Select or Drop Raw Bank Statement CSV
            </div>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Auto-detects HDFC, SBI, ICICI, Axis, or custom exports with split Credit/Debit or signed Amount columns.
            </p>
          </label>
        </div>
      )}

      {/* Loading States */}
      {(detecting || converting) && (
        <div className="flex items-center justify-center gap-3 py-6 text-xs text-slate-600">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0D9488]" />
          <span>{detecting ? "Detecting columns & bank formatting..." : "Standardizing transactions & verifying signs..."}</span>
        </div>
      )}

      {/* Step 2: Detection & Mapping Editor */}
      {detectionResult && !detecting && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">File: {detectionResult.filename}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  detectionResult.confidence === "High"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}
              >
                {detectionResult.confidence} Confidence Detection
              </span>
            </div>

            <button
              onClick={() => setShowMappingEditor(!showMappingEditor)}
              className="text-xs font-semibold text-[#0D9488] hover:text-[#0F766E] flex items-center gap-1"
            >
              <Sliders className="w-3.5 h-3.5" />
              {showMappingEditor ? "Hide Column Mapping" : "Manual Column Mapping"}
            </button>
          </div>

          {/* Interactive Mapping Selectors */}
          {showMappingEditor && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="font-bold text-slate-800">Map Columns to Model Specification:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Date Column *
                  </label>
                  <select
                    value={customMappings["date_col"] || ""}
                    onChange={(e) => setCustomMappings({ ...customMappings, date_col: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="">-- Select Date Column --</option>
                    {detectionResult.available_columns.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Amount Column (or Leave Empty for Cr/Dr)
                  </label>
                  <select
                    value={customMappings["amount_col"] || ""}
                    onChange={(e) => setCustomMappings({ ...customMappings, amount_col: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="">-- Single Amount Column --</option>
                    {detectionResult.available_columns.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Credit Column (Deposit)
                  </label>
                  <select
                    value={customMappings["credit_col"] || ""}
                    onChange={(e) => setCustomMappings({ ...customMappings, credit_col: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="">-- Credit Column --</option>
                    {detectionResult.available_columns.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Debit Column (Withdrawal)
                  </label>
                  <select
                    value={customMappings["debit_col"] || ""}
                    onChange={(e) => setCustomMappings({ ...customMappings, debit_col: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="">-- Debit Column --</option>
                    {detectionResult.available_columns.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Description / Narration (Optional)
                  </label>
                  <select
                    value={customMappings["description_col"] || ""}
                    onChange={(e) => setCustomMappings({ ...customMappings, description_col: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="">-- Description Column --</option>
                    {detectionResult.available_columns.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => sourceFile && executeConversion(sourceFile, customMappings)}
                    className="w-full py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold rounded-lg transition-all"
                  >
                    Apply & Re-Convert
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Conversion Result, Statistics & Data Preview */}
      {conversionResult && (
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-medium">Valid Transactions</span>
              <div className="text-lg font-extrabold text-slate-900">{conversionResult.valid_rows}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-medium">Skipped Balance Rows</span>
              <div className="text-lg font-bold text-slate-700">{conversionResult.skipped_rows}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-medium">Total Credits Sum</span>
              <div className="text-lg font-bold text-emerald-600">₹{conversionResult.total_credits_sum?.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-medium">Total Debits Sum</span>
              <div className="text-lg font-bold text-rose-600">₹{conversionResult.total_debits_sum?.toLocaleString()}</div>
            </div>
          </div>

          {conversionResult.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 space-y-1">
              <div className="font-semibold text-amber-800">Conversion Notices:</div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {conversionResult.warnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Standardized Preview Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 border-b border-slate-200 flex items-center justify-between">
              <span>Preview Standardized CSV Output (First 10 Rows)</span>
              <span className="text-[11px] text-teal-800 font-mono bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                transaction_date,amount
              </span>
            </div>

            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs">
                <thead className="bg-white border-b border-slate-100 text-slate-500 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-4">Row #</th>
                    <th className="py-2 px-4">transaction_date</th>
                    <th className="py-2 px-4">amount</th>
                    <th className="py-2 px-4 text-right">Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conversionResult.preview.slice(0, 10).map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2 px-4 font-mono text-slate-400">{row.original_row}</td>
                      <td className="py-2 px-4 font-mono font-medium text-slate-900">{row.transaction_date}</td>
                      <td className={`py-2 px-4 font-mono font-bold ${row.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {row.amount > 0 ? `+${row.amount.toFixed(2)}` : row.amount.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full ${row.amount >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                          {row.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              onClick={() => {
                setSourceFile(null);
                setDetectionResult(null);
                setConversionResult(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
            >
              Upload Another Statement
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4 text-slate-500" />
                Download Standardized CSV
              </button>

              <button
                type="button"
                onClick={handleApplyToPipeline}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-xs font-bold text-white flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Check className="w-4 h-4" />
                Attach to Credit Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
