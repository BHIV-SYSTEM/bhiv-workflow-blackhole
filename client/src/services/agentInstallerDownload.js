import { API_URL } from '@/lib/api';

export async function downloadAgentInstaller(format = 'exe') {
  const token = localStorage.getItem('WorkflowToken') || localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required: Please log in to your Niyantran account before downloading the desktop agent.');
  }
  const defaultFileName = 'Employee Activity Agent Setup 1.0.0.exe';
  const downloadEndpoint = `${API_URL}/agent/installer/download`;

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }

  const response = await fetch(downloadEndpoint, { method: 'GET', headers });
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error || errJson.message || errorDetail;
    } catch (_) {}
    throw new Error(`Failed to download agent installer: ${errorDetail}`);
  }

  // Only the V1 employee-agent installer is served by this endpoint.
  const fileName = defaultFileName;

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);

  return { fileName, size: blob.size, url };
}

export function openInstaller(url) {
  if (url) window.open(url, '_blank');
}
