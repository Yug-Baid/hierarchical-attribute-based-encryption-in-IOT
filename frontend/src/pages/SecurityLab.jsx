import React, { useState, useEffect } from 'react';
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
  Database,
  RefreshCw,
  Copy,
  ExternalLink
} from 'lucide-react';

export default function SecurityLab({ onTriggerToast }) {
  const [targetFileId, setTargetFileId] = useState(() => localStorage.getItem('habe_last_record_id') || '');
  const [availableFiles, setAvailableFiles] = useState([]);
  const [originalHash, setOriginalHash] = useState('');
  const [tamperedHash, setTamperedHash] = useState('');
  const [isTampered, setIsTampered] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [auditLogEntry, setAuditLogEntry] = useState(null);

  // Fetch list of files stored on disk
  const loadFiles = async () => {
    try {
      const res = await API_SERVICE.getStoredFiles();
      if (res.data?.ok && res.data.files?.length > 0) {
        setAvailableFiles(res.data.files);
        // If targetFileId not set or not in files, pick the first one
        if (!targetFileId) {
          const first = res.data.files[res.data.files.length - 1].fileId;
          setTargetFileId(first);
          localStorage.setItem('habe_last_record_id', first);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Fetch real file status from disk and blockchain whenever targetFileId changes
  const checkStatus = async (fId) => {
    const id = fId || targetFileId;
    if (!id) return;
    setLoadingFile(true);
    try {
      const res = await API_SERVICE.getFileStatus(id);
      if (res.data?.ok) {
        setOriginalHash(res.data.chainHash || '');
        setTamperedHash(res.data.localHash || '');
        setIsTampered(res.data.isTampered);
        if (res.data.isTampered) {
          setAuditLogEntry({
            event: 'tamperDetected',
            fileId: id,
            status: 409,
            chainHash: res.data.chainHash,
            localHash: res.data.localHash,
            action: 'GATE 1 BLOCKED: OFF-CHAIN DISK TAMPERING DETECTED',
            timestamp: new Date().toISOString(),
          });
        } else {
          setAuditLogEntry(null);
        }
      }
    } catch (err) {
      setOriginalHash('Record not found on chain or disk');
      setTamperedHash('');
      setIsTampered(false);
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    if (targetFileId) {
      checkStatus(targetFileId);
    }
  }, [targetFileId]);

  // Execute REAL on-disk tampering via API
  const handleTamper = async () => {
    if (!targetFileId) return;
    setTampering(true);
    try {
      const res = await API_SERVICE.tamperFile(targetFileId);
      if (res.data?.ok) {
        setIsTampered(true);
        setTamperedHash(res.data.tamperedHash);
        setOriginalHash(res.data.chainHash || res.data.originalHash);
        setAuditLogEntry({
          event: 'tamperDetected',
          fileId: targetFileId,
          status: 409,
          chainHash: res.data.chainHash,
          localHash: res.data.tamperedHash,
          action: 'EXECUTION HALTED BEFORE HABE PAIRINGS (<10ms TRAP)',
          timestamp: new Date().toISOString(),
        });
        onTriggerToast('Corrupted 1 byte of off-chain .bin file on disk! Gate 1 is now active.');
      }
    } catch (err) {
      onTriggerToast(`Tamper failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTampering(false);
    }
  };

  // Restore REAL pristine ciphertext on disk from backup
  const handleRestore = async () => {
    if (!targetFileId) return;
    setTampering(true);
    try {
      const res = await API_SERVICE.restoreFile(targetFileId);
      if (res.data?.ok) {
        setIsTampered(false);
        setTamperedHash(res.data.hash);
        setAuditLogEntry(null);
        onTriggerToast('Restored pristine ciphertext bytes on disk (.bin file).');
      }
    } catch (err) {
      onTriggerToast(`Restore failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTampering(false);
    }
  };

  // Run Gate 1 Verification
  const runGate1Verification = async () => {
    if (!targetFileId) return;
    setVerifying(true);
    try {
      const res = await API_SERVICE.getFileStatus(targetFileId);
      if (res.data?.ok) {
        setOriginalHash(res.data.chainHash);
        setTamperedHash(res.data.localHash);
        const tampered = res.data.isTampered;
        setIsTampered(tampered);

        if (tampered) {
          setAuditLogEntry({
            event: 'tamperDetected',
            fileId: targetFileId,
            status: 409,
            chainHash: res.data.chainHash,
            localHash: res.data.localHash,
            action: 'GATE 1 TRAP TRIGGERED: HTTP 409 CONFLICT (<10ms REJECTION)',
            timestamp: new Date().toISOString(),
          });
          onTriggerToast('Gate 1 Trap Triggered: HTTP 409 Conflict! Hashes mismatch.');
        } else {
          setAuditLogEntry({
            event: 'integrityVerified',
            fileId: targetFileId,
            status: 200,
            chainHash: res.data.chainHash,
            localHash: res.data.localHash,
            action: 'PASSED GATE 1 -> FORWARDING TO GATE 2 (BILINEAR PAIRING)',
            timestamp: new Date().toISOString(),
          });
          onTriggerToast('Gate 1 Passed! Local SHA-256 matches Besu contract anchor.');
        }
      }
    } catch (err) {
      onTriggerToast(`Verification error: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const copyFileId = () => {
    navigator.clipboard.writeText(targetFileId);
    onTriggerToast('Copied File ID to clipboard!');
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
              <span className="text-xs text-neutral-500 font-mono">Zero-Trust Real Off-Chain Disk Anchor</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              Tamper Attack Simulation & Real Gate 1 Integrity Verification
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Demonstrates why off-chain storage (local disks or cloud .bin files) must be coupled with an immutable Hyperledger Besu hash anchor. When you tamper with the stored ciphertext, Gate 1 detects the SHA-256 discrepancy and immediately terminates before evaluating expensive HABE pairings.
            </p>
          </div>
        </div>
      </div>

      {/* Target Record Selector */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-600" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-neutral-800">
              Select Off-Chain Target File (api/storage/*.bin)
            </h3>
          </div>
          <button
            onClick={() => { loadFiles(); checkStatus(); }}
            className="text-[11px] font-mono text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loadingFile ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <input
              type="text"
              value={targetFileId}
              onChange={(e) => setTargetFileId(e.target.value)}
              placeholder="e.g. sensor_1793855256095_9j00s3"
              className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-neutral-900 font-bold outline-none focus:border-neutral-900"
            />
          </div>
          {availableFiles.length > 0 && (
            <div>
              <select
                value={targetFileId}
                onChange={(e) => setTargetFileId(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-800 outline-none focus:border-neutral-900"
              >
                {availableFiles.map((f, i) => (
                  <option key={i} value={f.fileId}>
                    {f.fileId} {f.isTampered ? '[TAMPERED]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Tamper Injection Control */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Adversarial Injection Console</h3>
              <p className="text-[11px] text-neutral-500 font-mono">Modifies Real Bytes in api/storage/{targetFileId || '<file>'}.bin</p>
            </div>
            <Bug className="w-4 h-4 text-rose-600" />
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5">
              <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">
                Immutable On-Chain Anchor (Besu HABERegistry):
              </span>
              <div className="font-mono text-xs text-neutral-800 break-all p-2 rounded bg-white border border-neutral-200">
                {originalHash || 'Loading on-chain hash...'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Live Off-Chain Ciphertext Hash (Computed from Disk):
                </span>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                  isTampered ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {isTampered ? 'Disk File Tampered' : 'Pristine 100%'}
                </span>
              </div>
              <div className={`font-mono text-xs break-all p-2 rounded border ${
                isTampered 
                  ? 'bg-rose-50 text-rose-900 border-rose-300 font-bold' 
                  : 'bg-white text-neutral-800 border-neutral-200'
              }`}>
                {tamperedHash || 'Computing disk hash...'}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleTamper}
                disabled={tampering || isTampered || !targetFileId}
                className="flex-1 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs py-2.5 shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{tampering ? 'Corrupting Disk...' : 'Tamper 1 Byte on Disk'}</span>
              </button>
              <button
                onClick={handleRestore}
                disabled={tampering || !isTampered || !targetFileId}
                className="rounded-full border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-50 text-neutral-800 font-semibold text-xs px-5 py-2.5 transition"
              >
                Restore Original
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
                Click <strong>"Verify Integrity (Gate 1)"</strong> to test the verification gate. If the hash matches, the ciphertext is forwarded to the Type-A bilinear pairing engine (Gate 2). If tampered, it halts immediately with HTTP 409 and emits an audit event.
              </p>

              <button
                onClick={runGate1Verification}
                disabled={verifying || !targetFileId}
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

          <div className="pt-4 border-t border-neutral-100 space-y-2">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
              <div>
                <strong>Notice:</strong> When tampered, this file is blocked across the entire system.
              </div>
              <button
                onClick={copyFileId}
                className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition flex items-center gap-1 shrink-0"
              >
                <Copy className="w-3 h-3" /> Copy ID for Decryption Portal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
