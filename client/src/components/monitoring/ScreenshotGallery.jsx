import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, EyeOff } from 'lucide-react';

/**
 * ScreenshotGallery
 * EXCISED under Niyantran Employee Monitoring V2 Privacy Boundaries.
 * Desktop screenshot capture has been permanently removed across client, agent, and backend.
 */
export function ScreenshotGallery() {
  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardContent className="p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-slate-100 flex items-center justify-center gap-1.5">
            <EyeOff className="w-4 h-4 text-emerald-400" />
            Desktop Screenshot Surveillance Eradicated
          </h4>
          <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
            Desktop screen recordings, periodic snapshots, and OCR text extraction are permanently eradicated under Niyantran Employee Monitoring V2. Only disclosed work telemetry (application executable, category, usage duration) is monitored.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScreenshotGallery;
