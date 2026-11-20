/**
 * Employee Monitoring V2 - Passive V1 Agent Conflict Detector
 * 
 * NON-INTERFERENCE & COEXISTENCE (Correction 1):
 * V2 must NEVER terminate, pause, disable, uninstall, or alter V1 automatically.
 * 
 * This service provides non-invasive detection of legacy V1 agent processes.
 * If V1 is detected, V2 enters V1_AGENT_CONFLICT state and refuses to start its
 * own input collection, preserving V1 operation completely.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class ConflictDetector {
  /**
   * Evaluates process list output for known V1 agent signatures.
   * Pure function for reliable testing.
   *
   * @param {string} output
   * @returns {{ hasConflict: boolean, detectedProcess: string|null }}
   */
  static parseProcessOutput(output) {
    if (!output || typeof output !== 'string') {
      return { hasConflict: false, detectedProcess: null };
    }
    const lower = output.toLowerCase();
    const v1Signatures = [
      'employee-activity-agent.exe',
      'niyantran employee agent',
      'niyantran-agent',
      'employee-activity-agent'
    ];

    for (const sig of v1Signatures) {
      if (lower.includes(sig)) {
        return { hasConflict: true, detectedProcess: sig };
      }
    }

    if (lower.includes('employee-agent') && (lower.includes('electron') || lower.includes('node') || lower.includes('main.js'))) {
      return { hasConflict: true, detectedProcess: 'employee-agent instance' };
    }

    return { hasConflict: false, detectedProcess: null };
  }

  /**
   * Non-invasively inspects running processes to determine if V1 is active.
   * Returns true if V1 process exists; does NOT send kill or pause signals.
   * 
   * @param {Object} [options]
   * @param {Function} [options.commandRunner]
   * @returns {Promise<{ hasConflict: boolean, detectedProcess: string|null }>}
   */
  static async checkV1AgentStatus(options = {}) {
    const runner = options.commandRunner || execAsync;
    try {
      if (process.platform === 'win32') {
        const { stdout } = await runner('tasklist /FO CSV /NH');
        return ConflictDetector.parseProcessOutput(stdout);
      } else if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await runner('ps aux');
        return ConflictDetector.parseProcessOutput(stdout);
      }
      return { hasConflict: false, detectedProcess: null };
    } catch (_) {
      // If process query command fails or is restricted, fail open safely
      return { hasConflict: false, detectedProcess: null };
    }
  }
}

module.exports = ConflictDetector;
