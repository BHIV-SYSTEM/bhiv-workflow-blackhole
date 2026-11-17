/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Desktop Agent — Passive Conflict Detector
 *
 * Implements Mandatory Correction 1:
 * - V2 NEVER kills, pauses, terminates, or modifies V1.
 * - Non-invasively inspects running processes.
 * - If V1 is detected, V2 refuses to start its telemetry collector.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { V1_PROCESS_NAMES } from './config.js';

const execAsync = promisify(exec);

export class AgentConflictDetector {
  /**
   * Evaluates running process list string for V1 agent signatures.
   * Pure function for reliable unit testing.
   *
   * @param {string} processListOutput - Output from tasklist or ps
   * @returns {{ hasConflict: boolean, detectedProcess: string | null }}
   */
  static parseProcessOutput(processListOutput) {
    if (!processListOutput || typeof processListOutput !== 'string') {
      return { hasConflict: false, detectedProcess: null };
    }

    const lower = processListOutput.toLowerCase();

    // Check specific known V1 binary signatures
    if (
      lower.includes('niyantran employee agent') ||
      lower.includes('niyantran-agent') ||
      lower.includes('employee-activity-agent')
    ) {
      return {
        hasConflict: true,
        detectedProcess: 'Niyantran Employee Agent (V1)',
      };
    }

    // Check if electron/node is running from the employee-agent directory
    if (lower.includes('employee-agent') && (lower.includes('electron') || lower.includes('node') || lower.includes('main.js'))) {
      return {
        hasConflict: true,
        detectedProcess: 'V1 Agent Process Instance',
      };
    }

    return { hasConflict: false, detectedProcess: null };
  }

  /**
   * Passive OS process scan. Never issues kill or suspend signals.
   *
   * @param {Object} [options]
   * @param {Function} [options.commandRunner] - Injected runner for testing
   * @returns {Promise<{ hasConflict: boolean, detectedProcess: string | null, error?: string }>}
   */
  static async checkV1Running(options = {}) {
    const runner = options.commandRunner || execAsync;
    const isWindows = process.platform === 'win32';

    try {
      const command = isWindows
        ? 'tasklist /FO CSV /NH'
        : 'ps aux';

      const { stdout } = await runner(command, { timeout: 3000 });
      return AgentConflictDetector.parseProcessOutput(stdout);
    } catch (err) {
      // If process query fails, return safe default without blocking system
      return {
        hasConflict: false,
        detectedProcess: null,
        error: err.message,
      };
    }
  }
}

export default AgentConflictDetector;
