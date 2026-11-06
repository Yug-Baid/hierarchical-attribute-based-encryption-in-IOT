"""
generate_tree_architecture.py
=============================
Generates the exact hierarchical tree architecture diagram requested by the user:
- Root: Company (RM)
- Level 1: Plant A (DM), Plant B (DM)
- Level 2: Area A1 (SDM), Area A2 (SDM), Area B1 (SDM), Area B2 (SDM)
- Level 3: Users, Users, Users, Users
"""

import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

DIRS = [
    os.path.abspath("e:/All Projects/HABE/report/images"),
    os.path.abspath("e:/All Projects/HABE/ml/benchmarks"),
    os.path.abspath("e:/All Projects/HABE/frontend/public/benchmarks")
]
for d in DIRS:
    os.makedirs(d, exist_ok=True)

fig, ax = plt.subplots(figsize=(7.2, 3.8), dpi=300)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis('off')

# Clean white background
fig.patch.set_facecolor('#ffffff')
ax.set_facecolor('#ffffff')

# Box drawing function
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

# Arrow drawing function
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

# Coordinates
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
print("Tree architecture figure generated successfully at 300 DPI!")
