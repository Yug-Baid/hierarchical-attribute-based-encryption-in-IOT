import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Activity, 
  Cpu, 
  Network, 
  KeyRound, 
  ShieldAlert, 
  Blocks,
  Binary,
  BarChart3
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'System Overview Hub', dotColor: 'bg-blue-500', icon: Activity },
  { path: '/telemetry', label: 'CASE Policy Engine', dotColor: 'bg-indigo-500', icon: Cpu },
  { path: '/hierarchy', label: 'HABE Domain Tree', dotColor: 'bg-purple-500', icon: Network },
  { path: '/access-portal', label: '3-Gate Decryption', dotColor: 'bg-emerald-500', icon: KeyRound },
  { path: '/security-lab', label: 'Tamper Security Lab', dotColor: 'bg-rose-500', icon: ShieldAlert },
  { path: '/audit-trail', label: 'Blockchain Audit Trail', dotColor: 'bg-amber-500', icon: Blocks },
  { path: '/benchmarks', label: 'Poster Benchmarks', dotColor: 'bg-teal-500', icon: BarChart3 },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-64 flex-col border-r border-neutral-300/80 bg-[#f4f1eb] p-4 lg:flex sticky top-0 h-screen z-40 shrink-0 select-none">
      {/* Brand Header */}
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="h-8 w-8 rounded-xl bg-neutral-950 flex items-center justify-center font-mono text-sm font-bold text-white shadow-sm">
          <Binary className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-sm text-neutral-950 tracking-tight">HABE & CASE</span>
          <span className="block text-[10px] text-neutral-500 font-mono">IEEE IoTJ / Society 5.0</span>
        </div>
      </div>

      {/* Navigation Menu Items */}
      <nav className="space-y-1.5 text-xs sm:text-sm font-medium flex-1 overflow-y-auto pr-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-tab ${isActive ? 'active' : ''}`
              }
            >
              <span className={`nav-tab-dot ${item.dotColor}`}></span>
              <span className="flex-1 truncate">{item.label}</span>
              <Icon className="w-3.5 h-3.5 opacity-60 ml-auto" />
            </NavLink>
          );
        })}
      </nav>

      {/* Consortium Authorship Chip */}
      <div className="mt-auto border-t border-neutral-300/80 pt-4 flex items-center gap-3 px-2">
        <div className="h-9 w-9 rounded-full bg-white border border-neutral-300 flex items-center justify-center font-bold text-xs text-neutral-900 shadow-sm shrink-0">
          IIoT
        </div>
        <div className="overflow-hidden">
          <span className="block text-xs font-semibold text-neutral-900 truncate">Industrial Consortium</span>
          <span className="block text-[10px] text-neutral-500 font-mono truncate">Type-A HABE + Besu Core</span>
        </div>
      </div>
    </aside>
  );
}

