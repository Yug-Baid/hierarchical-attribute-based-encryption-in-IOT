"""
generate_clean_report_figures.py
================================
Clean, Publication-Grade Academic Figures for IEEE Conference Report.
Removes all artificial elements, cartoon speech bubbles, and visual clutter.

Generates:
1. fig_habe_architecture.png: Clean vector-style 3-tier HABE + Dual-Gate architecture diagram.
2. fig_crypto_benchmarks.png: Pairing latency across depths & O(1) constant decryption.
3. fig1_edge_ml_benchmark.png: Clean Model Accuracy, Latency, and Cycles comparison.
4. fig2_before_vs_after_pipeline.png: Clean Data Lifecycle & Encryption Speedup.
5. fig3_system_improvements_payload_splitting.png: Resource preservation & transmission scaling.
6. fig4_habe_pairing_latency_depths.png: High-res copy matching fig_crypto_benchmarks.
7. fig5_poster_master_infographic.png: Simple, clean 4-panel poster centerpiece.
"""

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ArrowStyle

# Target directories
DIRS = [
    os.path.abspath("e:/All Projects/HABE/report/images"),
    os.path.abspath("e:/All Projects/HABE/ml/benchmarks"),
    os.path.abspath("e:/All Projects/HABE/frontend/public/benchmarks")
]
for d in DIRS:
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------------------
# Academic Minimalist Styling
# ---------------------------------------------------------------------------
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']
plt.rcParams['figure.facecolor'] = '#ffffff'
plt.rcParams['axes.facecolor'] = '#ffffff'
plt.rcParams['axes.edgecolor'] = '#334155'
plt.rcParams['axes.linewidth'] = 0.8
plt.rcParams['grid.color'] = '#e2e8f0'
plt.rcParams['grid.linestyle'] = '--'
plt.rcParams['grid.linewidth'] = 0.5
plt.rcParams['xtick.color'] = '#1e293b'
plt.rcParams['ytick.color'] = '#1e293b'
plt.rcParams['text.color'] = '#0f172a'

# Academic Muted Color Palette
C_PRIMARY   = '#1e3a8a'   # Classic Navy
C_SECONDARY = '#475569'   # Slate Grey
C_MUTED     = '#94a3b8'   # Light Slate
C_ACCENT    = '#047857'   # Forest Green
C_ALERT     = '#b91c1c'   # Deep Brick Red
C_LIGHT_BG  = '#f8fafc'   # Crisp Off-White for panels

