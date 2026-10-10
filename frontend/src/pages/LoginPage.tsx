import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"officer" | "borrower">("officer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isSignup) {
        await signup({ username, email, password, full_name: fullName, role });
      } else {
        await login(username, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-lg bg-[#1E3A8A] mx-auto flex items-center justify-center shadow-xs">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-[#0F172A] tracking-tight">
            CREDENCE <span className="text-[#1E3A8A]">AI</span>
          </h1>
          <p className="text-xs text-[#475569] max-w-xs mx-auto leading-relaxed">
            Explainable Alternative Credit Scoring & Informal Income Synthesizer
          </p>
        </div>

        {/* Login Form Card - Clean Surface with max 8px border-radius */}
        <div className="bg-[#FFFFFF] border border-[#E2E8F0] p-6 sm:p-8 rounded-lg shadow-sm space-y-6">
          {/* Sign In / Register Tabs */}
          <div className="flex border-b border-[#E2E8F0] gap-2">
            <button
              type="button"
              onClick={() => { setIsSignup(false); setError(null); }}
              className={`flex-1 text-center py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                !isSignup
                  ? "text-[#1E3A8A] border-b-2 border-[#1E3A8A] -mb-px"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsSignup(true); setError(null); }}
              className={`flex-1 text-center py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                isSignup
                  ? "text-[#1E3A8A] border-b-2 border-[#1E3A8A] -mb-px"
                  : "text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              Register
            </button>
          </div>

          {/* Semantic Error Banner */}
          {error && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] p-3 rounded-lg text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {isSignup && (
              <>
                <div>
                  <label className="block text-[#0F172A] mb-1.5 font-medium">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] transition-all min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-[#0F172A] mb-1.5 font-medium">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@credence.ai"
                    className="w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] transition-all min-h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-[#0F172A] mb-1.5 font-medium">Account Role</label>
                  <select
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs text-[#0F172A] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] transition-all font-medium min-h-[42px]"
                  >
                    <option value="officer">Loan Officer</option>
                    <option value="borrower">Borrower</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-[#0F172A] mb-1.5 font-medium">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] transition-all min-h-[42px]"
              />
            </div>

            <div>
              <label className="block text-[#0F172A] mb-1.5 font-medium">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] transition-all min-h-[42px]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#1E3A8A] hover:bg-[#1D4ED8] active:bg-[#1E3A8A] text-white font-semibold text-xs rounded-lg transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px] cursor-pointer mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{isSignup ? "Creating Account..." : "Authenticating..."}</span>
                </>
              ) : (
                <span>{isSignup ? "Create Account" : "Sign In"}</span>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#475569] font-medium">
          Credence AI — Secure Underwriting Portal
        </p>
      </div>
    </div>
  );
};
