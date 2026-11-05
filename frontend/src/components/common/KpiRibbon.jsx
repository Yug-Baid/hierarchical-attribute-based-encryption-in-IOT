import React from 'react';

export default function KpiRibbon({ stats = {} }) {
  const {
    activeModel = 'CASE Two-Sided Adaptive',
    inferenceLatency = '2.16s',
    gate1Integrity = '100%',
    curvePairing = 'Type-A SS512',
  } = stats;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Primary Hero Card in Black */}
      <div className="rounded-2xl border border-neutral-900 bg-neutral-950 p-5 shadow-sm hover:shadow-md transition text-white">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-400">Adaptive Security Engine</p>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 rounded-full px-2 py-0.5">
            Active
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-white tracking-tight font-mono">
          99.92% Acc
        </p>
        <p className="mt-1 text-xs text-neutral-400 font-medium">
          Decision Tree (CASE Table III)
        </p>
      </div>

      {/* 2. White Card: Latency & Cycles */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500">Edge Classification Speed</p>
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
            4.31k Cycles
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-neutral-950 tracking-tight font-mono">
          {inferenceLatency}
        </p>
        <p className="mt-1 text-xs text-neutral-500 font-medium">
          Edge DT vs 603s SVM Benchmark
        </p>
      </div>

      {/* 3. White Card: Gate 1 On-Chain Integrity */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500">Gate 1 Integrity Retention</p>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            Zero Tamper Pass
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-neutral-950 tracking-tight font-mono">
          {gate1Integrity}
        </p>
        <p className="mt-1 text-xs text-neutral-500 font-medium">
          Besu Hash Verified before HABE
        </p>
      </div>

      {/* 4. White Card: Cryptographic Bilinear Group */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500">HABE Bilinear Core</p>
          <span className="text-[10px] font-bold text-neutral-900 bg-neutral-100 border border-neutral-300 rounded-full px-2 py-0.5">
            PBC C Core
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-neutral-950 tracking-tight font-mono">
          {curvePairing}
        </p>
        <p className="mt-1 text-xs text-neutral-500 font-medium">
          Type-A Pairing e(Q₀, n_A · r · P₁)
        </p>
      </div>
    </div>
  );
}

