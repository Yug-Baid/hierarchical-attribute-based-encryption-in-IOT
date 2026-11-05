# IEEE Conference Report: Blockchain-Aided HABE with Dual-Layer ML

This directory contains the complete, publication-grade LaTeX manuscript formatted according to the **IEEE Conference Template** standard (two-column `IEEEtran`).

---

## 📁 File Structure
```text
report/
├── main.tex                       # Complete, compile-ready IEEE LaTeX document
├── README.md                      # Compilation instructions & image guide
└── images/                        # High-resolution (300 DPI) publication figures
    ├── fig_habe_architecture.png  # Fig. 1: 3-tier HABE tree + Dual-Gate architecture
    ├── fig_crypto_benchmarks.png  # Fig. 2: Pairing latencies & O(1) decryption proof
    ├── fig1_edge_ml_benchmark.png
    ├── fig2_before_vs_after_pipeline.png
    ├── fig3_system_improvements_payload_splitting.png
    ├── fig4_habe_pairing_latency_depths.png
    └── fig5_poster_master_infographic.png
```

---

## 🚀 How to Compile

### Option A: Overleaf (One-Click)
1. Zip the `report/` folder containing `main.tex` and `images/`.
2. On Overleaf, select **New Project** $\to$ **Upload Project** and drop the `.zip` file.
3. Overleaf compiles `main.tex` with zero errors.

### Option B: Local Command Line
```bash
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

---

## 📊 Benchmark Highlights in the Report
- **Edge ML Classifier:** Decision Tree executes in $1.8\text{ ms}$ on gateway servers ($2.16\text{ s}$ on edge MCU) with $99.7\%$ accuracy and only $4.31 \times 10^3$ CPU clock cycles.
- **Cryptographic Speedup:** Contextual payload splitting ($\nabla_i = \nabla_i' \cup \nabla_i''$) reduces pairing encryption time by $32.3\%$ ($4,212\text{ ms} \to 2,853\text{ ms}$) and ciphertext size by $31.4\%$.
- **Constant-Time $O(1)$ Decryption:** Bilinear pairing decryption latency is strictly invariant at $\approx 4,210\text{ ms}$ across 1-attribute, 2-attribute DNF, and 3-clause emergency policies.
- **Gate 1 Blockchain Integrity:** Pre-decryption on-chain hash check on Hyperledger Besu traps tampered data in $<10\text{ ms}$ (HTTP 409 Conflict).
- **Gate 3 Public Bulletin:** In-memory user attribute verification executes in $<5\text{ ms}$.
- **End-to-End Speedup:** Autonomous pipeline achieves a $73.1\%$ total latency drop ($33.1\text{ s} \to 8.91\text{ s}$).
- **Validation:** 100% pass across all 146 test vectors.
