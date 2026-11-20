/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Non-Invasive TRINETRA AI Representation (Phase B Demo State)
 *
 * Implements architectural mandate:
 * - Surfaces non-invasive behavioral insights and anomaly patterns.
 * - ZERO screen OCR, ZERO typed text scanning, ZERO intrusive surveillance.
 * - Operates strictly on statistical distributions of 60-second activity buckets.
 */

export const MOCK_TRINETRA_INSIGHTS = [
  {
    id: 'tri_001',
    category: 'FOCUS_FLOW',
    confidence: 0.94,
    headline: 'Optimal Deep Work Rhythm Detected',
    team: 'Engineering (Platform)',
    description: 'Engineering team has sustained uninterrupted 120-minute focus blocks with <3% idle context switching between 10:00 and 12:00.',
    recommendation: 'Protect morning hours from meeting schedules to maximize sustained coding flow.',
    privacyNote: 'Evaluated purely from 60s input frequency and application category aggregates.',
    trend: 'positive',
  },
  {
    id: 'tri_002',
    category: 'BURNOUT_RISK',
    confidence: 0.88,
    headline: 'Consecutive Late-Shift Spikes Flagged',
    team: 'Customer Operations',
    description: '3 team members have recorded active session heartbeats extending past 21:00 for 4 consecutive days.',
    recommendation: 'Verify workload distribution during daily sync and encourage scheduled time-off.',
    privacyNote: 'Evaluated from session start/end timestamps without inspecting work content.',
    trend: 'warning',
  },
  {
    id: 'tri_003',
    category: 'ANOMALY_DETECTION',
    confidence: 0.91,
    headline: 'Erratic Hardware Idle Inactivity Spike',
    team: 'Quality Assurance',
    description: 'A sudden 40-minute drop in input counts coincided with active legacy agent process conflict.',
    recommendation: 'Check workstation for V1/V2 coexistence conflict; facilitate manual agent exit.',
    privacyNote: 'Derived from ConflictDetector telemetry signals.',
    trend: 'neutral',
  },
];
