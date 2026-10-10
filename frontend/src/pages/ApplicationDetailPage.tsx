import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { ScoreGauge } from "../components/ScoreGauge";
import { DataQualityBadge } from "../components/DataQualityBadge";
import { ShapWaterfallChart } from "../components/ShapWaterfallChart";
import {
  FileText,
  BarChart3,
  HelpCircle,
  Sliders,
  CheckSquare,
  History,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Info,
  Lock,
  Download,
  ShieldCheck,
  CreditCard,
  User,
  Layers,
  AlertCircle
} from "lucide-react";

export const ApplicationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [app, setApp] = useState<any>(null);
  const [analysisRun, setAnalysisRun] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "result" | "explain" | "whatif" | "decision" | "audit">("summary");
  const [loading, setLoading] = useState(true);

  // What-if simulator state
  const [whatifStable, setWhatifStable] = useState<number>(0);
  const [whatifPunc, setWhatifPunc] = useState<number>(0.85);
  const [whatifBuffer, setWhatifBuffer] = useState<number>(1.0);
  const [whatifAmount, setWhatifAmount] = useState<number>(60000);
  const [whatifTenure, setWhatifTenure] = useState<number>(12);
  const [whatifResult, setWhatifResult] = useState<any>(null);
  const [whatifSimulating, setWhatifSimulating] = useState(false);

  // Officer decision form state
  const [decisionStatus, setDecisionStatus] = useState<string>("Approved");
  const [approvedAmount, setApprovedAmount] = useState<number>(50000);
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [decisionNotes, setDecisionNotes] = useState<string>("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

  const handleDownloadReport = () => {
    if (!app) return;
    const dateStr = new Date().toLocaleDateString("en-IN", { dateStyle: "long" });
    const report = `# CREDENCE AI — CREDIT ASSESSMENT DOSSIER
CONFIDENTIAL UNDERWRITING ASSESSMENT REPORT
Generated: ${dateStr}
Application Reference: ${app.id}

---

## 1. BORROWER PROFILE & APPLICATION PARAMETERS
- Applicant Name: ${app.borrower_name}
- Application ID: ${app.id}
- Occupation: ${app.occupation || "Not Specified"}
- Income Source: ${app.income_source || "Not Specified"}
- Declared Monthly Income: ₹${(app.declared_income || 0).toLocaleString()}
- Declared Existing Monthly Debt: ₹${(app.existing_debt || 0).toLocaleString()}
- Requested Loan Amount: ₹${(app.requested_amount || 0).toLocaleString()}
- Proposed Tenure: ${app.tenure_months || 12} Months
- Current Status: ${app.status}

---

## 2. BANK TRANSACTION & STATEMENT COVERAGE
- Observed Coverage Period: ${analysisRun?.data?.months_observed || "N/A"} Months
- Total Analyzed Transactions: ${analysisRun?.data?.transaction_count || "N/A"}
- Data Quality & Confidence: ${analysisRun?.data?.data_confidence || "N/A"}
- Cash Flow Volatility (CV): ${((analysisRun?.data?.cash_flow_volatility || 0) * 100).toFixed(1)}%
- Total Non-Earned Inflows Excluded: ₹${(analysisRun?.data?.excluded_inflows_total || 0).toLocaleString()}
  (Internal self-transfers, loan proceeds, and refunds were strictly separated from earned operating income)

### Statement Uncertainty & Missing Evidence
${(analysisRun?.data?.uncertainty_indicators || []).map((u: string) => `- [Uncertainty] ${u}`).join("\n") || "- None identified"}
${(analysisRun?.data?.missing_evidence || []).map((m: string) => `- [Missing Info] ${m}`).join("\n") || "- None identified"}

---

## 3. CASH FLOW & CATEGORIZATION ANALYSIS
- Gross Monthly Earned Inflow: ₹${(analysisRun?.cashflow?.gross_business_inflow_monthly || 0).toLocaleString()}
- Estimated Monthly Operating Outflows: ₹${(analysisRun?.cashflow?.estimated_business_outflow_monthly || 0).toLocaleString()}
- Stable Net Monthly Cash Flow (Median): ₹${(analysisRun?.cashflow?.stable_monthly_cash_flow || 0).toLocaleString()}
- Detected Monthly Loan Repayments: ₹${(analysisRun?.cashflow?.detected_monthly_loan_repayments || 0).toLocaleString()}

---

## 4. LOAN AFFORDABILITY & DEBT CAPACITY ASSESSMENT
- Proposed Monthly EMI: ₹${(analysisRun?.affordability?.proposed_emi || 0).toLocaleString()}
- Total Monthly Debt Obligations: ₹${(analysisRun?.affordability?.total_monthly_debt_service || 0).toLocaleString()}
- Fixed Obligation to Income Ratio (FOIR / DTI): ${((analysisRun?.affordability?.foir_percentage || 0)).toFixed(1)}%
- Net Disposable Cash Surplus: ₹${(analysisRun?.affordability?.net_disposable_surplus || 0).toLocaleString()}
- Debt Service Coverage Ratio (DSCR): ${(analysisRun?.affordability?.dscr || 0).toFixed(2)}x
- Max Safe Affordable Loan Capacity: ₹${(analysisRun?.affordability?.max_affordable_loan || 0).toLocaleString()}
- Affordability Verdict: ${analysisRun?.affordability?.affordability_verdict || "N/A"}

Affordability Considerations:
${(analysisRun?.affordability?.affordability_reasons || []).map((r: string) => `- ${r}`).join("\n") || "- Standard capacity"}

---

## 5. CREDIT SCORE & EXPLAINABLE RISK MODEL (SHAP)
- Credence AI Score: ${analysisRun?.prediction?.score || "N/A"} / 900
- Est. Default Probability: ${((analysisRun?.prediction?.default_probability || 0) * 100).toFixed(1)}%
- Risk Tier: ${analysisRun?.prediction?.risk_tier || "N/A"}
- Recommended Loan Policy Cap: ₹${(analysisRun?.loan_policy?.recommended_amount || 0).toLocaleString()}

### Top Positive Factors:
${(analysisRun?.explanations?.positive_factors || []).map((p: any) => `- ${p.display_name || p.feature}: +${p.contribution_points} pts (${p.interpretation || ""})`).join("\n") || "- Standard baseline"}

### Top Risk / Limiting Factors:
${(analysisRun?.explanations?.negative_factors || []).map((n: any) => `- ${n.display_name || n.feature}: ${n.contribution_points} pts (${n.interpretation || ""})`).join("\n") || "- None identified"}

---
*Notice: Credence AI assessment is generated based on algorithmic cash-flow underwriting and explainable machine learning models. Underwriting decisions require authorized human loan officer validation.*
`;

    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Credence_AI_Assessment_${app.id}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadAllData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const appData = await api.getApplication(id);
      setApp(appData);

      if (appData.latest_analysis_run_id) {
        const arData = await api.getAnalysisRun(appData.latest_analysis_run_id);
        setAnalysisRun(arData);
        
        setWhatifStable(arData.cashflow.stable_monthly_cash_flow);
        setWhatifPunc(0.85);
        setWhatifBuffer(1.0);
        setWhatifAmount(arData.loan_policy.requested_amount);
        setApprovedAmount(arData.loan_policy.recommended_amount);
      }

      const logs = await api.getAuditHistory(id);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [id]);

  const handleRunWhatIf = async () => {
    if (!analysisRun) return;
    setWhatifSimulating(true);
    try {
      const res = await api.runWhatIf({
        analysis_run_id: analysisRun.analysis_run_id,
        stable_cash_flow: whatifStable,
        utility_punctuality: whatifPunc,
        month_end_buffer: whatifBuffer,
        requested_amount: whatifAmount
      });
      setWhatifResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setWhatifSimulating(false);
    }
  };

  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecisionError(null);
    setDecisionSuccess(null);

    if (user?.role !== "officer") {
      setDecisionError("Only Loan Officers can record underwriting decisions.");
      return;
    }

    setDecisionSubmitting(true);
    try {
      const res = await api.recordDecision(id!, {
        status: decisionStatus,
        approved_amount: approvedAmount,
        override_reason: overrideReason,
        notes: decisionNotes
      });
      setDecisionSuccess(res.message);
      await loadAllData();
    } catch (err: any) {
      setDecisionError(err.message || "Failed to record decision");
    } finally {
      setDecisionSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-xs text-slate-500 font-medium">Loading application analysis...</div>;
  }

  if (!app) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="text-base font-bold text-slate-800">Application Record Not Found</div>
        <Link to="/overview" className="text-xs text-[#0D9488] font-bold underline">Back to Overview</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link to="/overview" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 font-medium mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Queue
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-900">{app.borrower_name}</h1>
            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-semibold border border-slate-200">
              {app.id}
            </span>
            {app.occupation && (
              <span className="text-xs bg-teal-50 text-[#0D9488] border border-teal-200 px-2.5 py-0.5 rounded-full font-bold">
                {app.occupation}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            <span>Requested Loan: <strong className="text-slate-900">₹{app.requested_amount?.toLocaleString()}</strong></span>
            <span>Tenure: <strong className="text-slate-900">{app.tenure_months || 12} Months</strong></span>
            <span>Income Source: <strong className="text-slate-900">{app.income_source || "Bank Inflows"}</strong></span>
            <span>Status: <strong className="text-amber-700 font-bold">{app.status}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-bold border border-slate-200 transition-colors shadow-xs"
            title="Download complete underwriting assessment dossier"
          >
            <Download className="w-4 h-4 text-[#0D9488]" />
            Download Dossier (.MD)
          </button>
          {analysisRun && (
            <DataQualityBadge
              level={analysisRun.data.data_confidence}
              warnings={analysisRun.data.warnings}
            />
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto bg-white px-4 pt-2 rounded-t-xl border">
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "summary" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" /> Data Summary
        </button>

        <button
          onClick={() => setActiveTab("result")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "result" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Credit Result & Policy
        </button>

        <button
          onClick={() => setActiveTab("explain")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "explain" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <HelpCircle className="w-4 h-4" /> Why This Decision (SHAP)
        </button>

        <button
          onClick={() => setActiveTab("whatif")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "whatif" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Sliders className="w-4 h-4" /> What-If Simulator
        </button>

        <button
          onClick={() => setActiveTab("decision")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "decision" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <CheckSquare className="w-4 h-4" /> Officer Decision
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
            activeTab === "audit" ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <History className="w-4 h-4" /> Audit Trail
        </button>
      </div>

      {/* Tab 1: Data Summary */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {analysisRun ? (
            <>
              {/* Borrower Profile Overview */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#0D9488]" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Borrower Underwriting Profile & Declarations
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">Declared at application intake</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Occupation</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{app.occupation || "Not Specified"}</div>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Income Source</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{app.income_source || "Bank Inflows"}</div>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Declared Monthly Income</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">₹{(app.declared_income || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Declared Existing Debt / EMI</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">₹{(app.existing_debt || 0).toLocaleString()} /mo</div>
                  </div>
                </div>
              </div>

              {/* Monthly Cash Flow Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
                  <div className="text-xs text-slate-500 font-medium">Gross Monthly Earned Inflow</div>
                  <div className="text-xl font-bold text-slate-900">₹{analysisRun.cashflow.gross_business_inflow_monthly?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">Excludes non-operating capital</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
                  <div className="text-xs text-slate-500 font-medium">Estimated Monthly Outflows</div>
                  <div className="text-xl font-bold text-slate-900">₹{analysisRun.cashflow.estimated_business_outflow_monthly?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">Operational debits & costs</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
                  <div className="text-xs text-slate-500 font-medium">Stable Monthly Net Cash Flow</div>
                  <div className="text-xl font-bold text-emerald-700">₹{analysisRun.cashflow.stable_monthly_cash_flow?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">Median net surplus</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-1">
                  <div className="text-xs text-slate-500 font-medium">Detected Existing EMI Servicing</div>
                  <div className="text-xl font-bold text-slate-900">₹{(analysisRun.cashflow.detected_monthly_loan_repayments || 0)?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">Auto-detected debt debits</div>
                </div>
              </div>

              {/* Bank Transaction Categorization & Flow Classification */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#0D9488]" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Transaction Categorization & Flow Classification
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Rule & NLP Classification of {analysisRun.data.transaction_count} Bank Records
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {[
                    { key: "income", label: "Earned Inflows", badge: "Operating", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
                    { key: "expense", label: "Expenses", badge: "Operating", color: "bg-slate-50 text-slate-800 border-slate-200" },
                    { key: "loan_repayment", label: "Loan Repayments", badge: "Debt Service", color: "bg-indigo-50 text-indigo-800 border-indigo-200" },
                    { key: "internal_transfer", label: "Self Transfers", badge: "Quarantined", color: "bg-amber-50 text-amber-900 border-amber-200" },
                    { key: "loan_disbursal", label: "Loan Proceeds", badge: "Quarantined", color: "bg-purple-50 text-purple-800 border-purple-200" },
                    { key: "refund", label: "Refunds", badge: "Quarantined", color: "bg-blue-50 text-blue-800 border-blue-200" },
                    { key: "other", label: "Other / Misc", badge: "Unclassified", color: "bg-slate-50 text-slate-600 border-slate-200" },
                  ].map((cat) => {
                    const item = analysisRun.data.category_breakdown?.[cat.key] || { count: 0, total_amount: 0 };
                    return (
                      <div key={cat.key} className={`p-3 rounded-xl border ${cat.color} space-y-1`}>
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span>{cat.label}</span>
                          <span className="text-[9px] px-1 py-0.2 bg-white/70 rounded border font-semibold">{cat.badge}</span>
                        </div>
                        <div className="text-sm font-extrabold">₹{Math.abs(item.total_amount || 0).toLocaleString()}</div>
                        <div className="text-[10px] opacity-75">{item.count || 0} transactions</div>
                      </div>
                    );
                  })}
                </div>

                {/* Financial Integrity Callout */}
                <div className="bg-teal-50/70 border border-teal-200 p-3.5 rounded-xl text-xs text-teal-950 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-[#0D9488] font-bold">Financial Integrity Assurance: </strong>
                    <span>
                      A total of <strong>₹{(analysisRun.data.excluded_inflows_total || 0).toLocaleString()}</strong> in non-operating inflows (internal self-transfers, loan proceeds, and refunds) was detected and quarantined from earned income calculations to protect underwriting accuracy.
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Coverage, Uncertainty & Missing Evidence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>Statement Coverage & Uncertainty Indicators</span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-2">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="font-medium text-slate-600">Observed Statement Coverage</span>
                      <span className="font-bold text-slate-900">{analysisRun.data.months_observed} Months ({analysisRun.data.transaction_count} Txns)</span>
                    </div>
                    {analysisRun.data.uncertainty_indicators && analysisRun.data.uncertainty_indicators.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {analysisRun.data.uncertainty_indicators.map((u: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50/60 p-2 rounded border border-amber-200/60">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                            <span>{u}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                        ✓ Statement coverage is complete with high transaction density and low uncertainty.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Missing Evidence & Data Limitations</span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-2">
                    {analysisRun.data.missing_evidence && analysisRun.data.missing_evidence.length > 0 ? (
                      <div className="space-y-1.5">
                        {analysisRun.data.missing_evidence.map((m: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
                            <Info className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
                            <span>{m}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic p-2 bg-slate-50 rounded">
                        No critical evidentiary gaps identified.
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                      Credence AI alternative underwriting strictly does not penalize borrowers for missing formal bureau lines; instead, it benchmarks sustainable cash-flow dynamics.
                    </p>
                  </div>
                </div>
              </div>

              {/* Fraud Flags Section */}
              {analysisRun.fraud_flags.length > 0 && (
                <div className="bg-white border border-amber-200 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Data Integrity & Fraud Flags ({analysisRun.fraud_flags.length})</span>
                  </div>
                  <div className="space-y-2">
                    {analysisRun.fraud_flags.map((ff: any, idx: number) => (
                      <div key={idx} className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/80 text-xs flex items-start gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          ff.severity === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          {ff.severity} Severity
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{ff.flag_type}</div>
                          <div className="text-slate-600 mt-0.5">{ff.evidence_summary}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-400 py-6">No analysis run uploaded for this application yet.</div>
          )}
        </div>
      )}

      {/* Tab 2: Credit Result & Affordability Policy */}
      {activeTab === "result" && analysisRun && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ScoreGauge
              score={analysisRun.prediction.score}
              probability={analysisRun.prediction.default_probability}
              dataConfidence={analysisRun.data.data_confidence}
              scoreRange={analysisRun.prediction.score_range}
            />

            <div className="md:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">Loan Policy Recommendation</h3>
                <p className="text-xs text-slate-500">
                  Calculated under prototype policy rules using lean-month cash flow and credit score multiplier.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">Requested Loan Amount</div>
                  <div className="text-xl font-extrabold text-slate-900">₹{analysisRun.loan_policy.requested_amount?.toLocaleString()}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-medium text-slate-500">Recommended Loan Amount</div>
                  <div className="text-xl font-extrabold text-[#0D9488]">₹{analysisRun.loan_policy.recommended_amount?.toLocaleString()}</div>
                </div>
              </div>

              <div className="bg-teal-50 border border-teal-200 p-4 rounded-xl text-xs text-teal-950 space-y-1">
                <div className="font-bold text-[#0D9488] flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0 text-[#0D9488]" /> Illustrative Prototype Policy Notice
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700 pt-1 leading-relaxed">
                  {analysisRun.loan_policy.limitations.map((lim: string, idx: number) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Debt Service & Loan Affordability Assessment Card */}
          {analysisRun.affordability && (
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#0D9488]" />
                    Debt Service & Proposed Loan Affordability Assessment
                  </h3>
                  <p className="text-xs text-slate-500">
                    Multi-factor evaluation of repayment capacity, reducing balance EMI, and total fixed obligation burden.
                  </p>
                </div>

                <div>
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    analysisRun.affordability.affordability_verdict === "AFFORDABLE"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : analysisRun.affordability.affordability_verdict === "MODERATE_STRETCH"
                      ? "bg-amber-50 text-amber-900 border-amber-300"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}>
                    {analysisRun.affordability.affordability_verdict === "AFFORDABLE" && "✓ VERDICT: AFFORDABLE"}
                    {analysisRun.affordability.affordability_verdict === "MODERATE_STRETCH" && "⚠ VERDICT: MODERATE STRETCH"}
                    {analysisRun.affordability.affordability_verdict === "UNAFFORDABLE" && "✕ VERDICT: UNAFFORDABLE"}
                  </span>
                </div>
              </div>

              {/* Affordability Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-xs font-medium text-slate-500">Proposed Monthly EMI</div>
                  <div className="text-xl font-bold text-slate-900">₹{analysisRun.affordability.proposed_emi?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">
                    At {(analysisRun.affordability.interest_rate_annual * 100).toFixed(0)}% p.a. for {analysisRun.affordability.tenure_months}m
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-xs font-medium text-slate-500">Total Monthly Debt Service</div>
                  <div className="text-xl font-bold text-slate-900">₹{analysisRun.affordability.total_monthly_debt_service?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400">
                    Existing (₹{analysisRun.affordability.existing_monthly_debt?.toLocaleString()}) + Proposed EMI
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-xs font-medium text-slate-500">FOIR / Debt-to-Income</div>
                  <div className="text-xl font-bold text-slate-900">{analysisRun.affordability.foir_percentage}%</div>
                  <div className="text-[10px] text-slate-400">
                    {analysisRun.affordability.foir_percentage <= 40 ? "Safe (<40%)" : analysisRun.affordability.foir_percentage <= 50 ? "Moderate (40-50%)" : "High Strain (>50%)"}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-xs font-medium text-slate-500">Net Disposable Surplus</div>
                  <div className={`text-xl font-bold ${analysisRun.affordability.net_disposable_surplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    ₹{analysisRun.affordability.net_disposable_surplus?.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">Buffer after all obligations</div>
                </div>
              </div>

              {/* Capacity & Ratio Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-800">Maximum Safe Affordable Loan</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">Calculated at 50% max FOIR cap</div>
                  </div>
                  <div className="text-lg font-extrabold text-[#0D9488]">
                    ₹{analysisRun.affordability.max_affordable_loan?.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-800">Debt Service Coverage Ratio (DSCR)</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">Operating cash flow / Total debt obligations</div>
                  </div>
                  <div className="text-lg font-extrabold text-slate-900">
                    {analysisRun.affordability.dscr}x
                  </div>
                </div>
              </div>

              {/* Reasons & Underwriting Rationale */}
              {analysisRun.affordability.affordability_reasons && analysisRun.affordability.affordability_reasons.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <div className="font-bold text-slate-800">Affordability Analysis Observations:</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    {analysisRun.affordability.affordability_reasons.map((reason: string, idx: number) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Why This Decision (SHAP) */}
      {activeTab === "explain" && analysisRun && (
        <ShapWaterfallChart explanations={analysisRun.explanations} />
      )}

      {/* Tab 4: What-If Simulator */}
      {activeTab === "whatif" && analysisRun && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#0D9488]" /> Interactive Counterfactual Simulator
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Adjust plausible scenario inputs below. The system recomputes dependent cash-flow features, re-runs the trained model, and displays hypothetical score changes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Stable Monthly Net Cash Flow: ₹{whatifStable.toLocaleString()}
                </label>
                <input
                  type="range"
                  min="10000"
                  max="150000"
                  step="2500"
                  value={whatifStable}
                  onChange={(e) => setWhatifStable(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Utility Punctuality Rate: {(whatifPunc * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.30"
                  max="1.00"
                  step="0.05"
                  value={whatifPunc}
                  onChange={(e) => setWhatifPunc(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Requested Loan Amount: ₹{whatifAmount.toLocaleString()}
                </label>
                <input
                  type="range"
                  min="10000"
                  max="200000"
                  step="5000"
                  value={whatifAmount}
                  onChange={(e) => setWhatifAmount(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Proposed Tenure: {whatifTenure} Months
                </label>
                <input
                  type="range"
                  min="3"
                  max="48"
                  step="3"
                  value={whatifTenure}
                  onChange={(e) => setWhatifTenure(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
              </div>

              {/* Dynamic Affordability Projection in Simulator */}
              {(() => {
                const r = 0.18 / 12;
                const emi = Math.round((whatifAmount * r * Math.pow(1 + r, whatifTenure)) / (Math.pow(1 + r, whatifTenure) - 1));
                const existing = app?.existing_debt || 0;
                const surplus = whatifStable - emi - existing;
                return (
                  <div className="bg-teal-50/60 p-3.5 rounded-xl border border-teal-200/80 space-y-1.5 text-xs text-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Live Scenario EMI (18% p.a.):</span>
                      <strong className="text-[#0D9488] font-bold">₹{emi.toLocaleString()}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Net Surplus After Debt:</span>
                      <strong className={`font-bold ${surplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        ₹{surplus.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={handleRunWhatIf}
                disabled={whatifSimulating}
                className="w-full py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold rounded-lg transition-all shadow-xs"
              >
                {whatifSimulating ? "Recomputing Model..." : "Simulate Scenario"}
              </button>
            </div>

            {/* What-if Output Display */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hypothetical Simulation Result</div>

              {whatifResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-xs font-semibold text-slate-600">Hypothetical Score</span>
                    <div className="text-right">
                      <span className="text-xl font-bold text-slate-900">{whatifResult.hypothetical_score}</span>
                      <span className={`text-xs ml-2 font-bold ${whatifResult.score_change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        ({whatifResult.score_change >= 0 ? `+${whatifResult.score_change}` : whatifResult.score_change} pts)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-xs font-semibold text-slate-600">Est. Default Probability</span>
                    <span className="text-sm font-bold text-slate-900">{(whatifResult.hypothetical_default_probability * 100).toFixed(1)}%</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-xs font-semibold text-slate-600">Hypothetical Recommended Loan</span>
                    <span className="text-sm font-bold text-[#0D9488]">₹{whatifResult.hypothetical_recommended_amount?.toLocaleString()}</span>
                  </div>

                  <p className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                    {whatifResult.disclaimer}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-slate-400">
                  Adjust sliders on the left and click <strong>Simulate Scenario</strong> to view recomputed metrics.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Officer Review & Decision */}
      {activeTab === "decision" && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Loan Officer Underwriting Decision</h3>
            <p className="text-xs text-slate-500">
              Record human loan officer approval, decline, or information request. Any override of policy recommendation requires a mandatory documented rationale.
            </p>
          </div>

          {user?.role !== "officer" && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>You are logged in as a <strong>Borrower</strong>. Only authorized Loan Officers can record underwriting decisions.</span>
            </div>
          )}

          {decisionSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{decisionSuccess}</span>
            </div>
          )}

          {decisionError && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{decisionError}</span>
            </div>
          )}

          <form onSubmit={handleRecordDecision} className="space-y-4 text-xs max-w-xl">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Decision Status</label>
              <select
                value={decisionStatus}
                onChange={(e) => setDecisionStatus(e.target.value)}
                disabled={user?.role !== "officer"}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 font-semibold focus:outline-none focus:border-[#0D9488]"
              >
                <option value="Approved">Approve Application</option>
                <option value="Declined">Decline Application</option>
                <option value="More Info Required">Request More Information</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Approved Loan Amount (₹)</label>
              <input
                type="number"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(Number(e.target.value))}
                disabled={user?.role !== "officer"}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 font-bold text-sm focus:outline-none focus:border-[#0D9488]"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Mandatory Override Reason <span className="text-slate-400 font-normal">(Required if overriding recommendation)</span>
              </label>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="State qualitative evidence or rationale..."
                disabled={user?.role !== "officer"}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0D9488]"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Underwriting Notes</label>
              <textarea
                rows={2}
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Optional internal comments..."
                disabled={user?.role !== "officer"}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0D9488]"
              />
            </div>

            <button
              type="submit"
              disabled={decisionSubmitting || user?.role !== "officer"}
              className="py-3 px-6 bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold rounded-lg transition-all shadow-xs disabled:opacity-50"
            >
              {decisionSubmitting ? "Recording Decision..." : "Submit & Record Decision"}
            </button>
          </form>
        </div>
      )}

      {/* Tab 6: Audit Trail */}
      {activeTab === "audit" && (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Immutable Audit Trail</h3>
            <p className="text-xs text-slate-500">
              Persistent event log tracking application creations, ML analysis runs, and officer decisions.
            </p>
          </div>

          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0D9488] uppercase tracking-wider text-[11px]">{log.event_type}</span>
                  <span className="text-[11px] text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-slate-800 font-medium">
                  Actor: <strong>{log.actor_name || log.actor_id}</strong> ({log.actor_role})
                </div>
                {log.reason && (
                  <div className="text-slate-700 bg-white p-2.5 rounded border border-slate-200 mt-1">
                    Rationale: {log.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
