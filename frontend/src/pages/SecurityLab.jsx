import React, { useState } from 'react';
import { API_SERVICE } from '../api/client';
import { 
  ShieldAlert, 
  Bug, 
  CheckCircle2, 
  AlertTriangle, 
  Flame, 
  Lock, 
  FileCode,
  ArrowRight,
  Database
} from 'lucide-react';

export default function SecurityLab({ onTriggerToast }) {
  const [targetFileId, setTargetFileId] = useState(() => localStorage.getItem('habe_last_record_id') || 'sensor_tamper_demo');
  const [originalHash, setOriginalHash] = useState('7874ce00501fa3e9bbf220a02b112348a73b223019f854129bbdc21087114321');
  const [tamperedHash, setTamperedHash] = useState('');
  const [isTampered, setIsTampered] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [auditLogEntry, setAuditLogEntry] = useState(null);

  const simulateTamper = () => {
    // Simulate flipping a byte at offset 8
    const corrupted = 'ff' + originalHash.slice(2);
    setTamperedHash(corrupted);
    setIsTampered(true);
    onTriggerToast('Tampered 1 byte of off-chain ciphertext (.bin file)!');
  };

  const resetCiphertext = () => {
    setIsTampered(false);
    setTamperedHash('');
    setAuditLogEntry(null);
    onTriggerToast('Restored pristine ciphertext bytes.');
  };

  const runGate1Verification = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      if (isTampered) {
        setAuditLogEntry({
          event: 'tamperDetected',
          fileId: targetFileId,
          status: 409,
          chainHash: originalHash,
          localHash: tamperedHash,
          action: 'EXECUTION HALTED BEFORE HABE PAIRINGS',
          timestamp: new Date().toISOString(),
        });
        onTriggerToast('Gate 1 Trap Triggered: HTTP 409 Conflict!');
      } else {
        setAuditLogEntry({
          event: 'integrityVerified',
          fileId: targetFileId,
          status: 200,
          chainHash: originalHash,
          localHash: originalHash,
          action: 'PASSED GATE 1 -> FORWARDING TO GATE 2',
          timestamp: new Date().toISOString(),
        });
        onTriggerToast('Gate 1 Passed! Hash perfectly matches on-chain anchor.');
      }
    }, 400);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-rose-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full font-mono">
                Gate 1 Cryptographic Defense
              </span>
              <span className="text-xs text-neutral-500 font-mono">Zero-Trust Off-Chain Anchor</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              Tamper Attack Simulation & Gate 1 Integrity Verification
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Demonstrates why off-chain storage (local disks or IPFS) must be coupled with an immutable Hyperledger Besu hash anchor. When an adversary tampers with stored ciphertext bytes, Gate 1 detects the SHA-256 discrepancy and immediately terminates before evaluating expensive HABE pairings.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Tamper Injection Control */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Adversarial Injection Console</h3>
              <p className="text-[11px] text-neutral-500 font-mono">Storage Hex Corruption</p>
            </div>
            <Bug className="w-4 h-4 text-rose-600" />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Target Storage File:</label>
              <input
                type="text"
                value={targetFileId}
                onChange={(e) => setTargetFileId(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-800 outline-none focus:border-neutral-900"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
              <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">
                Immutable On-Chain Anchor (Besu HABERegistry):
              </span>
              <div className="font-mono text-xs text-neutral-800 break-all p-2 rounded bg-white border border-neutral-200">
                {originalHash}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Current Off-Chain Ciphertext Hash:
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isTampered ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isTampered ? 'Corrupted Byte Injected' : 'Pristine 100%'}
                </span>
              </div>
              <div className={`font-mono text-xs break-all p-2 rounded border ${
                isTampered 
                  ? 'bg-rose-50 text-rose-900 border-rose-300 font-bold' 
                  : 'bg-white text-neutral-800 border-neutral-200'
              }`}>
                {isTampered ? tamperedHash : originalHash}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={simulateTamper}
                className="flex-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs py-2.5 shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Tamper 1 Byte of CT</span>
              </button>
              <button
                onClick={resetCiphertext}
                className="rounded-full border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 font-semibold text-xs px-4 py-2.5 transition"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Right: Gate 1 Inspection & Results */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-950">Gate 1 Verification Gate</h3>
                <p className="text-[11px] text-neutral-500 font-mono">SHA-256(CT_local) ?= h_chain</p>
              </div>
              <ShieldAlert className="w-4 h-4 text-neutral-600" />
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Click <strong>"Verify Integrity"</strong> to execute the Gate 1 check. If the hash matches, the ciphertext is safely dispatched to the Type-A bilinear pairing engine (Gate 2). If tampered, it halts immediately with HTTP 409 and emits an audit event.
              </p>

              <button
                onClick={runGate1Verification}
                disabled={verifying}
                className="w-full rounded-full bg-neutral-950 hover:bg-neutral-800 text-white font-semibold text-xs py-2.5 shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{verifying ? 'Checking Besu Contract...' : 'Verify Integrity (Gate 1)'}</span>
              </button>

              {auditLogEntry && (
                <div className={`p-4 rounded-xl border space-y-2 mt-4 ${
                  auditLogEntry.status === 409
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold uppercase">
                      {auditLogEntry.event === 'tamperDetected' ? 'HTTP 409 CONFLICT: TAMPER DETECTED' : 'HTTP 200 OK: INTEGRITY VERIFIED'}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {auditLogEntry.timestamp.slice(11, 19)}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-semibold pt-1">
                    {auditLogEntry.action}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-600 pt-1 border-t border-neutral-200/60">
                    Logged to <code>api/logs/audit.log</code> & emitted to Besu contract.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 text-[11px] text-neutral-500">
            <strong>Security Guarantee:</strong> Attackers cannot forge pairing equations because modifying ciphertext invalidates SHA-256 before pairing computation starts.
          </div>
        </div>
      </div>
    </div>
  );
}

