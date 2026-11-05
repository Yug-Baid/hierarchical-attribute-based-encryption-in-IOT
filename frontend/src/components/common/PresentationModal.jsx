import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

const slides = [
  {
    title: 'The Bottleneck: Static Policy Strings in IIoT',
    subtitle: 'Human-in-the-Loop Policy Creation & Computational Overhead',
    content: (
      <div className="space-y-4">
        <ul className="slide-bullets">
          <li><strong>Autonomous IoT Data Splitting:</strong> Traditional CP-ABE and HABE systems require static human-selected access trees before encryption, introducing human error and vulnerability during fast-moving industrial anomalies.</li>
          <li><strong>CASE Breakthrough:</strong> Automates hierarchical policy construction dynamically by splitting sensor inputs into context telemetry $\nabla_i'$ and reduced payload $\nabla_i''$.</li>
          <li><strong>Cryptographic Efficiency:</strong> By encrypting only the essential payload ($S(\nabla_i'') &lt; S(\nabla_i)$), edge nodes preserve bandwidth, energy, and CPU clock cycles.</li>
        </ul>
        <div className="math-box">
          {"S(\\nabla_i'') < S(\\nabla_i) \\implies \\text{Latency Reduction: } \\mathcal{O}(|\\nabla_i''|) \\ll \\mathcal{O}(|\\nabla_i|)"}
        </div>
      </div>
    ),
  },
  {
    title: 'Two-Sided Adaptive Security Architecture',
    subtitle: 'Dual Context Evaluation: Subject (User) and Object (Data)',
    content: (
      <div className="space-y-4">
        <ul className="slide-bullets">
          <li><strong>Object Context (Data-Side / Gate 2):</strong> Incoming IoT sensor streams are classified by an Edge Decision Tree into NORMAL, WARNING, or CRITICAL states, autonomously reformulating the HABE DNF policy before encryption.</li>
          <li><strong>Subject Context (User-Side / Gate 3):</strong> User role, location, device trust, and past violation metrics are scored to issue authorized attribute bulletins in Hyperledger Besu.</li>
          <li><strong>No Single Point of Failure:</strong> Both the data's operational state and the requester's behavioral trust are cryptographically bound.</li>
        </ul>
        <div className="math-box">
          {"\\text{Policy}(\\pi) = f_{\\text{DT}}(\\text{Temp}, \\text{Vib}, \\text{Press}, \\text{Gas}) \\times \\text{Bulletin}(U_{\\text{addr}})"}
        </div>
      </div>
    ),
  },
  {
    title: 'Three-Gate Defense Pipeline',
    subtitle: 'Zero-Trust Defense Halting Tampered Attacks Before HABE Pairings',
    content: (
      <div className="space-y-4">
        <ul className="slide-bullets">
          <li><strong>Gate 1 (Blockchain Integrity Anchor):</strong> Hyperledger Besu verifies SHA-256(CT) == h_stored. If an attacker tampers with even 1 byte of off-chain storage, execution halts immediately with 409 Conflict.</li>
          <li><strong>Gate 2 (HABE Bilinear Pairings):</strong> Data decodes iff user attribute secret keys satisfy the dynamic DNF clause via PBC Type-A supersingular pairings.</li>
          <li><strong>Gate 3 (ML Bulletin Gate):</strong> Dynamic context revocation prevents revoked or degraded operators from decrypting sensitive plant data.</li>
        </ul>
        <div className="math-box">
          {"V = M \\oplus H_2(\\hat{e}(Q_0, \\, n_A \\cdot r \\cdot P_1)), \\quad P_1 = H_1(\\text{ancestor\\_pks}[0])"}
        </div>
      </div>
    ),
  },
  {
    title: 'Empirical Edge Benchmarks (CASE Table III)',
    subtitle: 'Why Decision Tree Outperforms SVM and Naive Bayes on Edge Nodes',
    content: (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-neutral-200 rounded-xl overflow-hidden">
            <thead className="bg-[#f4f1eb] text-neutral-800 font-mono">
              <tr>
                <th className="p-2.5">Model</th>
                <th className="p-2.5">Accuracy</th>
                <th className="p-2.5">Inference Latency</th>
                <th className="p-2.5">CPU Clock Cycles</th>
                <th className="p-2.5">Edge Feasibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-mono text-neutral-700">
              <tr className="bg-emerald-50/50 font-semibold text-emerald-900">
                <td className="p-2.5">Decision Tree (Ours)</td>
                <td className="p-2.5">99.7%</td>
                <td className="p-2.5">2.16s</td>
                <td className="p-2.5">4.31 × 10³</td>
                <td className="p-2.5 text-emerald-700">Optimal (Ultra-Low)</td>
              </tr>
              <tr>
                <td className="p-2.5">Naive Bayes</td>
                <td className="p-2.5">64.4%</td>
                <td className="p-2.5">2.14s</td>
                <td className="p-2.5">4.28 × 10³</td>
                <td className="p-2.5 text-amber-700">Low Accuracy</td>
              </tr>
              <tr>
                <td className="p-2.5">Support Vector Machine</td>
                <td className="p-2.5">99.9%</td>
                <td className="p-2.5">603.2s</td>
                <td className="p-2.5">1.20 × 10⁶</td>
                <td className="p-2.5 text-rose-700">Impractical for Edge</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-600 leading-relaxed">
          The Decision Tree achieves near-perfect classification while requiring <strong>280× less CPU overhead</strong> than SVM, making it the mathematically justified choice for resource-constrained IoT gateways.
        </p>
      </div>
    ),
  },
];

export default function PresentationModal({ isOpen, onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const slide = slides[currentSlide];

  return (
    <div className="presentation-overlay active" onClick={onClose}>
      <div 
        className="presentation-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navbar */}
        <div className="presentation-navbar">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-neutral-800" />
            <span className="font-bold text-xs uppercase tracking-wider text-neutral-700">
              CASE Research Presentation Deck (IEEE IoTJ 2022)
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-neutral-200 transition text-neutral-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="presentation-viewport">
          <h2 className="slide-heading">{slide.title}</h2>
          <p className="slide-subheading">{slide.subtitle}</p>
          <div className="slide-body">{slide.content}</div>
        </div>

        {/* Toolbar */}
        <div className="presentation-toolbar">
          <div className="text-xs font-mono font-medium text-neutral-500">
            Slide {currentSlide + 1} of {slides.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
              disabled={currentSlide === 0}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-800 shadow-sm disabled:opacity-40 hover:bg-neutral-100 transition flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              onClick={() => setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))}
              disabled={currentSlide === slides.length - 1}
              className="rounded-full bg-neutral-950 px-4 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-neutral-800 transition flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
