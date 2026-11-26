// The V1 employee-agent installer is the only agent package. This module is
// kept as a compatibility shim for legacy imports; it never calls V2 APIs.
export { downloadAgentInstaller } from '@/services/agentInstallerDownload'

export async function getInstallerInfo() {
  try {
    const { API_URL } = await import('@/lib/api')
    const res = await fetch(`${API_URL}/agent/installer/info`)
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn('[installerDownload] Failed to fetch installer info:', err.message)
    return null
  }
}
