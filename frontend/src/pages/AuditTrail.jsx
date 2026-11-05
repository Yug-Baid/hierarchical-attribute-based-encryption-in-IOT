import React, { useState } from 'react';
import { 
  Blocks, 
  Search, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle,
  FileText,
  Clock,
  Filter
} from 'lucide-react';

import { API_SERVICE } from '../api/client';
import { useEffect } from 'react';

export default function AuditTrail({ onTriggerToast }) {
  const [filterEvent, setFilterEvent] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await API_SERVICE.getAuditLogs();
      if (res.data?.ok && res.data.logs?.length > 0) {
        setAuditLogs(res.data.logs);
        setIsLive(true);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchLogs();
    setLoading(false);
    onTriggerToast('Synchronized with on-chain audit ledger!');
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchEvent = filterEvent === 'ALL' || log.event === filterEvent;
    const matchSearch =
      log.recordId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.txHash.toLowerCase().includes(searchQuery.toLowerCase());
    return matchEvent && matchSearch;
  });

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(auditLogs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habe_audit_trail_${Date.now()}.json`;
    a.click();
    onTriggerToast('Exported audit trail logs to JSON!');
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-mono">
                Immutable Ledger
              </span>
              <span className="text-xs text-neutral-500 font-mono">HABERegistry.sol Smart Contract</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              Hyperledger Besu On-Chain Audit Trail & Forensic Explorer
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Every autonomous encryption, node registration, and tamper attempt generates an indexed on-chain transaction receipt. Audit logs are permanently logged in <code>api/logs/audit.log</code> and queryable on the EVM consensus network.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualRefresh}
              className="rounded-full border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-800 font-semibold text-xs px-4 py-2.5 shadow-sm transition flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              <span>{loading ? 'Refreshing...' : 'Refresh Logs'}</span>
            </button>
            <button
              onClick={exportJSON}
              className="rounded-full bg-neutral-950 hover:bg-neutral-800 text-white font-semibold text-xs px-5 py-2.5 shadow-sm transition flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Logs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-80">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by Record ID or Tx Hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-mono bg-transparent outline-none text-neutral-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="text-xs font-mono rounded-xl border border-neutral-200 bg-white p-1.5 text-neutral-800 outline-none focus:border-neutral-900"
          >
            <option value="ALL">All Events</option>
            <option value="dataStoredAutonomous">dataStoredAutonomous</option>
            <option value="tamperDetected">tamperDetected</option>
            <option value="registerNode">registerNode</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#f4f1eb] text-neutral-700 border-b border-neutral-200">
              <tr>
                <th className="p-3.5 font-bold">Event Type</th>
                <th className="p-3.5 font-bold">Record ID</th>
                <th className="p-3.5 font-bold">EVM Tx Hash</th>
                <th className="p-3.5 font-bold">State / Status</th>
                <th className="p-3.5 font-bold">Timestamp</th>
                <th className="p-3.5 font-bold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50 transition">
                  <td className="p-3.5 font-semibold">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] ${
                      log.event === 'tamperDetected'
                        ? 'bg-rose-100 text-rose-800 font-bold'
                        : log.event === 'dataStoredAutonomous'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}>
                      {log.event}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold">{log.recordId}</td>
                  <td className="p-3.5 text-neutral-500 truncate max-w-[180px]">
                    {log.txHash}
                  </td>
                  <td className="p-3.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      log.predicted_state === 'CRITICAL' || log.status.includes('409')
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : log.predicted_state === 'WARNING'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {log.predicted_state}
                    </span>
                  </td>
                  <td className="p-3.5 text-neutral-400 text-[11px]">
                    {log.timestamp.slice(11, 19)}
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setSelectedTx(log)}
                      className="rounded-full border border-neutral-300 hover:bg-neutral-950 hover:text-white px-2.5 py-1 text-[11px] transition inline-flex items-center gap-1 font-sans font-medium"
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Modal Detail */}
      {selectedTx && (
        <div 
          className="presentation-overlay active"
          onClick={() => setSelectedTx(null)}
        >
          <div 
            className="presentation-modal-container max-w-lg p-6 bg-white space-y-4 rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-bold text-sm text-neutral-950">Transaction Receipt Detail</h3>
              <button 
                onClick={() => setSelectedTx(null)}
                className="text-neutral-400 hover:text-neutral-900 text-xs font-bold"
              >
                Close ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono text-neutral-700">
              <div>
                <span className="text-neutral-400 block text-[10px]">EVENT:</span>
                <span className="font-bold text-neutral-900">{selectedTx.event}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">RECORD ID:</span>
                <span className="font-semibold text-neutral-900">{selectedTx.recordId}</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">TRANSACTION HASH:</span>
                <span className="break-all p-2 bg-neutral-50 rounded border border-neutral-200 block text-[11px]">
                  {selectedTx.txHash}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-neutral-400 block text-[10px]">PLANT ID:</span>
                  <span>{selectedTx.plantId}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">STATUS:</span>
                  <span className="font-bold text-emerald-700">{selectedTx.status}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedTx(null)}
                className="rounded-full bg-neutral-950 text-white px-4 py-1.5 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

