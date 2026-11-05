import React, { useState, useEffect } from 'react';
import { API_SERVICE } from '../api/client';
import { 
  Network, 
  Key, 
  Plus, 
  ShieldCheck, 
  Check, 
  Copy,
  ChevronRight,
  Layers,
  Fingerprint,
  Building,
  Cpu,
  Flame,
  ShieldAlert,
  Zap,
  RotateCcw
} from 'lucide-react';

export default function HierarchyManager({ onTriggerToast }) {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  // New Node Form
  const [nodeAddr, setNodeAddr] = useState('company/plantC/areaC3');
  const [nodeRole, setNodeRole] = useState('SDM');
  const [parentAddr, setParentAddr] = useState('company/plantC');

  // Key Issuance Form
  const [keyDmAddr, setKeyDmAddr] = useState('company/plantA/areaA1');
  const [keyUserAddr, setKeyUserAddr] = useState('operator_alice');
  const [keyAttrPk, setKeyAttrPk] = useState('company/plantA/areaA1:sensor_data');
  const [issueLoading, setIssueLoading] = useState(false);
  const [issuedKeys, setIssuedKeys] = useState([]);

  const fetchHierarchyData = async () => {
    setLoading(true);
    try {
      const res = await API_SERVICE.getNodes();
      if (res.data?.ok) {
        setNodes(res.data.nodes || []);
      }
      const resKeys = await API_SERVICE.getIssuedKeys();
      if (resKeys.data?.ok && resKeys.data.keys?.length > 0) {
        setIssuedKeys(resKeys.data.keys);
      }
    } catch (err) {
      // In-memory or initial demo state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHierarchyData();
  }, []);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await API_SERVICE.setupHierarchy();
      if (res.data?.ok) {
        onTriggerToast(`Bootstrapped enterprise hierarchy with ${res.data.provisionedUsers || 14} active personas!`);
        await fetchHierarchyData();
      }
    } catch (err) {
      onTriggerToast(`Bootstrap error: ${err.response?.data?.error || err.message}`);
    } finally {
      setBootstrapping(false);
    }
  };

  // Handle Node Registration
  const handleRegisterNode = async (e) => {
    e.preventDefault();
    try {
      const res = await API_SERVICE.registerNode({
        addr: nodeAddr,
        role: nodeRole,
        parentAddr: parentAddr || null,
      });
      if (res.data?.ok) {
        onTriggerToast(`Node ${nodeAddr} registered on-chain!`);
        fetchHierarchyData();
      }
    } catch (err) {
      onTriggerToast(`Registration failed: ${err.response?.data?.error || err.message}`);
    }
  };

  // Handle Key Issuance
  const handleIssueKey = async (e) => {
    e.preventDefault();
    setIssueLoading(true);
    try {
      const res = await API_SERVICE.issueUserKey({
        dmAddr: keyDmAddr,
        userAddr: keyUserAddr,
        attrPk: keyAttrPk,
      });
      if (res.data?.ok) {
        onTriggerToast(`Issued User Secret Key for ${keyUserAddr}!`);
        await fetchHierarchyData();
      }
    } catch (err) {
      onTriggerToast(`Key issuance failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIssueLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    onTriggerToast('Copied USK Identifier to clipboard!');
  };

  const topology = [
    {
      id: 'plantA',
      name: 'company/plantA',
      label: 'Plant A — Advanced Manufacturing Complex',
      icon: Cpu,
      color: 'purple',
      areas: [
        { addr: 'company/plantA/areaA1', label: 'Area A1: Robotics & High-Speed Assembly' },
        { addr: 'company/plantA/areaA2', label: 'Area A2: Precision Inspection & Packaging' },
      ]
    },
    {
      id: 'plantB',
      name: 'company/plantB',
      label: 'Plant B — Metallurgy & Heavy Thermal',
      icon: Flame,
      color: 'amber',
      areas: [
        { addr: 'company/plantB/areaB1', label: 'Area B1: Smelting & Electric Arc Furnaces' },
        { addr: 'company/plantB/areaB2', label: 'Area B2: Continuous Casting & Rolling Mills' },
      ]
    },
    {
      id: 'plantC',
      name: 'company/plantC',
      label: 'Plant C — Green Hydrogen & Clean Energy',
      icon: Zap,
      color: 'emerald',
      areas: [
        { addr: 'company/plantC/areaC1', label: 'Area C1: Water Electrolysis Cell Array' },
        { addr: 'company/plantC/areaC2', label: 'Area C2: Cryogenic Liquefaction & Storage' },
      ]
    },
    {
      id: 'hq',
      name: 'company/hq',
      label: 'Corporate HQ — Cyber Defense & Governance',
      icon: ShieldAlert,
      color: 'blue',
      areas: [
        { addr: 'company/hq/security', label: 'SOC: Security Operations & Incident Response' },
        { addr: 'company/hq/compliance', label: 'Audit: Regulatory & Compliance Division' },
      ]
    }
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full font-mono">
                HABE Tree Topology
              </span>
              <span className="text-xs text-neutral-500 font-mono">PBC Master Public Keys & On-Chain Anchors</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              Hierarchical Authority & Attribute Secret Key Provisioning
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Domain Masters (DM) and Sub-Domain Masters (SDM) issue attribute secret keys to operators. All authority branches share the invariant Root Public Key $P_1 = H_1(\text{"company"})$ and Type-A curve pairing invariants, enabling cross-domain multi-clause DNF policy evaluation.
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={bootstrapping}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-950 hover:bg-neutral-800 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${bootstrapping ? 'animate-spin' : ''}`} />
            <span>{bootstrapping ? 'Bootstrapping...' : 'Re-Bootstrap Full Enterprise'}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Card: Tree Hierarchy View */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Enterprise Cryptographic Hierarchy</h3>
              <p className="text-[11px] text-neutral-500 font-mono">Root Master → DM Plants → SDM Operational Cells</p>
            </div>
            <span className="text-[10px] font-mono text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
              Depth $\le 8$
            </span>
          </div>

          {/* Interactive Tree Hierarchy Representation */}
          <div className="space-y-4 font-mono text-xs max-h-[500px] overflow-y-auto pr-1">
            {/* Level 1: Root */}
            <div className="p-3.5 rounded-xl bg-neutral-950 text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="font-bold">company</span>
              </div>
              <span className="text-[10px] bg-purple-900/60 border border-purple-500/40 text-purple-200 px-2 py-0.5 rounded-full font-semibold">
                Root Master (RM)
              </span>
            </div>

            {/* Plants Topology */}
            {topology.map((p) => {
              const IconComp = p.icon;
              return (
                <div key={p.id} className="ml-5 space-y-2">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between text-neutral-900">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                      <IconComp className="w-4 h-4 text-neutral-700" />
                      <div>
                        <span className="font-semibold block">{p.name}</span>
                        <span className="text-[10px] text-neutral-500 font-sans block">{p.label}</span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-white border border-neutral-300 text-neutral-800 px-2 py-0.5 rounded-full font-bold">
                      Domain Master (DM)
                    </span>
                  </div>

                  {/* Areas / SDMs */}
                  <div className="ml-6 space-y-1.5">
                    {p.areas.map((area, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-white border border-neutral-200 flex items-center justify-between text-neutral-800">
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400">└─</span>
                          <div>
                            <span className="font-mono text-xs">{area.addr}</span>
                            <span className="text-[10px] text-neutral-500 font-sans block">{area.label}</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-semibold">
                          SDM
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form to Register Node */}
          <form onSubmit={handleRegisterNode} className="pt-4 border-t border-neutral-100 space-y-3">
            <h4 className="font-bold text-xs text-neutral-800">Register Subordinate Authority Node:</h4>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Node Address"
                value={nodeAddr}
                onChange={(e) => setNodeAddr(e.target.value)}
                className="col-span-2 text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              />
              <select
                value={nodeRole}
                onChange={(e) => setNodeRole(e.target.value)}
                className="text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              >
                <option value="SDM">SDM</option>
                <option value="DM">DM</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-neutral-500 font-mono">Appends to HABERegistry Smart Contract</span>
              <button
                type="submit"
                className="rounded-full bg-neutral-950 hover:bg-neutral-800 px-4 py-1.5 text-xs font-semibold text-white transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Node</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Card: Issue Attribute Secret Keys */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Active Attribute Secret Keys</h3>
              <p className="text-[11px] text-neutral-500 font-mono">Cryptographic USK Identifiers Issued by DMs/SDMs</p>
            </div>
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
              {issuedKeys.length} Active Keys
            </span>
          </div>

          {/* List of Issued Keys */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {issuedKeys.map((k, idx) => (
              <div key={idx} className="p-3 rounded-xl border border-neutral-200/90 bg-neutral-50/50 space-y-2 hover:bg-neutral-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-neutral-600" />
                    <span className="text-xs font-bold text-neutral-900 font-mono">{k.user}</span>
                  </div>
                  <span className="text-[10px] font-mono bg-white border border-neutral-200 px-2 py-0.5 rounded-full text-neutral-600">
                    {k.dm}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-purple-700 truncate max-w-[280px]">
                    {k.attr}
                  </span>
                  <button
                    onClick={() => copyToClipboard(k.uskId)}
                    className="flex items-center gap-1 text-[11px] font-mono bg-white hover:bg-neutral-900 hover:text-white border border-neutral-200 px-2 py-1 rounded-md transition text-neutral-700 shrink-0"
                    title="Copy full USK identifier"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy USK</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Issue New Key Form */}
          <form onSubmit={handleIssueKey} className="pt-4 border-t border-neutral-100 space-y-3">
            <h4 className="font-bold text-xs text-neutral-800">Issue Custom User Secret Key:</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Issuing DM/SDM"
                value={keyDmAddr}
                onChange={(e) => setKeyDmAddr(e.target.value)}
                className="text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              />
              <input
                type="text"
                placeholder="User Identity"
                value={keyUserAddr}
                onChange={(e) => setKeyUserAddr(e.target.value)}
                className="text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              />
            </div>
            <input
              type="text"
              placeholder="Attribute Public Key (e.g. company/plantA:manager)"
              value={keyAttrPk}
              onChange={(e) => setKeyAttrPk(e.target.value)}
              className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-neutral-500 font-mono">Synchronized with ML Bulletin Store</span>
              <button
                type="submit"
                disabled={issueLoading}
                className="rounded-full bg-neutral-950 hover:bg-neutral-800 px-4 py-1.5 text-xs font-semibold text-white transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{issueLoading ? 'Issuing...' : 'Issue USK'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
