import { API_URL } from '@/lib/api';

export async function downloadAgentInstaller() {
  const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required: Please log in to your Niyantran account before downloading the desktop agent.');
  }

  const defaultFileName = 'Employee Activity Agent Setup 1.0.0.exe';
  const infoEndpoint = `${API_URL}/agent/installer/info`;
  const downloadEndpoint = `${API_URL}/agent/installer/download`;

  // Preflight metadata check so missing/unreachable installers surface a clear UI error
  // while letting the browser stream the ~78 MB binary natively (supporting resume/retry).
  let fileName = defaultFileName;
  let fileSize = 0;

  const infoRes = await fetch(infoEndpoint, { method: 'GET' });
  if (!infoRes.ok) {
    let errorDetail = `HTTP ${infoRes.status}`;
    try {
      const errJson = await infoRes.json();
      errorDetail = errJson.error || errJson.message || errorDetail;
    } catch {
      // Non-JSON error response; fall back to HTTP status.
    }
    throw new Error(`Failed to download agent installer: ${errorDetail}`);
  }

  const info = await infoRes.json().catch(() => null);
  if (info && info.available === false) {
    throw new Error('Agent installer package is not available on the server.');
  }
  if (info?.fileName) fileName = info.fileName;
  if (typeof info?.fileSize === 'number') fileSize = info.fileSize;

  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = downloadEndpoint;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  return { fileName, size: fileSize, url: downloadEndpoint };
}

export function openInstaller(url) {
  if (url) window.open(url, '_blank');
}