def clean_spines(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

# ===========================================================================
# 1. FIG_HABE_ARCHITECTURE: Clean Academic Hierarchical Tree Architecture
# ===========================================================================
def generate_habe_architecture():
    print("[1/6] Generating clean fig_habe_architecture.png...")
    fig, ax = plt.subplots(figsize=(7.2, 3.8), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    fig.patch.set_facecolor('#ffffff')
    ax.set_facecolor('#ffffff')

    def draw_node(cx, cy, w, h, text, font_size=11):
        x = cx - w / 2
        y = cy - h / 2
        box = FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=0.2,rounding_size=1.2",
            facecolor="#ffffff",
            edgecolor="#1f2937",
            linewidth=1.2,
            zorder=3
        )
        ax.add_patch(box)
        ax.text(cx, cy, text, ha='center', va='center', fontsize=font_size, color='#111827', zorder=4)

    def draw_arrow(x1, y1, x2, y2):
        ax.annotate(
            '', xy=(x2, y2), xytext=(x1, y1),
            arrowprops=dict(
                arrowstyle="-|>",
                color="#1f2937",
                lw=1.1,
                mutation_scale=10
            ),
            zorder=2
        )

    # Level 0 (Company)
    c_y = 86
    draw_node(50, c_y, 22, 11, "Company (RM)", font_size=11)

    # Level 1 (Plants)
    p_y = 60
    draw_node(27, p_y, 20, 11, "Plant A (DM)", font_size=10.5)
    draw_node(73, p_y, 20, 11, "Plant B (DM)", font_size=10.5)

    # Level 2 (Areas)
    a_y = 34
    draw_node(13.5, a_y, 18, 11, "Area A1 (SDM)", font_size=9.5)
    draw_node(37.5, a_y, 18, 11, "Area A2 (SDM)", font_size=9.5)
    draw_node(62.5, a_y, 18, 11, "Area B1 (SDM)", font_size=9.5)
    draw_node(86.5, a_y, 18, 11, "Area B2 (SDM)", font_size=9.5)

    # Level 3 (Users)
    u_y = 10
    draw_node(13.5, u_y, 17, 9, "Users", font_size=10)
    draw_node(37.5, u_y, 17, 9, "Users", font_size=10)
    draw_node(62.5, u_y, 17, 9, "Users", font_size=10)
    draw_node(86.5, u_y, 17, 9, "Users", font_size=10)

    # Arrows from Company to Plants
    draw_arrow(46, c_y - 5.5, 30, p_y + 5.5)
    draw_arrow(54, c_y - 5.5, 70, p_y + 5.5)

    # Arrows from Plant A to Areas A1, A2
    draw_arrow(23, p_y - 5.5, 16, a_y + 5.5)
    draw_arrow(31, p_y - 5.5, 35, a_y + 5.5)

    # Arrows from Plant B to Areas B1, B2
    draw_arrow(69, p_y - 5.5, 65, a_y + 5.5)
    draw_arrow(77, p_y - 5.5, 84, a_y + 5.5)

    # Straight down arrows from Areas to Users
    draw_arrow(13.5, a_y - 5.5, 13.5, u_y + 4.5)
    draw_arrow(37.5, a_y - 5.5, 37.5, u_y + 4.5)
    draw_arrow(62.5, a_y - 5.5, 62.5, u_y + 4.5)
    draw_arrow(86.5, a_y - 5.5, 86.5, u_y + 4.5)

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig_habe_architecture.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean tree fig_habe_architecture.png")

# ===========================================================================
# 2. FIG_CRYPTO_BENCHMARKS & FIG4: Clean Pairing Latencies & O(1) Decryption
# ===========================================================================
def generate_crypto_benchmarks():
    print("[2/6] Generating clean fig_crypto_benchmarks.png & fig4...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.5, 3.4), dpi=300)

    # Subplot (a): Authority Operations Across Depths
    depths = ['Depth 1\n(Plant)', 'Depth 2\n(Area)', 'Depth 3\n(Workcell)']
    create_dm   = [736, 1472, 2208]
    create_user = [4200, 4196, 4208]
    encrypt     = [4205, 4210, 4218]

    x = np.arange(len(depths))
    width = 0.26

    rects1 = ax1.bar(x - width, create_dm, width, label='CreateDM', color=C_SECONDARY, edgecolor='#0f172a', linewidth=0.7)
    rects2 = ax1.bar(x, create_user, width, label='CreateUser', color=C_PRIMARY, edgecolor='#0f172a', linewidth=0.7)
    rects3 = ax1.bar(x + width, encrypt, width, label='Encrypt', color=C_MUTED, edgecolor='#0f172a', linewidth=0.7)

    ax1.set_ylabel('Execution Latency (ms)', fontsize=9.5, fontweight='bold')
    ax1.set_title('(a) Cryptographic Latency by Hierarchy Depth', fontsize=10, fontweight='bold', pad=8)
    ax1.set_xticks(x)
    ax1.set_xticklabels(depths, fontsize=8.5)
    ax1.set_ylim(0, 5200)
    ax1.grid(axis='y', zorder=0)
    ax1.legend(loc='lower right', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)
    clean_spines(ax1)

    # Clean text values directly above bars
    for bar in rects2:
        h = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2., h + 70, f'{int(h)}', ha='center', va='bottom', fontsize=7.5)

    # Subplot (b): Constant-Time Decryption Invariant
    clauses = ['1-Attribute\n(DM)', '2-Attribute DNF\n(SDM)', '3-Clause DNF\n(Emergency)']
    decrypt_lat = [4209, 4210, 4212]

    bars = ax2.bar(clauses, decrypt_lat, width=0.45, color=C_PRIMARY, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax2.set_ylabel('Decryption Latency (ms)', fontsize=9.5, fontweight='bold')
    ax2.set_title('(b) Constant-Time Decryption Invariant O(1)', fontsize=10, fontweight='bold', pad=8)
    ax2.set_ylim(3600, 4600)
    ax2.grid(axis='y', zorder=0)
    clean_spines(ax2)

    # Reference line for O(1) property
    ax2.axhline(4210, color=C_ALERT, linestyle='--', linewidth=1.2, label='O(1) Baseline (4,210 ms)', zorder=4)
    ax2.legend(loc='lower right', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)

    for bar in bars:
        h = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., h + 25, f'{h} ms', ha='center', va='bottom', fontsize=8.5, fontweight='bold')

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig_crypto_benchmarks.png'), dpi=300, bbox_inches='tight')
        plt.savefig(os.path.join(d, 'fig4_habe_pairing_latency_depths.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean fig_crypto_benchmarks.png and fig4_habe_pairing_latency_depths.png")

# ===========================================================================
# 3. FIG1: Clean Edge ML Benchmark Comparison (CASE Table III)
# ===========================================================================
def generate_edge_ml_benchmark():
    print("[3/6] Generating clean fig1_edge_ml_benchmark.png...")
    fig, axes = plt.subplots(1, 3, figsize=(10, 3.2), dpi=300)

    models = ['Naive Bayes', 'SVM (RBF)', 'Decision Tree\n(Ours)']
    accuracies = [64.4, 99.3, 99.7]
    latencies = [31.0, 603.0, 2.16]
    cycles = [62.4, 1200.0, 4.31]

    colors = [C_MUTED, C_SECONDARY, C_PRIMARY]

    # (a) Accuracy
    ax = axes[0]
    bars = ax.bar(models, accuracies, color=colors, width=0.5, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax.set_ylim(50, 105)
    ax.set_ylabel('Accuracy (%)', fontsize=9, fontweight='bold')
    ax.set_title('(a) Classification Accuracy', fontsize=9.5, fontweight='bold', pad=8)
    ax.grid(axis='y', zorder=0)
    clean_spines(ax)
    for b in bars:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width()/2., h + 1.2, f'{h:.1f}%', ha='center', va='bottom', fontsize=8, fontweight='bold')

    # (b) Latency (Log Scale)
    ax = axes[1]
    bars = ax.bar(models, latencies, color=colors, width=0.5, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax.set_yscale('log')
    ax.set_ylim(0.8, 1500)
    ax.set_ylabel('Inference Time (s, log scale)', fontsize=9, fontweight='bold')
    ax.set_title('(b) Prediction Latency', fontsize=9.5, fontweight='bold', pad=8)
    ax.grid(axis='y', zorder=0)
    clean_spines(ax)
    for b in bars:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width()/2., h * 1.2, f'{h:.2f} s', ha='center', va='bottom', fontsize=8)

    # (c) Clock Cycles
    ax = axes[2]
    bars = ax.bar(models, cycles, color=colors, width=0.5, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax.set_yscale('log')
    ax.set_ylim(1, 2500)
    ax.set_ylabel('Clock Cycles (× 10³, log scale)', fontsize=9, fontweight='bold')
    ax.set_title('(c) Computational Complexity', fontsize=9.5, fontweight='bold', pad=8)
    ax.grid(axis='y', zorder=0)
    clean_spines(ax)
    for b in bars:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width()/2., h * 1.25, f'{h:.1f}k', ha='center', va='bottom', fontsize=8)

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig1_edge_ml_benchmark.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean fig1_edge_ml_benchmark.png")

# ===========================================================================
# 4. FIG2: Clean Before vs After Pipeline Comparison
# ===========================================================================
def generate_before_vs_after():
    print("[4/6] Generating clean fig2_before_vs_after_pipeline.png...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.5, 3.4), dpi=300)

    # (a) Total Lifecycle Time (Edge scale in seconds)
    categories = ['Paper 1 HABE\n(Manual Selection)', 'CASE-HABE\n(Autonomous Ours)']
    policy_prep = [25.0, 2.16]
    crypto_enc  = [4.20, 2.85]
    blockchain  = [3.90, 3.90]

    width = 0.42
    b1 = ax1.bar(categories, policy_prep, width, label='Policy Formulation', color=C_MUTED, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    b2 = ax1.bar(categories, crypto_enc, width, bottom=policy_prep, label='Pairing Encryption', color=C_PRIMARY, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    b3 = ax1.bar(categories, blockchain, width, bottom=[policy_prep[i] + crypto_enc[i] for i in range(2)],
                 label='Besu Block Sealing', color=C_SECONDARY, edgecolor='#0f172a', linewidth=0.7, zorder=3)

    ax1.set_ylabel('Lifecycle Latency (seconds)', fontsize=9.5, fontweight='bold')
    ax1.set_title('(a) End-to-End Ingestion Latency', fontsize=10, fontweight='bold', pad=8)
    ax1.set_ylim(0, 38)
    ax1.grid(axis='y', zorder=0)
    clean_spines(ax1)
    ax1.legend(loc='upper right', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)

    ax1.text(0, 33.1 + 0.8, '33.10 s', ha='center', fontsize=9, fontweight='bold')
    ax1.text(1, 8.91 + 0.8, '8.91 s (-73.1%)', ha='center', fontsize=9, fontweight='bold', color=C_PRIMARY)

    # (b) Gateway Machine Encryption Speedup (ms)
    endpoints = ['Standard Payload\n(Paper 1)', 'Payload Splitting\n(CASE Algorithm 1)']
    enc_ms = [4212, 2853]

    bars2 = ax2.bar(endpoints, enc_ms, width=0.42, color=[C_MUTED, C_PRIMARY], edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax2.set_ylabel('HABE Encryption Latency (ms)', fontsize=9.5, fontweight='bold')
    ax2.set_title('(b) Payload Splitting Cryptographic Speedup', fontsize=10, fontweight='bold', pad=8)
    ax2.set_ylim(0, 5000)
    ax2.grid(axis='y', zorder=0)
    clean_spines(ax2)

    ax2.text(0, 4212 + 100, '4,212 ms', ha='center', fontsize=9, fontweight='bold')
    ax2.text(1, 2853 + 100, '2,853 ms (-32.3%)', ha='center', fontsize=9, fontweight='bold', color=C_PRIMARY)

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig2_before_vs_after_pipeline.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean fig2_before_vs_after_pipeline.png")

# ===========================================================================
# 5. FIG3: Clean System Improvements via Payload Splitting
# ===========================================================================
def generate_system_improvements():
    print("[5/6] Generating clean fig3_system_improvements_payload_splitting.png...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.5, 3.4), dpi=300)

    # (a) Resource Preservation
    metrics = ['Network\nDelay', 'Energy\nDrain', 'Packet\nLoss', 'Ciphertext\nSize']
    baseline = [100, 100, 100, 100]
    reduced  = [67.4, 65.8, 66.2, 68.6]

    x = np.arange(len(metrics))
    w = 0.35

    ax1.bar(x - w/2, baseline, w, label='Full Telemetry (Baseline)', color=C_MUTED, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax1.bar(x + w/2, reduced, w, label='Payload-Split (Ours)', color=C_PRIMARY, edgecolor='#0f172a', linewidth=0.7, zorder=3)

    ax1.set_ylabel('Normalized Overhead (%)', fontsize=9.5, fontweight='bold')
    ax1.set_title('(a) Edge Resource Preservation', fontsize=10, fontweight='bold', pad=8)
    ax1.set_xticks(x)
    ax1.set_xticklabels(metrics, fontsize=8.5)
    ax1.set_ylim(0, 125)
    ax1.grid(axis='y', zorder=0)
    clean_spines(ax1)
    ax1.legend(loc='upper right', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)

    deltas = [32.6, 34.2, 33.8, 31.4]
    for i in range(len(metrics)):
        ax1.text(x[i] + w/2, reduced[i] + 2, f'-{deltas[i]:.1f}%', ha='center', fontsize=8, fontweight='bold', color=C_PRIMARY)

    # (b) Transmission Latency Scaling
    packet_sizes = [64, 128, 256, 512, 1024]
    lat_full  = [42.0, 58.4, 89.2, 154.0, 285.6]
    lat_split = [28.2, 39.1, 59.8, 103.5, 191.8]

    ax2.plot(packet_sizes, lat_full, marker='o', markersize=5, linewidth=1.5, color=C_SECONDARY, label='Full Telemetry (∇)', zorder=4)
    ax2.plot(packet_sizes, lat_split, marker='s', markersize=5, linewidth=1.5, color=C_PRIMARY, label='Split Payload (∇\'\')', zorder=4)

    ax2.set_xlabel('Raw IoT Sensor Packet Size (Bytes)', fontsize=9, fontweight='bold')
    ax2.set_ylabel('Transmission Latency (ms)', fontsize=9.5, fontweight='bold')
    ax2.set_title('(b) Transmission Latency Scaling', fontsize=10, fontweight='bold', pad=8)
    ax2.grid(True, zorder=0)
    clean_spines(ax2)
    ax2.legend(loc='upper left', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig3_system_improvements_payload_splitting.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean fig3_system_improvements_payload_splitting.png")

# ===========================================================================
# 6. FIG5: Clean 4-Panel Master Poster Summary
# ===========================================================================
def generate_master_poster_summary():
    print("[6/6] Generating clean fig5_poster_master_infographic.png...")
    fig, axes = plt.subplots(2, 2, figsize=(10, 6.8), dpi=300)

    # Panel (A): Edge AI Pareto Frontier
    ax = axes[0, 0]
    models = ['Naive Bayes', 'SVM (RBF)', 'Decision Tree (Ours)']
    lats = [31.0, 603.0, 2.16]
    accs = [64.4, 99.3, 99.7]
    clrs = [C_MUTED, C_SECONDARY, C_PRIMARY]

    for i in range(3):
        ax.scatter(lats[i], accs[i], color=clrs[i], s=120, edgecolors='#0f172a', linewidth=1.0, zorder=5)
        offset_y = -3.5 if i == 0 else 1.2
        ax.text(lats[i] * 1.15, accs[i] + offset_y, models[i], fontsize=8.5, fontweight='bold', color=clrs[i])

    ax.set_xscale('log')
    ax.set_xlim(1, 1500)
    ax.set_ylim(55, 105)
    ax.set_xlabel('Edge Latency (seconds, log scale)', fontsize=8.5, fontweight='bold')
    ax.set_ylabel('Accuracy (%)', fontsize=8.5, fontweight='bold')
    ax.set_title('(A) Edge AI Classifier: Accuracy vs Latency', fontsize=9.5, fontweight='bold', pad=8)
    ax.grid(True, zorder=0)
    clean_spines(ax)

    # Panel (B): Policy Generation Speedup
    ax = axes[0, 1]
    cats = ['Paper 1 (Manual)', 'Ours (Edge DT)']
    vals = [25.0, 2.16]
    bars = ax.bar(cats, vals, color=[C_MUTED, C_PRIMARY], width=0.45, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax.set_ylabel('Policy Generation Time (s)', fontsize=8.5, fontweight='bold')
    ax.set_title('(B) Autonomous Policy Synthesis Latency', fontsize=9.5, fontweight='bold', pad=8)
    ax.set_ylim(0, 30)
    ax.grid(axis='y', zorder=0)
    clean_spines(ax)
    for b in bars:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width()/2., h + 0.8, f'{h:.2f} s', ha='center', fontsize=8.5, fontweight='bold')

    # Panel (C): System Overhead Reductions
    ax = axes[1, 0]
    metrics = ['Delay', 'Energy', 'Packet Loss', 'CT Size']
    savings = [32.6, 34.2, 33.8, 31.4]
    b_c = ax.barh(metrics, savings, color=C_PRIMARY, edgecolor='#0f172a', linewidth=0.7, height=0.5, zorder=3)
    ax.set_xlim(0, 45)
    ax.set_xlabel('Overhead Reduction (%)', fontsize=8.5, fontweight='bold')
    ax.set_title('(C) Resource Overhead Reductions', fontsize=9.5, fontweight='bold', pad=8)
    ax.grid(axis='x', zorder=0)
    clean_spines(ax)
    for b in b_c:
        w = b.get_width()
        ax.text(w + 1, b.get_y() + b.get_height()/2., f'-{w:.1f}%', va='center', fontsize=8.5, fontweight='bold')

    # Panel (D): Decryption Invariant
    ax = axes[1, 1]
    clauses = ['1-Clause\n(Area)', '2-Clause\n(Plant+Area)', '3-Clause\n(Emergency)']
    dec_ms = [4209, 4210, 4212]
    bars_e = ax.bar(clauses, dec_ms, color=C_PRIMARY, width=0.45, edgecolor='#0f172a', linewidth=0.7, zorder=3)
    ax.set_ylabel('Decryption Latency (ms)', fontsize=8.5, fontweight='bold')
    ax.set_title('(D) Verified Constant-Time Decryption O(1)', fontsize=9.5, fontweight='bold', pad=8)
    ax.set_ylim(3600, 4600)
    ax.grid(axis='y', zorder=0)
    clean_spines(ax)
    ax.axhline(4210, color=C_ALERT, linestyle='--', linewidth=1.2, label='O(1) Baseline (4,210 ms)')
    ax.legend(loc='lower right', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)
    for b in bars_e:
        h = b.get_height()
        ax.text(b.get_x() + b.get_width()/2., h + 25, f'{h} ms', ha='center', fontsize=8.5, fontweight='bold')

    plt.tight_layout()
    for d in DIRS:
        plt.savefig(os.path.join(d, 'fig5_poster_master_infographic.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("  -> Saved clean fig5_poster_master_infographic.png")

if __name__ == '__main__':
    print("Starting clean academic figure generation...")
    generate_habe_architecture()
    generate_crypto_benchmarks()
    generate_edge_ml_benchmark()
    generate_before_vs_after()
    generate_system_improvements()
    generate_master_poster_summary()
    print("\nAll figures regenerated successfully with clean, publication-grade academic formatting!")

