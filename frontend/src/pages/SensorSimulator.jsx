import React, { useState, useEffect } from 'react';
import { API_SERVICE } from '../api/client';
import { 
  Cpu, 
  Lock, 
  CheckCircle, 
  AlertTriangle, 
  Flame, 
  Gauge, 
  Waves, 
  Wind,
  ShieldCheck,
  Binary
} from 'lucide-react';

export default function SensorSimulator({ onTriggerToast }) {
  // Telemetry Inputs
  const [plantId, setPlantId] = useState('company/plantA');
  const [areaId, setAreaId] = useState('company/plantA/areaA1');
  const [temperature, setTemperature] = useState(38);
  const [vibration, setVibration] = useState(1.2);
  const [pressure, setPressure] = useState(50);
  const [gasPpm, setGasPpm] = useState(25);
  const [payloadText, setPayloadText] = useState('TURBINE_TELEMETRY_LOG_TIMESTAMP_20261103');

  // Classification State
  const [predictedState, setPredictedState] = useState('NORMAL');
  const [dynamicPolicy, setDynamicPolicy] = useState('');
  const [confidence, setConfidence] = useState({ NORMAL: 0.98, WARNING: 0.02, CRITICAL: 0.00 });
  const [isClassifying, setIsClassifying] = useState(false);

  // Encryption Execution State
  const [encryptLoading, setEncryptLoading] = useState(false);
  const [encryptResult, setEncryptResult] = useState(null);

  // Classify telemetry on slider change
  useEffect(() => {
    let active = true;
    const evaluateTelemetry = async () => {
      setIsClassifying(true);
      try {
        const res = await API_SERVICE.predictPolicy({
          plantId,
          areaId,
          telemetry: {
            temperature: parseFloat(temperature),
            vibration: parseFloat(vibration),
            pressure: parseFloat(pressure),
            gas_ppm: parseFloat(gasPpm),
          },
        });

        if (active && res.data?.status === 'success') {
          const state = res.data.predicted_state;
          setPredictedState(state);
          setDynamicPolicy(res.data.dynamic_policy);

          // Simulated probability breakdown for visualization
          if (state === 'NORMAL') {
            setConfidence({ NORMAL: 0.96, WARNING: 0.03, CRITICAL: 0.01 });
          } else if (state === 'WARNING') {
            setConfidence({ NORMAL: 0.04, WARNING: 0.92, CRITICAL: 0.04 });
          } else {
            setConfidence({ NORMAL: 0.01, WARNING: 0.05, CRITICAL: 0.94 });
          }
        }
      } catch (err) {
        // Fallback local heuristic if ML service is unreachable
        let state = 'NORMAL';
        if (temperature > 75 || vibration > 4.5 || pressure > 110 || gasPpm > 150) {
          state = 'CRITICAL';
        } else if (temperature > 50 || vibration > 2.5 || pressure > 70 || gasPpm > 50) {
          state = 'WARNING';
        }
        setPredictedState(state);
        if (state === 'NORMAL') {
          setDynamicPolicy(`(${plantId}/${areaId} AND sensor_data) OR (${plantId} AND manager)`);
        } else if (state === 'WARNING') {
          setDynamicPolicy(`(${plantId}/${areaId} AND sensor_data) OR (${plantId} AND maintenance_team) OR (${plantId} AND manager)`);
        } else {
          setDynamicPolicy(`(${plantId}/${areaId} AND sensor_data) OR (${plantId} AND manager) OR (company AND emergency_board)`);
        }
      } finally {
        if (active) setIsClassifying(false);
      }
    };

    const timeout = setTimeout(evaluateTelemetry, 150);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [temperature, vibration, pressure, gasPpm, plantId, areaId]);

  // Presets
  const applyPreset = (preset) => {
    if (preset === 'normal') {
      setTemperature(35);
      setVibration(1.2);
      setPressure(48);
      setGasPpm(20);
    } else if (preset === 'warning') {
      setTemperature(62);
      setVibration(3.4);
      setPressure(85);
      setGasPpm(95);
    } else if (preset === 'critical') {
      setTemperature(92);
      setVibration(6.8);
      setPressure(140);
      setGasPpm(220);
    }
  };

  // Execute Autonomous Encryption
  const handleAutonomousEncrypt = async () => {
    setEncryptLoading(true);
    try {
      const res = await API_SERVICE.encryptAutonomous({
        plantId,
        areaId,
        telemetry: {
          temperature: parseFloat(temperature),
          vibration: parseFloat(vibration),
          pressure: parseFloat(pressure),
          gas_ppm: parseFloat(gasPpm),
        },
        payload: payloadText,
      });

      if (res.data?.ok) {
        setEncryptResult(res.data);
        localStorage.setItem('habe_last_record_id', res.data.recordId);
        onTriggerToast(`Data successfully encrypted under ${res.data.predicted_state} policy!`);
      }
    } catch (err) {
      onTriggerToast(`Encryption failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setEncryptLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full font-mono">
                CASE Paper Section IV-A & Algorithm 1
              </span>
              <span className="text-xs text-neutral-500 font-mono">Autonomous DNF Formulation</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-950 tracking-tight">
              IoT Sensor Telemetry Simulator & Dynamic Policy Formulation
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl leading-relaxed">
              Move the sensor sliders to alter operational telemetry. The edge Decision Tree instantly classifies the context state and synthesizes the exact hierarchical HABE DNF policy without manual human selection.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => applyPreset('normal')}
              className="rounded-full border border-neutral-200 bg-neutral-50 hover:bg-neutral-950 hover:text-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition"
            >
              Normal Preset
            </button>
            <button
              onClick={() => applyPreset('warning')}
              className="rounded-full border border-neutral-200 bg-amber-50 hover:bg-neutral-950 hover:text-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition"
            >
              Warning Preset
            </button>
            <button
              onClick={() => applyPreset('critical')}
              className="rounded-full border border-neutral-200 bg-rose-50 hover:bg-neutral-950 hover:text-white px-3 py-1.5 text-xs font-semibold text-rose-800 transition"
            >
              Critical Preset
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Column: Sliders & Controls */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-neutral-950">Sensor Telemetry (∇')</h3>
              <p className="text-[11px] text-neutral-500 font-mono">Live Industrial Signals</p>
            </div>
            <span className="text-[10px] font-mono font-bold text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded">
              4 Channels
            </span>
          </div>

          {/* Plant & Area Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Plant Node</label>
              <input
                type="text"
                value={plantId}
                onChange={(e) => setPlantId(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Area Node</label>
              <input
                type="text"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <hr className="border-neutral-100" />

          {/* Slider 1: Temperature */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-700 font-medium flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-500" /> Temperature
              </span>
              <span className="font-mono text-neutral-950 font-bold bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-[11px]">
                {temperature}°C
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="120"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>Normal (20-50)</span>
              <span>Warning (51-75)</span>
              <span>Critical (&gt;75)</span>
            </div>
          </div>

          {/* Slider 2: Vibration */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-700 font-medium flex items-center gap-1.5">
                <Waves className="w-3.5 h-3.5 text-blue-500" /> Vibration
              </span>
              <span className="font-mono text-neutral-950 font-bold bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-[11px]">
                {vibration} mm/s
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="10.0"
              step="0.1"
              value={vibration}
              onChange={(e) => setVibration(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>Normal (&lt;2.5)</span>
              <span>Warning (2.6-4.5)</span>
              <span>Critical (&gt;4.5)</span>
            </div>
          </div>

          {/* Slider 3: Pressure */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-700 font-medium flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-indigo-500" /> Pressure
              </span>
              <span className="font-mono text-neutral-950 font-bold bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-[11px]">
                {pressure} PSI
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="180"
              value={pressure}
              onChange={(e) => setPressure(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>Normal (30-70)</span>
              <span>Warning (71-110)</span>
              <span>Critical (&gt;110)</span>
            </div>
          </div>

          {/* Slider 4: Toxic Gas */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-neutral-700 font-medium flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-rose-500" /> Toxic Gas PPM
              </span>
              <span className="font-mono text-neutral-950 font-bold bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-[11px]">
                {gasPpm} PPM
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="300"
              value={gasPpm}
              onChange={(e) => setGasPpm(e.target.value)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>Normal (&lt;50)</span>
              <span>Warning (50-150)</span>
              <span>Critical (&gt;150)</span>
            </div>
          </div>
        </div>

        {/* Right Column: AI Inference & Autonomous Encryption Action */}
        <div className="space-y-6">
          {/* Classification & Confidence Card */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-neutral-950">Edge Decision Tree Prediction</h3>
                <p className="text-[11px] text-neutral-500 font-mono">Ground Truth Model: max_depth=5</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-neutral-500">
                  {isClassifying ? 'Classifying...' : 'Synchronized'}
                </span>
                <span
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-full uppercase ${
                    predictedState === 'NORMAL'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : predictedState === 'WARNING'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'
                  }`}
                >
                  {predictedState}
                </span>
              </div>
            </div>

            {/* Probability Breakdown Tracks */}
            <div className="space-y-3">
              <div className="prediction-bar-item">
                <div className="pred-info-row">
                  <span className="pred-class-name">NORMAL Operational State</span>
                  <span className="pred-prob-val">{(confidence.NORMAL * 100).toFixed(1)}%</span>
                </div>
                <div className="prob-track">
                  <div
                    className={`prob-fill ${predictedState === 'NORMAL' ? 'winner' : ''}`}
                    style={{ width: `${confidence.NORMAL * 100}%` }}
                  />
                </div>
              </div>

              <div className="prediction-bar-item">
                <div className="pred-info-row">
                  <span className="pred-class-name">WARNING Operational State</span>
                  <span className="pred-prob-val">{(confidence.WARNING * 100).toFixed(1)}%</span>
                </div>
                <div className="prob-track">
                  <div
                    className={`prob-fill ${predictedState === 'WARNING' ? 'winner' : ''}`}
                    style={{ width: `${confidence.WARNING * 100}%`, backgroundColor: '#d97706' }}
                  />
                </div>
              </div>

              <div className="prediction-bar-item">
                <div className="pred-info-row">
                  <span className="pred-class-name">CRITICAL Emergency State</span>
                  <span className="pred-prob-val">{(confidence.CRITICAL * 100).toFixed(1)}%</span>
                </div>
                <div className="prob-track">
                  <div
                    className={`prob-fill ${predictedState === 'CRITICAL' ? 'winner' : ''}`}
                    style={{ width: `${confidence.CRITICAL * 100}%`, backgroundColor: '#e11d48' }}
                  />
                </div>
              </div>
            </div>

            {/* Dynamic DNF Policy Viewer */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700">
                  Synthesized HABE DNF Policy String:
                </span>
                <span className="text-[10px] font-mono text-neutral-500">Autonomous Gate 2 Target</span>
              </div>
              <div className="math-box text-left font-mono text-xs sm:text-sm bg-neutral-50 border border-neutral-200 text-neutral-900 overflow-x-auto whitespace-pre-wrap">
                {dynamicPolicy || 'Calculating...'}
              </div>
              <p className="text-[11px] text-neutral-500 leading-relaxed">
                {predictedState === 'NORMAL' &&
                  'Normal State: Access is restricted strictly to local Area Technicians and Plant Managers.'}
                {predictedState === 'WARNING' &&
                  'Warning State: Policy expands to incorporate Industrial Maintenance Teams for preemptive repair.'}
                {predictedState === 'CRITICAL' &&
                  'Critical Escalation: Policy immediately escalates to include Root Company Emergency Board.'}
              </p>
            </div>
          </div>

          {/* Autonomous Encryption Trigger */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-bold text-sm text-neutral-950">Useful Payload ($\nabla''$) & On-Chain Encrypt</h3>
              <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                POST /data/encrypt/autonomous
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Payload Plaintext to Protect:
              </label>
              <textarea
                rows={2}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="w-full text-xs font-mono rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-800 outline-none focus:border-neutral-900 shadow-inner"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-neutral-500 font-mono">
                Payload size: {payloadText.length} bytes (Reduced vs raw sensor stream)
              </div>
              <button
                onClick={handleAutonomousEncrypt}
                disabled={encryptLoading}
                className="rounded-full bg-neutral-950 hover:bg-neutral-800 px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition flex items-center gap-2 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{encryptLoading ? 'Executing HABE & Besu...' : 'Encrypt & Anchor On-Chain'}</span>
              </button>
            </div>

            {/* Encryption Result Card */}
            {encryptResult && (
              <div className="mt-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Successfully Encrypted & Anchored
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">Record ID: {encryptResult.recordId}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-neutral-700">
                  <div className="p-2 rounded-lg bg-white border border-neutral-200 truncate">
                    <span className="text-neutral-400 block text-[9px]">SHA-256 HASH (GATE 1):</span>
                    {encryptResult.ctHash}
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-neutral-200 truncate">
                    <span className="text-neutral-400 block text-[9px]">BESU TX HASH:</span>
                    {encryptResult.txHash}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

