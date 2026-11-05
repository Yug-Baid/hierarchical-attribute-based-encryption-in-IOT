import React from 'react';
import { Download, BarChart3, TrendingUp, Cpu, ShieldCheck, CheckCircle2 } from 'lucide-react';

const benchmarkFigures = [
  {
    id: 'fig5',
    title: 'Design Project Poster Centerpiece (Master 4-Panel Infographic)',
    subtitle: 'Consolidated Evaluation: Edge ML Frontier, Before vs After Speedup, System Gains & Test Matrix',
    src: '/benchmarks/fig5_poster_master_infographic.png',
    filename: 'fig5_poster_master_infographic.png',
    badge: '300 DPI Poster Centerpiece',
    desc: 'The master comprehensive visual ready for poster printing. Combines the Pareto accuracy-latency frontier, end-to-end lifecycle speedup (73.1% reduction), resource savings, and 146 passing test cases.',
  },
  {
    id: 'fig1',
    title: 'Figure 1: Edge ML Classifier Benchmarks (CASE Table III)',
    subtitle: 'Decision Tree vs SVM vs Naive Bayes on Edge Microcontrollers',
    src: '/benchmarks/fig1_edge_ml_benchmark.png',
    filename: 'fig1_edge_ml_benchmark.png',
    badge: 'CASE Table III Replication',
    desc: 'Empirical justification for deploying Decision Trees at the edge: 99.7% accuracy with 2.16s inference and only 4.31k CPU clock cycles (280× lighter than SVM and 14× faster than Naive Bayes).',
  },
  {
    id: 'fig2',
    title: 'Figure 2: Endpoint Lifecycle Comparison — Before vs After',
    subtitle: 'Paper 1 Static HABE (POST /data) vs CASE Autonomous Engine (POST /data/encrypt/autonomous)',
    src: '/benchmarks/fig2_before_vs_after_pipeline.png',
    filename: 'fig2_before_vs_after_pipeline.png',
    badge: '73.1% Lifecycle Speedup',
    desc: 'Quantifies the elimination of the 25-second human-in-the-loop attribute selection delay. Machine-level encryption latency drops by 32.3% due to Algorithm 1 payload splitting.',
  },
  {
    id: 'fig3',
    title: 'Figure 3: System Resource Gains via Algorithm 1 Data Splitting',
    subtitle: 'Network Delay, Energy Drain, Packet Loss, and Ciphertext Compression',
    src: '/benchmarks/fig3_system_improvements_payload_splitting.png',
    filename: 'fig3_system_improvements_payload_splitting.png',
    badge: 'Theorem 4 & Corollary 1',
    desc: 'Splitting raw telemetry ∇ into context signals ∇\' and reduced payload ∇\'\' preserves edge resources: 32.6% network delay reduction, 34.2% energy saving, and 33.8% lower packet loss.',
  },
  {
    id: 'fig4',
    title: 'Figure 4: HABE Pairing Latency Across Depths & O(1) Decryption',
    subtitle: 'Root (Depth 1) → Plant (Depth 2) → Area SDM (Depth 3) & Constant-Time Decryption',
    src: '/benchmarks/fig4_habe_pairing_latency_depths.png',
    filename: 'fig4_habe_pairing_latency_depths.png',
    badge: 'O(1) Decryption Verified',
    desc: 'Empirical confirmation of Wang et al. and Paper 1 Theorem 2: decryption remains invariant at ~4,210 ms across 1-clause, 2-clause, and 3-clause emergency policies.',
  },
];

export default function BenchmarkShowcase({ onTriggerToast }) {
  const downloadImage = (src, filename) => {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename;
    a.click();
    onTriggerToast(`Downloaded ${filename} (300 DPI)!`);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-mono">
                Publication-Grade Results Suite
              </span>
              <span className="text-xs text-neutral-500 font-mono">300 DPI Vector & Raster Figures</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-950 tracking-tight">
              Design Project Poster Figures & Empirical Benchmark Suite
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Publication-grade figures generated from the comparative evaluation between <strong>Paper 1 (Foundational Static HABE)</strong> and <strong>Paper 2 (CASE Autonomous Security Engine)</strong>. Ready for inclusion in design project posters, IEEE conference submissions, and project reports.
            </p>
          </div>

          <button
            onClick={() => downloadImage('/benchmarks/fig5_poster_master_infographic.png', 'poster_centerpiece_300dpi.png')}
            className="rounded-full bg-neutral-950 hover:bg-neutral-800 text-white font-semibold text-xs px-5 py-2.5 shadow-sm transition flex items-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Download Poster Centerpiece</span>
          </button>
        </div>
      </div>

      {/* Figures Display Grid */}
      <div className="space-y-8">
        {benchmarkFigures.map((fig, idx) => (
          <div key={fig.id} className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase">
                    FIGURE 0{idx + 1}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    {fig.badge}
                  </span>
                </div>
                <h3 className="font-bold text-base text-neutral-950 mt-1">{fig.title}</h3>
                <p className="text-xs text-neutral-500 font-mono">{fig.subtitle}</p>
              </div>

              <button
                onClick={() => downloadImage(fig.src, fig.filename)}
                className="rounded-full border border-neutral-300 hover:bg-neutral-950 hover:text-white px-3.5 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm transition flex items-center gap-1.5 self-start sm:self-auto shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save 300 DPI PNG</span>
              </button>
            </div>

            {/* High-Resolution Image Preview */}
            <div className="rounded-xl overflow-hidden border border-neutral-200 bg-[#fcfbf9] shadow-inner p-2">
              <img
                src={fig.src}
                alt={fig.title}
                className="w-full h-auto object-contain rounded-lg"
                loading="lazy"
              />
            </div>

            {/* Description & Scientific Takeaway */}
            <p className="text-xs text-neutral-700 leading-relaxed bg-[#f8f7f4] p-3.5 rounded-xl border border-neutral-200/80">
              <strong>Scientific Takeaway:</strong> {fig.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

