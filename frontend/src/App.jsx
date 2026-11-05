import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import KpiRibbon from './components/common/KpiRibbon';
import PresentationModal from './components/common/PresentationModal';

// Dedicated Pages
import DashboardHub from './pages/DashboardHub';
import SensorSimulator from './pages/SensorSimulator';
import HierarchyManager from './pages/HierarchyManager';
import DecryptionPortal from './pages/DecryptionPortal';
import SecurityLab from './pages/SecurityLab';
import AuditTrail from './pages/AuditTrail';
import BenchmarkShowcase from './pages/BenchmarkShowcase';

export default function App() {
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3500);
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    showToast('State re-synchronized with local engines.');
  };

  return (
    <div className="flex min-h-screen bg-[#fcfbf9] text-neutral-900 font-sans selection:bg-neutral-950 selection:text-white">
      {/* Fixed Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#fcfbf9]">
        {/* Top Header */}
        <Header 
          onOpenPresentation={() => setIsPresentationOpen(true)}
          onRefresh={handleRefresh}
        />

        {/* Content Body */}
        <div key={refreshKey} className="p-6 sm:p-8 max-w-7xl mx-auto w-full space-y-8">
          {/* Top 4-Card KPI Ribbon */}
          <KpiRibbon />

          {/* Page Routing */}
          <Routes>
            <Route path="/" element={<DashboardHub onTriggerToast={showToast} />} />
            <Route path="/telemetry" element={<SensorSimulator onTriggerToast={showToast} />} />
            <Route path="/hierarchy" element={<HierarchyManager onTriggerToast={showToast} />} />
            <Route path="/access-portal" element={<DecryptionPortal onTriggerToast={showToast} />} />
            <Route path="/security-lab" element={<SecurityLab onTriggerToast={showToast} />} />
            <Route path="/audit-trail" element={<AuditTrail onTriggerToast={showToast} />} />
            <Route path="/benchmarks" element={<BenchmarkShowcase onTriggerToast={showToast} />} />
          </Routes>
        </div>
      </main>

      {/* Research Presentation Modal Deck */}
      <PresentationModal 
        isOpen={isPresentationOpen} 
        onClose={() => setIsPresentationOpen(false)} 
      />

      {/* Toast Notifications */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

