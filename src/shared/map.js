/* ================================================
   RavenRoute — Leaflet Map Utilities
   Theme-aware tiles + OSRM real-road routing
   ================================================ */

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR   = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
const OSRM_BASE   = 'https://router.project-osrm.org';

/* ---- Map Init ---- */

export function initMap(containerId, center = [6.7960, 79.9010], zoom = 13) {
  const map = L.map(containerId, {
    center,
    zoom,
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 0,                   // Continuous zoom for responsive pinch/scroll
    zoomDelta: 1,
    wheelPxPerZoomLevel: 50        // Faster, snappier mouse scroll zooming
  });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tileLayer = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
    attribution: TILE_ATTR,
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  window.addEventListener('theme-changed', (e) => {
    tileLayer.setUrl(e.detail === 'dark' ? DARK_TILES : LIGHT_TILES);
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  return map;
}

/* ---- Helpers ---- */

export function smoothZoom(map, targetZoom, options = {}) {
  map.flyTo(map.getCenter(), targetZoom, { duration: 1.2, ...options });
}

export function enablePinDrop(map, callback) {
  map.getContainer().style.cursor = 'crosshair';
  const handler = (e) => {
    map.off('click', handler);
    map.getContainer().style.cursor = '';
    callback(e.latlng.lat, e.latlng.lng);
  };
  map.on('click', handler);
}

export function cancelPinDrop(map) {
  map.getContainer().style.cursor = '';
  map.off('click');
}

/* ---- OSRM Routing ---- */

export async function fetchRoadRoute(waypoints, vehicleType = 'Motorcycle') {
  try {
    // Motorcycle & Bicycle can use bicycle shortcuts and trails OSRM profiles
    const profile = (vehicleType === 'Bicycle' || vehicleType === 'Motorcycle') ? 'bicycle' : 'driving';
    const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates.map(c => [c[1], c[0]]),
        distance: route.distance / 1000,
        duration: route.duration / 60
      };
    }
  } catch (err) {
    console.warn('OSRM route fetch failed:', err);
  }
  return null;
}

export async function fetchDistanceMatrix(locations, vehicleType = 'Motorcycle') {
  try {
    const profile = (vehicleType === 'Bicycle' || vehicleType === 'Motorcycle') ? 'bicycle' : 'driving';
    const coords = locations.map(l => `${l.lng},${l.lat}`).join(';');
    const url = `${OSRM_BASE}/table/v1/${profile}/${coords}?annotations=distance,duration`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok') {
      return {
        distances: data.distances.map(row => row.map(d => d / 1000)),
        durations: data.durations.map(row => row.map(d => d / 60))
      };
    }
  } catch (err) {
    console.warn('OSRM table fetch failed:', err);
  }
  return null;
}

/* ---- Custom Icons ---- */

const iconConfig = {
  start:    { cls: 'icon-start',          emoji: '🚩', size: [40,40], anchor: [20,40] },
  courier:  { cls: 'icon-courier',        emoji: '🏍️', size: [44,44], anchor: [22,22] },
  customer: { cls: 'icon-customer',       emoji: '📍', size: [36,36], anchor: [18,36] },
  delivery: { cls: 'icon-delivery',       emoji: '📦', size: [34,34], anchor: [17,17] },
  done:     { cls: 'icon-delivery-done',  emoji: '✅', size: [34,34], anchor: [17,17] }
};

export function createIcon(type) {
  const c = iconConfig[type] || iconConfig.done;
  return L.divIcon({
    html: `<div class="map-icon ${c.cls}"><span>${c.emoji}</span></div>`,
    className: `custom-map-icon ${c.cls}`,
    iconSize: c.size,
    iconAnchor: c.anchor
  });
}

export function addMarker(map, lat, lng, type, popupText) {
  const marker = L.marker([lat, lng], { icon: createIcon(type) }).addTo(map);
  if (popupText) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    marker.bindPopup(`<div class="map-popup">${popupText}</div>`, {
      className: isDark ? 'dark-popup' : 'light-popup'
    });
  }
  return marker;
}

/* ---- Drawing ---- */

export function drawRoute(map, coords, options = {}) {
  const defaults = { color: '#7c3aed', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' };
  return L.polyline(coords, { ...defaults, ...options }).addTo(map);
}

export function drawOptimizedRoute(map, coords) {
  const glow = drawRoute(map, coords, { color: '#7c3aed', weight: 10, opacity: 0.2 });
  const main = drawRoute(map, coords, { color: '#6d28d9', weight: 5, opacity: 0.9 });
  return { glow, main };
}

/* ---- Animation ---- */

export function animateMarker(marker, path, durationMs, onProgress, onComplete) {
  if (!path || path.length < 2) {
    if (onComplete) onComplete();
    return { stop() {}, pause() {}, resume() {} };
  }

  let startTime = null;
  let animFrameId = null;
  let paused = false;
  let pausedAt = 0;
  let running = true;
  const totalSegments = path.length - 1;

  function tick(timestamp) {
    if (!running || paused) return;
    if (!startTime) startTime = timestamp - pausedAt;

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const segIdx = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
    const segProgress = (progress * totalSegments) - segIdx;

    const from = path[segIdx];
    const to = path[segIdx + 1] || from;
    const lat = from[0] + (to[0] - from[0]) * segProgress;
    const lng = from[1] + (to[1] - from[1]) * segProgress;

    marker.setLatLng([lat, lng]);

    if (onProgress) {
      onProgress({
        progress,
        currentIdx: segIdx,
        lat, lng,
        remainingDistance: estimateRemaining(path, segIdx, segProgress)
      });
    }

    if (progress >= 1) {
      running = false;
      if (onComplete) onComplete();
      return;
    }
    animFrameId = requestAnimationFrame(tick);
  }

  animFrameId = requestAnimationFrame(tick);

  return {
    stop() { running = false; if (animFrameId) cancelAnimationFrame(animFrameId); },
    pause() { paused = true; pausedAt = performance.now() - (startTime || 0); },
    resume() {
      if (!paused) return;
      paused = false; startTime = null;
      animFrameId = requestAnimationFrame(tick);
    }
  };
}

function estimateRemaining(path, segIdx, segProgress) {
  let dist = 0;
  const a = path[segIdx], b = path[segIdx + 1] || a;
  dist += segDist(a, b) * (1 - segProgress);
  for (let i = segIdx + 1; i < path.length - 1; i++) dist += segDist(path[i], path[i + 1]);
  return dist;
}

function segDist(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function fitBounds(map, coords, padding = [50, 50]) {
  if (!coords || coords.length === 0) return;
  const bounds = L.latLngBounds(coords);
  if (bounds.isValid()) map.fitBounds(bounds, { padding, maxZoom: 16 });
}
