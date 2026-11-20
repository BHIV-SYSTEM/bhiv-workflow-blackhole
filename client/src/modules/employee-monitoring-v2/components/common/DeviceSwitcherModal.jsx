/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Compact Device Switcher & Handoff Confirmation Dialog
 */

import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { Laptop, Smartphone, ArrowRightLeft, ShieldCheck, Check } from 'lucide-react';

export const DeviceSwitcherModal = ({
  isOpen,
  onClose,
  currentMode = 'LAPTOP_PC',
  onConfirmSwitch,
}) => {
  const [selectedTarget, setSelectedTarget] = useState(
    currentMode === 'LAPTOP_PC' ? 'PHONE' : 'LAPTOP_PC'
  );
  const [handoffSuccess, setHandoffSuccess] = useState(false);

  const handleConfirm = () => {
    onConfirmSwitch(selectedTarget);
    setHandoffSuccess(true);
    setTimeout(() => {
      setHandoffSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Switch Active Work Device"
      description="Transfer active monitoring session ownership between registered devices"
      footer={
        !handoffSuccess ? (
          <>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm} icon={ArrowRightLeft}>
              Confirm Device Handoff
            </Button>
          </>
        ) : null
      }
    >
      {handoffSuccess ? (
        <div className="py-6 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-slate-100">Device Handoff Completed</h4>
          <p className="text-xs text-slate-400">
            Active monitoring session transferred to {selectedTarget === 'PHONE' ? 'Phone (Mobile PWA)' : 'Laptop / PC Workstation'}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Architecture & Privacy Notice */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Single Active Device Governance</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              An employee can only have one active telemetry lease at any time.
              Switching devices gracefully revokes the prior device's authorization lease and establishes verified ownership on the target device.
              <span className="block mt-1 text-emerald-400">
                Attendance records and salary calculations are NEVER mutated by device switching.
              </span>
            </p>
          </div>

          {/* Current vs Target selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Select Target Device:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedTarget('LAPTOP_PC')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTarget === 'LAPTOP_PC'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Laptop className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200">Laptop / PC</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Full Win32 foreground application duration tracking & hardware idle detection.
                </p>
                {currentMode === 'LAPTOP_PC' && (
                  <Badge variant="neutral" className="mt-2 text-[10px]">
                    Current Device
                  </Badge>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedTarget('PHONE')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedTarget === 'PHONE'
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-200">Phone (PWA)</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Mobile work presence and task timer. (Desktop app tracking paused while on phone).
                </p>
                {currentMode === 'PHONE' && (
                  <Badge variant="neutral" className="mt-2 text-[10px]">
                    Current Device
                  </Badge>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DeviceSwitcherModal;
