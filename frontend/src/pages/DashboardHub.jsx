import React, { useState, useEffect } from 'react';
import { API_SERVICE } from '../api/client';
import { 
  Network, 
  Cpu, 
  ShieldCheck, 
  Blocks, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle,
  Play
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardHub({ onTriggerToast }) {
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [hierarchyData, setHierarchyData] = useState(null);
  const [nodeCount, setNodeCount] = useState(0);

  const fetchStatus = async () => {
    try {
      const res = await API_SERVICE.getNodes();
      if (res.data?.ok) {
        setNodeCount(res.data.nodes?.length || 0);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleBootstrap = async () => {
    setBootstrapLoading(true);
    try {
      const res = await API_SERVICE.setupHierarchy();
      if (res.data?.ok) {
        setHierarchyData(res.data.hierarchy);
        onTriggerToast('HABE Hierarchy provisioned on chain and C-Engine!');
        fetchStatus();
      }
    } catch (err) {
      onTriggerToast(`Bootstrap failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBootstrapLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner Card */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full font-mono">
                IEEE IoTJ 2022 Implementation
              </span>
              <span className="text-xs text-neutral-500 font-mono">PBC Core 0.5.14 + Besu QBFT</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-950 tracking-tight">
              CASE Autonomous Context-Aware Policy Engine & Blockchain-Aided HABE
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Eliminating human-in-the-loop attribute selection in Society 5.0. Incoming IoT sensor streams are split into context telemetry ($\nabla_i'$) and encrypted payload ($\nabla_i''$), evaluated via an edge Decision Tree classifier, and anchored to Hyperledger Besu with 3-Gate defense.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={handleBootstrap}
              disabled={bootstrapLoading}
              className="rounded-full bg-neutral-950 hover:bg-neutral-800 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{bootstrapLoading ? 'Provisioning...' : 'Bootstrap HABE Tree'}</span>
            </button>
            <Link
              to="/telemetry"
              className="rounded-full border border-neutral-300 bg-white hover:bg-neutral-950 hover:text-white px-5 py-2.5 text-xs font-semibold text-neutral-800 shadow-sm transition flex items-center justify-center gap-2"
            >
              <span>Launch Simulator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {hierarchyData && (
          <div className="mt-6 pt-6 border-t border-neutral-100">
            <p className="text-xs font-mono font-semibold text-neutral-700 mb-2">
              Hierarchy Successfully Registered ({Object.keys(hierarchyData).length} Nodes):
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(hierarchyData).map((node) => (
                <span key={node} className="text-[11px] font-mono bg-neutral-100 border border-neutral-200 text-neutral-800 px-2.5 py-1 rounded-lg">
                  {node}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6-Stage Industrial Pipeline Flow */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-neutral-950 uppercase tracking-wider text-[11px]">
            End-to-End Pipeline Architecture
          </h3>
          <span className="text-[11px] font-mono text-neutral-500">Autonomous Data Lifecycle</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Step 1 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 01</span>
              <h4 className="font-bold text-xs text-neutral-950">Sensor Ingestion</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Industrial sensors collect Temp, Vib, Press, Gas ppm.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-blue-600 font-semibold">
              Split: ∇' & ∇''
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 02</span>
              <h4 className="font-bold text-xs text-neutral-950">Edge DT Classifier</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Decision Tree predicts NORMAL, WARNING, CRITICAL state.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-indigo-600 font-semibold">
              Latency: 2.16s
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 03</span>
              <h4 className="font-bold text-xs text-neutral-950">HABE SDM Encrypt</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Formulates DNF policy and executes Type-A pairings.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-purple-600 font-semibold">
              PBC C-Core
            </div>
          </div>

          {/* Step 4 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 04</span>
              <h4 className="font-bold text-xs text-neutral-950">Off-Chain Storage</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Persists encrypted ciphertext bytes to .bin storage.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-neutral-600 font-semibold">
              Local / IPFS
            </div>
          </div>

          {/* Step 5 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 05</span>
              <h4 className="font-bold text-xs text-neutral-950">Besu Hash Anchor</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Stores SHA-256(CT) on HABERegistry.sol smart contract.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-amber-600 font-semibold">
              Gate 1 Anchor
            </div>
          </div>

          {/* Step 6 */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold text-neutral-400">STAGE 06</span>
              <h4 className="font-bold text-xs text-neutral-950">3-Gate Decryption</h4>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Integrity Hash, Bilinear Pairing, and ML Bulletin verified.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-[10px] font-mono text-emerald-600 font-semibold">
              Zero-Trust
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Feature Spotlights */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Cryptographic Foundation */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h4 className="font-bold text-sm text-neutral-950">Mathematical Group Parameters</h4>
            <span className="text-[10px] font-mono text-neutral-600 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full font-semibold">
              PBC Type-A SS512
            </span>
          </div>

          <div className="math-box text-xs">
            {"V = M \\oplus H_2(\\hat{e}(Q_0, \\, n_A \\cdot r \\cdot P_1))"}
          </div>

          <p className="text-xs text-neutral-600 leading-relaxed">
            In HABE, domain master keys share the top-level root element $P_1 = H_1(\text{"company"})$. This invariant guarantees that multi-clause dynamic policies formulated during industrial emergencies decrypt cleanly across Area SDMs, Plant Managers, and Company Emergency Authorities without multi-curve collisions.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-xl bg-[#f4f1eb] p-3 text-center border border-neutral-200/80">
              <span className="block text-[10px] uppercase font-bold text-neutral-500">Group Order</span>
              <span className="block text-sm font-bold font-mono text-neutral-900 mt-0.5">160-bit prime</span>
            </div>
            <div className="rounded-xl bg-[#f4f1eb] p-3 text-center border border-neutral-200/80">
              <span className="block text-[10px] uppercase font-bold text-neutral-500">Base Field</span>
              <span className="block text-sm font-bold font-mono text-neutral-900 mt-0.5">512-bit</span>
            </div>
          </div>
        </div>

        {/* Right: Registered Consortium Nodes */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h4 className="font-bold text-sm text-neutral-950">Consortium Node Topology</h4>
            <span className="text-[10px] font-mono text-neutral-900 bg-neutral-100 border border-neutral-200 rounded-full px-2.5 py-0.5 font-semibold">
              {nodeCount} Nodes Synced
            </span>
          </div>

          <p className="text-xs text-neutral-600 leading-relaxed">
            Every plant and sub-area operates as an authorized cryptographic node mapped to a deterministic 20-byte address on Hyperledger Besu.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
              <span className="font-mono text-neutral-800 font-semibold">company</span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Root Master (Depth 1)</span>
            </div>
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
              <span className="font-mono text-neutral-800 font-semibold">company/plantA</span>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">Domain Master (Depth 2)</span>
            </div>
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
              <span className="font-mono text-neutral-800 font-semibold">company/plantA/areaA1</span>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Sub-Domain Master (Depth 3)</span>
            </div>
          </div>

          <Link
            to="/hierarchy"
            className="text-xs font-semibold text-neutral-900 hover:text-blue-600 flex items-center justify-end gap-1 transition pt-2"
          >
            <span>Manage Domain Nodes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
