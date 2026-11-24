import { API_URL } from '@/lib/api';

/**
 * Downloads the Niyantran Desktop Agent installer (.exe or .zip)
 * Handles authentication header (WorkflowToken) and triggers browser download.
 *
 * @param {'exe' | 'zip'} format
 * @returns {Promise<{ fileName: string, size: number }>}
 */
export async function downloadAgentInstaller(format = 'exe') {
  const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required: Please log in to your Niyantran account before downloading the desktop agent.');
  }
  const targetFormat = format === 'zip' ? 'zip' : 'exe';
  // Always the current V1 desktop agent package.
  const defaultFileName = 'Employee Activity Agent Setup 1.0.0.exe';

  const downloadEndpoint = `${API_URL}/monitoring-v2/installer/download${targetFormat === 'zip' ? '?format=zip' : ''}`;

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }

  const response = await fetch(downloadEndpoint, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error || errJson.message || errorDetail;
    } catch {
      // ignore json parse error
    }
    throw new Error(`Failed to download agent installer: ${errorDetail}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = defaultFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);

  return {
    fileName: defaultFileName,
    size: blob.size,
  };
}

/**
 * Fetches installer metadata (version, sha256, size, availability)
 */
export async function getInstallerInfo() {
  try {
    const res = await fetch(`${API_URL}/monitoring-v2/installer/info`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[installerDownload] Failed to fetch installer info:', err.message);
    return null;
  }
}
