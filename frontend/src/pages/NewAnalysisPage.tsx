import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { BankPdfExtractor } from "../components/BankPdfExtractor";
import { BankCsvConverter } from "../components/BankCsvConverter";

export const NewAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [requestedAmount, setRequestedAmount] = useState<number>(60000);
  const [occupation, setOccupation] = useState<string>("Micro-Merchant / Retailer");
  const [incomeSource, setIncomeSource] = useState<string>("UPI Digital Payments");
  const [declaredIncome, setDeclaredIncome] = useState<number>(50000);
  const [existingDebt, setExistingDebt] = useState<number>(0);
  const [tenureMonths, setTenureMonths] = useState<number>(12);

  const [txFile, setTxFile] = useState<File | null>(null);
  const [utFile, setUtFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversionNotice, setConversionNotice] = useState<string | null>(null);
  const [showCsvOption, setShowCsvOption] = useState(false);

  const handlePdfValidated = (convertedFile: File, summary: any) => {
    setTxFile(convertedFile);
    setConversionNotice(
      `Bank statement PDF successfully extracted & converted: ${convertedFile.name} (${summary.valid_rows_count} valid transactions, ${summary.coverage_months} months observed)`
    );
    setError(null);
  };

  const handlePdfCleared = () => {
    setTxFile(null);
    setConversionNotice(null);
  };

  const handleCsvConverted = (file: File) => {
    setTxFile(file);
    setConversionNotice(`Standardized CSV attached: ${file.name}`);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txFile) {
      setError("Please upload and validate your bank transaction history PDF statement first.");
      return;
    }
    if (!consent) {
      setError("Borrower consent is mandatory before running credit scoring analysis.");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const app = await api.createApplication({
        requested_amount: requestedAmount,
        occupation,
        income_source: incomeSource,
        declared_income: declaredIncome,
        existing_debt: existingDebt,
        tenure_months: tenureMonths
      });
      await api.runAnalysis(app.id, txFile, utFile || undefined);
      navigate(`/applications/${app.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to complete analysis pipeline");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <h1 className="text-xl font-extrabold text-[#14243A]">
          New Credit & Cash Flow Analysis
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Upload consented transaction records to ingest data quality, extract cash-flow signals, run ML risk estimation, and generate SHAP explanations.
        </p>
      </div>

      {conversionNotice && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{conversionNotice} (Ready for underwriting analysis below)</span>
          </div>
          <button
            type="button"
            onClick={() => setConversionNotice(null)}
            className="text-xs text-emerald-600 hover:text-emerald-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Upload Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Borrower Profile Section */}
        <div className="space-y-4 pb-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Borrower Profile & Underwriting Parameters</h3>
            <span className="text-[11px] text-[#0D9488] font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
              Required for Affordability Assessment
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Occupation / Trade
              </label>
              <select
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              >
                <option value="Micro-Merchant / Retailer">Micro-Merchant / Retailer</option>
                <option value="Salaried Employee">Salaried Employee</option>
                <option value="Self-Employed Professional">Self-Employed Professional</option>
                <option value="Gig Economy Worker">Gig Economy Worker</option>
                <option value="Small Business Owner / Artisan">Small Business Owner / Artisan</option>
                <option value="Daily Wage Earner">Daily Wage Earner</option>
                <option value="Agriculture & Allied">Agriculture & Allied</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Income Source Type
              </label>
              <select
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              >
                <option value="UPI Digital Payments">UPI Digital Payments & QR</option>
                <option value="Monthly Salary Transfer">Monthly Salary Transfer</option>
                <option value="Direct Bank Transfer / NEFT">Direct Bank Transfer / NEFT</option>
                <option value="Cash Inflows & Retail Collections">Cash Inflows & Retail Collections</option>
                <option value="Mixed / Multiple Streams">Mixed / Multiple Streams</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Declared Monthly Income (₹)
              </label>
              <input
                type="number"
                min="5000"
                max="1000000"
                step="2000"
                value={declaredIncome}
                onChange={(e) => setDeclaredIncome(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Loan Principal (₹)
              </label>
              <input
                type="number"
                min="5000"
                max="500000"
                step="5000"
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Proposed Tenure (Months)
              </label>
              <select
                value={tenureMonths}
                onChange={(e) => setTenureMonths(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              >
                <option value={6}>6 Months</option>
                <option value={12}>12 Months (Standard)</option>
                <option value={18}>18 Months</option>
                <option value={24}>24 Months</option>
                <option value={36}>36 Months</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Existing Monthly Debt / EMI (₹)
              </label>
              <input
                type="number"
                min="0"
                max="100000"
                step="1000"
                value={existingDebt}
                onChange={(e) => setExistingDebt(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#0D9488] focus:bg-white"
              />
              <span className="text-[10px] text-slate-400">Ongoing installments with other lenders</span>
            </div>
          </div>
        </div>

        {/* 1. Transaction History PDF File * Mandatory */}
        <BankPdfExtractor
          onValidated={handlePdfValidated}
          onClear={handlePdfCleared}
        />

        {/* Optional fallback for pre-formatted CSV */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowCsvOption(!showCsvOption)}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
            <span>Need to upload a CSV instead? (Legacy / Pre-formatted format)</span>
            {showCsvOption ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
          </button>

          {showCsvOption && (
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <BankCsvConverter onUseConvertedFile={handleCsvConverted} />
            </div>
          )}
        </div>

        {/* 2. Utility File Upload Box (Optional) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            2. Utility Payment History CSV File <span className="text-slate-400">(Optional)</span>
          </label>

          <div className="border border-slate-200 bg-slate-50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-xs font-semibold text-slate-800">
                  {utFile ? utFile.name : "Attach utility bill records for punctuality assessment"}
                </div>
                <p className="text-[11px] text-slate-500">Includes billing_period and payment_status.</p>
              </div>
            </div>

            <input
              type="file"
              accept=".csv"
              id="ut-file-input"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setUtFile(e.target.files[0]);
                }
              }}
            />
            <label
              htmlFor="ut-file-input"
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 border border-slate-200 cursor-pointer shadow-xs"
            >
              {utFile ? "Change" : "Browse"}
            </label>
          </div>
        </div>

        {/* Mandatory Consent Checkbox */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
          <input
            type="checkbox"
            id="consent-check"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#0D9488] focus:ring-[#0D9488]"
          />
          <label htmlFor="consent-check" className="text-xs text-slate-700 leading-relaxed">
            <strong>Borrower Consent Granted (v1.0):</strong> I confirm explicit consent to analyze alternative financial records solely for creditworthiness evaluation under prototype policies. I understand all generated metrics are illustrative.
          </label>
        </div>

        <button
          type="submit"
          disabled={uploading || !txFile}
          className="w-full py-3.5 bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold text-sm rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>Running Pipeline & SHAP Explainer...</>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> Execute Analysis Pipeline
            </>
          )}
        </button>
      </form>
    </div>
  );
};
