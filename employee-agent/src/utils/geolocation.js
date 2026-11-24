/**
 * Real geolocation for the desktop agent.
 *
 * Priority:
 *   1. Windows Location API (accurate when the user granted location permission)
 *   2. IP geolocation fallback (approximate city/region level)
 *
 * Results are cached so start-day/end-day never block for long.
 */
const { execFile } = require('child_process');
const axios = require('axios');

const WINDOWS_GEO_PS = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Devices.Geolocation.Geolocator,Windows.Devices.Geolocation,ContentType=WindowsRuntime]
  $null = [Windows.Devices.Geolocation.Geoposition,Windows.Devices.Geolocation,ContentType=WindowsRuntime]

  $m = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
  } | Select-Object -First 1
  if (-not $m) { exit 1 }

  $locator = New-Object Windows.Devices.Geolocation.Geolocator
  $locator.DesiredAccuracyInMeters = 50
  $op = $locator.GetGeopositionAsync()
  $gm = $m.MakeGenericMethod([Windows.Devices.Geolocation.Geoposition])
  $task = $gm.Invoke($null, @($op))
  if (-not $task.Wait([TimeSpan]::FromSeconds(8))) { exit 1 }
  if ($task.IsFaulted) { exit 1 }

  $p = $task.Result
  'LAT=' + $p.Coordinate.Point.Position.Latitude
  'LON=' + $p.Coordinate.Point.Position.Longitude
  'ACC=' + [Math]::Round($p.Coordinate.Accuracy, 1)
} catch {
  exit 1
}
`;

const CACHE_TTL_MS = 5 * 60 * 1000;
const GEO_TIMEOUT_MS = 12000;

let cached = null;
let cachedAt = 0;
let inflight = null;

function parseWindowsOutput(stdout) {
  const out = {};
  String(stdout || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key === 'LAT' || key === 'LON' || key === 'ACC') out[key] = parseFloat(val);
    });
  if (
    Number.isFinite(out.LAT) &&
    Number.isFinite(out.LON) &&
    Math.abs(out.LAT) <= 90 &&
    Math.abs(out.LON) <= 180
  ) {
    return {
      latitude: out.LAT,
      longitude: out.LON,
      accuracy: Number.isFinite(out.ACC) ? out.ACC : 50,
      source: 'windows',
    };
  }
  return null;
}

function getWindowsLocation() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_GEO_PS],
      { timeout: GEO_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        resolve(parseWindowsOutput(stdout));
      }
    );
  });
}

async function getIpLocation() {
  try {
    const res = await axios.get('http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon,query', {
      timeout: 8000,
    });
    const d = res.data || {};
    if (d.status !== 'success' || !Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return null;
    return {
      latitude: d.lat,
      longitude: d.lon,
      accuracy: 5000,
      source: 'ip',
      city: d.city || '',
      region: d.regionName || '',
      country: d.country || '',
    };
  } catch (_) {
    return null;
  }
}

async function reverseGeocode(latitude, longitude) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { format: 'jsonv2', lat: latitude, lon: longitude, zoom: 18 },
      timeout: 8000,
      headers: { 'User-Agent': 'NiyantranDesktopAgent/1.0' },
    });
    const display = res.data && res.data.display_name;
    return display ? String(display) : null;
  } catch (_) {
    return null;
  }
}

function buildFallbackAddress(loc) {
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

async function resolveLocation() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    let loc = await getWindowsLocation();
    if (!loc) loc = await getIpLocation();
    if (!loc) return null;

    // The agent never has a meaningful street address from Windows Location API,
    // so always ask for a human readable address. Server also reverse geocodes
    // generic addresses, but we resolve it here so the payload is self-describing.
    let address = await reverseGeocode(loc.latitude, loc.longitude);
    if (!address) address = buildFallbackAddress(loc);

    const result = {
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      // Empty address makes the server reverse geocode the coordinates.
      address: address || '',
      source: loc.source,
    };
    cached = result;
    cachedAt = Date.now();
    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT) || 19.1589;
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG) || 72.838645;
const OFFICE_RADIUS = parseInt(process.env.OFFICE_RADIUS, 10) || 2000;

function isNearOffice(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(latitude - OFFICE_LAT);
  const dLng = toRad(longitude - OFFICE_LNG);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(OFFICE_LAT)) * Math.cos(toRad(latitude)) * Math.sin(dLng / 2) ** 2;
  const distanceM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return distanceM <= OFFICE_RADIUS;
}

module.exports = { resolveLocation, isNearOffice, OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS };
