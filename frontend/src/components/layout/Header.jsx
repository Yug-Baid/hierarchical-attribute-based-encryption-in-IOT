import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { API_SERVICE } from '../../api/client';
import { RefreshCw, Presentation, ShieldCheck, AlertCircle } from 'lucide-react';

const routeTitles = {
  '/': { subtitle: 'Computational Console', title: 'System Overview & Architecture Hub' },
  '/telemetry': { subtitle: 'CASE Paper Algorithm 1', title: 'Edge Telemetry Simulator & Policy Engine' },
  '/hierarchy': { subtitle: 'Cryptographic Domain Tree', title: 'HABE Authority & Node Key Manager' },
  '/access-portal': { subtitle: 'Verification Pipeline', title: '3-Gate Decryption & Access Control' },
  '/security-lab': { subtitle: 'Integrity Defense', title: 'Security Lab & Tamper Attack Simulator' },
  '/audit-trail': { subtitle: 'On-Chain Ledger', title: 'Hyperledger Besu Explorer & Audit Trail' },
  '/benchmarks': { subtitle: 'Publication Results', title: 'Design Project Poster & Benchmark Suite' },
};

export default function Header({ onOpenPresentation, onRefresh }) {
  const location = useLocation();
  const current = routeTitles[location.pathname] || {
    subtitle: 'Research Console',
    title: 'HABE & CASE Security Platform',
  };

  const [gatewayOk, setGatewayOk] = useState(null);
  const [mlOk, setMlOk] = useState(null);

  const checkStatus = async () => {
    try {
      const gRes = await API_SERVICE.getHealth();
      setGatewayOk(gRes.data?.ok === true);
    } catch (_) {
      setGatewayOk(false);
    }
    try {
      const mRes = await API_SERVICE.getMlHealth();
      setMlOk(mRes.data?.ok === true || mRes.data?.status === 'ok');
    } catch (_) {
      setMlOk(false);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/80 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div>
          <span className="text-[11px] font-mono font-semibold text-neutral-500 uppercase tracking-wider">
            {current.subtitle}
          </span>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-950 tracking-tight">
            {current.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Gateway Health Indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-mono shadow-sm">
          <span className={`w-2 h-2 rounded-full ${gatewayOk ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-neutral-600">Gateway:</span>
          <span className={`font-semibold ${gatewayOk ? 'text-emerald-700' : 'text-rose-700'}`}>
            {gatewayOk ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* ML Health Indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-mono shadow-sm">
          <span className={`w-2 h-2 rounded-full ${mlOk ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-neutral-600">ML Engine:</span>
          <span className={`font-semibold ${mlOk ? 'text-blue-700' : 'text-amber-700'}`}>
            {mlOk ? 'Active' : 'Standby'}
          </span>
        </div>

        {/* Presentation Button */}
        <button
          onClick={onOpenPresentation}
          className="rounded-full border border-neutral-300 bg-white hover:bg-neutral-950 hover:text-white px-3.5 py-1.5 text-xs font-medium text-neutral-800 shadow-sm transition flex items-center gap-1.5"
        >
          <Presentation className="w-3.5 h-3.5" />
          <span>Paper Deck</span>
        </button>

        {/* Refresh View */}
        <button
          onClick={onRefresh}
          className="rounded-full bg-neutral-950 hover:bg-neutral-800 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync State</span>
        </button>
      </div>
    </header>
  );
}

