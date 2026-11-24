import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, Lock } from 'lucide-react';

/**
 * KeystrokeTextPanel
 * EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Replaced with transparent privacy boundary disclosure.
 */
export function KeystrokeTextPanel() {
  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardContent className="p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-100 flex items-center justify-center gap-1.5">
            <Lock className="w-4 h-4 text-emerald-400" />
            Keystroke Logging Eradicated
          </h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Niyantran Employee Monitoring V2 enforces strict privacy boundaries. Raw keystrokes, typed text reconstruction, and key mashing inspections are permanently eliminated across client and server.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default KeystrokeTextPanel;
