import React, { useState, useEffect } from 'react';
import { API_SERVICE } from '../api/client';
import { 
  KeyRound, 
  ShieldCheck, 
  LockOpen, 
  AlertCircle, 
  CheckCircle2, 
  FileText,
  Copy,
  Hash,
  Database,
  UserCheck,
  Building,
  Cpu,
  Flame,
  ShieldAlert
} from 'lucide-react';

export default function DecryptionPortal({ onTriggerToast }) {
  const [fileId, setFileId] = useState(() => localStorage.getItem('habe_last_record_id') || '');
  const [uskId, setUskId] = useState('company/plantA/areaA1|operator_alice|company/plantA/areaA1:sensor_data');
  const [clauseIdx, setClauseIdx] = useState(0);
  const [operatorAddr, setOperatorAddr] = useState('operator_alice');
  const [activeKeys, setActiveKeys] = useState([]);

  const [loading, setLoading] = useState(false);
  const [decryptResult, setDecryptResult] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  const extractUserFromUsk = (str) => {
    if (!str) return '';
    const parts = str.trim().split('|');
    return parts.length >= 2 ? parts[1].trim() : '';
  };

  const fetchKeys = async () => {
    try {
      const res = await API_SERVICE.getIssuedKeys();
      if (res.data?.ok && res.data.keys?.length > 0) {
        setActiveKeys(res.data.keys);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleUskChange = (val) => {
    setUskId(val);
    const extractedUser = extractUserFromUsk(val);
    if (extractedUser) {
      setOperatorAddr(extractedUser);
    }
  };

  const applyKeySelection = (keyObj) => {
    setUskId(keyObj.uskId);
    setOperatorAddr(keyObj.user);
    
    // Auto-select optimal clause index based on attribute/role
    if (keyObj.attr.includes('emergency_board')) {
      setClauseIdx(2);
    } else if (keyObj.attr.includes('manager') || keyObj.attr.includes('maintenance_team')) {
      setClauseIdx(1);
    } else {
      setClauseIdx(0);
    }
    onTriggerToast(`Switched operator identity to: ${keyObj.user}`);
  };

  const handleDecrypt = async (e) => {
    e.preventDefault();
    if (!fileId) {
      onTriggerToast('Please provide a File ID / Record ID to decrypt');
      return;
    }

    setLoading(true);
    setDecryptResult(null);
    setErrorInfo(null);

    try {
      const res = await API_SERVICE.decryptFile(fileId, uskId, clauseIdx, operatorAddr);
      if (res.data?.ok) {
        setDecryptResult(res.data);
        onTriggerToast(`Gate 1, 2 & 3 verified! Decrypted as ${res.data.operatorAddr || operatorAddr}`);
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      setErrorInfo({
        status,
        gate: status === 409 ? 'Gate 1 (Blockchain Integrity)' : status === 403 ? 'Gate 2 (HABE Policy / Bilinear Match)' : 'System Gate',
        message: data?.error || err.message,
        detail: data?.detail || '',
        chainHash: data?.chainHash,
        localHash: data?.localHash,
      });
      onTriggerToast(`Decryption denied by ${status === 409 ? 'Gate 1' : 'Gate 2'}`);
    } finally {
      setLoading(false);
    }
  };

  const copyPlaintext = () => {
    if (decryptResult?.plaintext) {
      navigator.clipboard.writeText(decryptResult.plaintext);
      onTriggerToast('Copied decrypted plaintext to clipboard!');
    }
  };

  const quickPersonas = [
    { label: 'Alice (Area A1 Tech)', user: 'operator_alice', uskId: 'company/plantA/areaA1|operator_alice|company/plantA/areaA1:sensor_data', clause: 0, tag: 'Plant A SDM' },
    { label: 'Bob (Plant A Mgr)', user: 'manager_bob', uskId: 'company/plantA|manager_bob|company/plantA:manager', clause: 1, tag: 'Plant A DM' },
    { label: 'Dave (Plant A Maint)', user: 'engineer_dave', uskId: 'company/plantA|engineer_dave|company/plantA:maintenance_team', clause: 1, tag: 'Plant A Lead' },
    { label: 'Frank (Plant B Mgr)', user: 'manager_frank', uskId: 'company/plantB|manager_frank|company/plantB:manager', clause: 1, tag: 'Plant B DM' },
    { label: 'Hannah (Plant C Tech)', user: 'operator_hannah', uskId: 'company/plantC/areaC1|operator_hannah|company/plantC/areaC1:sensor_data', clause: 0, tag: 'Plant C SDM' },
    { label: 'Julia (Plant C Mgr)', user: 'manager_julia', uskId: 'company/plantC|manager_julia|company/plantC:manager', clause: 1, tag: 'Plant C DM' },
    { label: 'Emergency Officer', user: 'emergency_officer', uskId: 'company|emergency_officer|company:emergency_board', clause: 2, tag: 'Corporate Safety' },
    { label: 'Grace (Auditor)', user: 'auditor_grace', uskId: 'company|auditor_grace|company:admin_data', clause: 0, tag: 'HQ Governance' },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-mono">
                3-Gate Defense Architecture
              </span>
              <span className="text-xs text-neutral-500 font-mono">Zero-Trust Authorization & Bilinear Decoupling</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              3-Gate Decryption & Cryptographic Verification Portal
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Every data fetch executes a strict 3-stage validation: <strong>Gate 1</strong> verifies on-chain SHA-256 hash match on Hyperledger Besu; <strong>Gate 2</strong> evaluates PBC Type-A bilinear pairings against the dynamic DNF clause; <strong>Gate 3</strong> verifies subject context eligibility.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Select Persona Presets */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800">
              Select Operator Identity & Attribute Secret Key
            </h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">
            {activeKeys.length > 0 ? `${activeKeys.length} Provisioned Enterprise Keys` : 'Default Presets'}
          </span>
        </div>

        {/* Dropdown for All Active Issued Keys */}
        {activeKeys.length > 0 && (
          <div className="pb-2">
            <label className="block text-[11px] font-medium text-neutral-600 mb-1">
              Live Key Registry Dropdown:
            </label>
            <select
              value={uskId}
              onChange={(e) => {
                const found = activeKeys.find(k => k.uskId === e.target.value);
                if (found) {
                  applyKeySelection(found);
                } else {
                  handleUskChange(e.target.value);
                }
              }}
              className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-neutral-800 outline-none focus:border-neutral-900"
            >
              {activeKeys.map((k, i) => (
                <option key={i} value={k.uskId}>
                  {k.user} — {k.dm} ({k.attr.split(':')[1] || k.attr})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Quick Click Persona Badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          {quickPersonas.map((p, i) => {
            const isSelected = operatorAddr === p.user;
            return (
              <button
                key={i}
                type="button"
                onClick={() => applyKeySelection({ user: p.user, uskId: p.uskId, attr: p.uskId.split('|')[2] || '' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono transition border ${
                  isSelected
                    ? 'bg-neutral-950 text-white border-neutral-950 shadow-sm font-semibold'
                    : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100 hover:border-neutral-300'
                }`}
              >
                <span>{p.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-200/80 text-neutral-600'}`}>
                  {p.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Left Column: Decryption Parameters Form */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Decryption Target & Parameters</h3>
              <p className="text-[11px] text-neutral-500 font-mono">GET /data/:fileId Query</p>
            </div>
            <KeyRound className="w-4 h-4 text-emerald-600" />
          </div>

          <form onSubmit={handleDecrypt} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Record ID / File ID:
              </label>
              <input
                type="text"
                required
                placeholder="e.g. sensor_1730... or e2e_sdm_..."
                value={fileId}
                onChange={(e) => setFileId(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-800 outline-none focus:border-neutral-900"
              />
              <span className="text-[10px] text-neutral-400 font-mono block mt-1">
                Tip: Copy from CASE Simulator or Security Lab
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-neutral-700">
                  User Secret Key Identifier (USK ID):
                </label>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Format: dm|user|attribute
                </span>
              </div>
              <textarea
                rows={2}
                required
                value={uskId}
                onChange={(e) => handleUskChange(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900 shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  Operator Identity:
                </label>
                <input
                  type="text"
                  required
                  value={operatorAddr}
                  onChange={(e) => setOperatorAddr(e.target.value)}
                  className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-neutral-900 font-bold outline-none focus:border-neutral-900"
                />
                <span className="text-[10px] text-emerald-600 font-mono mt-0.5 block">
                  ✓ Active: {operatorAddr}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  Target DNF Clause:
                </label>
                <select
                  value={clauseIdx}
                  onChange={(e) => setClauseIdx(parseInt(e.target.value))}
                  className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
                >
                  <option value={0}>Clause 0 (Area SDM)</option>
                  <option value={1}>Clause 1 (Plant Manager / Maint)</option>
                  <option value={2}>Clause 2 (Emergency Board)</option>
                </select>
                <span className="text-[10px] text-neutral-400 font-mono mt-0.5 block">
                  Auto-evaluates candidates
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-neutral-950 hover:bg-neutral-800 py-2.5 text-xs font-semibold text-white shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <LockOpen className="w-3.5 h-3.5" />
              <span>{loading ? 'Evaluating 3 Gates...' : `Decrypt as ${operatorAddr}`}</span>
            </button>
          </form>
        </div>

        {/* Right Column: 3-Gate Pipeline Visualization & Output */}
        <div className="space-y-6">
          {/* Visual 3-Gate Indicators */}
          <div className="grid grid-cols-3 gap-3">
            {/* Gate 1 */}
            <div className={`p-4 rounded-2xl border transition ${
              errorInfo?.status === 409
                ? 'bg-rose-50 border-rose-300'
                : decryptResult
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-white border-neutral-200/80'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-neutral-500">GATE 01</span>
                {errorInfo?.status === 409 ? (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">Failed</span>
                ) : decryptResult ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Passed</span>
                ) : (
                  <span className="text-[10px] font-mono text-neutral-400">Pending</span>
                )}
              </div>
              <h4 className="text-xs font-bold text-neutral-950">Besu Integrity Hash</h4>
              <p className="text-[11px] text-neutral-500 mt-1">SHA-256(CT) match verification</p>
            </div>

            {/* Gate 2 */}
            <div className={`p-4 rounded-2xl border transition ${
              errorInfo?.status === 403
                ? 'bg-rose-50 border-rose-300'
                : decryptResult
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-white border-neutral-200/80'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-neutral-500">GATE 02</span>
                {errorInfo?.status === 403 ? (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">Denied</span>
                ) : decryptResult ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Satisfied</span>
                ) : (
                  <span className="text-[10px] font-mono text-neutral-400">Pending</span>
                )}
              </div>
              <h4 className="text-xs font-bold text-neutral-950">HABE Bilinear Pairings</h4>
              <p className="text-[11px] text-neutral-500 mt-1">Type-A pairing curve decode</p>
            </div>

            {/* Gate 3 */}
            <div className={`p-4 rounded-2xl border transition ${
              decryptResult
                ? 'bg-emerald-50/50 border-emerald-200'
                : 'bg-white border-neutral-200/80'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-neutral-500">GATE 03</span>
                {decryptResult ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Authorized</span>
                ) : (
                  <span className="text-[10px] font-mono text-neutral-400">Active</span>
                )}
              </div>
              <h4 className="text-xs font-bold text-neutral-950">Subject Context Bulletin</h4>
              <p className="text-[11px] text-neutral-500 mt-1">ML pre-computation eligibility</p>
            </div>
          </div>

          {/* Decryption Success Result */}
          {decryptResult && (
            <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h3 className="font-bold text-sm text-neutral-950">Decryption Succeeded</h3>
                    <p className="text-[11px] font-mono text-emerald-700">
                      Decrypted by: <strong>{decryptResult.operatorAddr || operatorAddr}</strong> (Satisfied Clause: {decryptResult.clause_used})
                    </p>
                  </div>
                </div>
                <button
                  onClick={copyPlaintext}
                  className="rounded-full border border-neutral-200 bg-neutral-50 hover:bg-neutral-950 hover:text-white px-3 py-1 text-xs font-semibold text-neutral-700 transition flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy Data
                </button>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
                  Recovered Plaintext (Useful Payload $\\nabla''$):
                </span>
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 font-mono text-xs sm:text-sm text-neutral-900 font-semibold break-all">
                  {decryptResult.plaintext}
                </div>
              </div>

              <div className="pt-2 text-[11px] font-mono text-neutral-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span>Record ID: {decryptResult.recordId}</span>
                <span>Active Operator: <strong>{decryptResult.operatorAddr || operatorAddr}</strong></span>
              </div>
            </div>
          )}

          {/* Denial / Error Result */}
          {errorInfo && (
            <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-rose-700 border-b border-rose-100 pb-3">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Access Denied by {errorInfo.gate}</h3>
              </div>
              <p className="text-xs text-neutral-700 leading-relaxed font-mono">
                {errorInfo.message}
              </p>
              {errorInfo.detail && (
                <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200 text-[11px] font-mono text-rose-900">
                  {errorInfo.detail}
                </div>
              )}
              {errorInfo.chainHash && errorInfo.localHash && (
                <div className="p-3.5 rounded-xl bg-neutral-900 text-white font-mono text-[11px] space-y-2 shadow-inner border border-neutral-800">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
                    <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px]">Gate 1 Integrity Mismatch Trap</span>
                    <span className="text-neutral-400 text-[10px]">Hyperledger Besu Gate</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Immutable Besu Chain Hash:</span>
                    <span className="text-emerald-400 break-all">{errorInfo.chainHash}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Corrupted Off-Chain Disk Hash:</span>
                    <span className="text-rose-400 break-all">{errorInfo.localHash}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
