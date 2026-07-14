/* ================================================
   RavenRoute — Driver Routing (OSRM + Real-time Sync)
   ================================================ */

import { initMap, addMarker, drawRoute, drawOptimizedRoute, animateMarker, fitBounds, fetchRoadRoute, fetchDistanceMatrix, enablePinDrop } from '../shared/map.js';
import { solveTSP, solveTSPWithMatrix, haversineDistance } from '../shared/tsp.js';
import { generateQRCode, createDeliveryProof } from '../shared/qr.js';
import { broadcast, updateDeliveryStatus } from '../shared/store.js';
import { toggleTheme } from '../shared/theme.js';
import { getActiveDeliveries, markDeliveryDone, setMapRef } from './deliveries.js';

let map = null;
let markers = [];
let startMarker = null;
let driverMarker = null;
let routeLayers = [];
let animation = null;
let optimizedSequence = null;
let currentStopIdx = 0;
let startLocation = null;
let currentUser = null;
let isRouteActive = false;
let isRoutePaused = false;
let isAutoTracking = false;
let completedCount = 0;
let currentSegDistance = 0;

export function initRouting(user) {
  currentUser = user;

  // Small delay so the sidebar + map container have dimensions
  requestAnimationFrame(() => {
    map = initMap('driver-map', [6.7960, 79.9010], 13);
    setMapRef(map); // share map with deliveries.js for pin drop
    showStartLocationPrompt();
    setupControls();
    setupListeners();
    setupLocateButton();
    setupTrackDriverButton();
  });
}

function setupListeners() {
  // Focus on a delivery location
  window.addEventListener('focus-location', (e) => {
    if (map && e.detail) {
      map.flyTo([e.detail.lat, e.detail.lng], 16, { duration: 0.8 });
    }
  });

  // Re-place markers when deliveries change
  window.addEventListener('deliveries-updated', () => placeMarkers());

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function setupLocateButton() {
  const btnLocate = document.getElementById('btn-driver-locate');
  if (btnLocate) {
    btnLocate.addEventListener('click', () => {
      if (driverMarker) {
        map.flyTo(driverMarker.getLatLng(), 16, { duration: 0.8 });
      } else if (startLocation) {
        map.flyTo([startLocation.lat, startLocation.lng], 16, { duration: 0.8 });
      } else {
        if (!navigator.geolocation) {
          map.flyTo([6.7960, 79.9010], 14, { duration: 0.8 });
          return;
        }
        btnLocate.disabled = true;
        btnLocate.innerHTML = '⏳';
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
            btnLocate.disabled = false;
            btnLocate.innerHTML = '🎯';
          },
          () => {
            map.flyTo([6.7960, 79.9010], 14, { duration: 0.8 });
            btnLocate.disabled = false;
            btnLocate.innerHTML = '🎯';
          },
          { enableHighAccuracy: true }
        );
      }
    });
  }
}

function setupTrackDriverButton() {
  const btnTrack = document.getElementById('btn-driver-track');
  if (btnTrack) {
    btnTrack.addEventListener('click', () => {
      if (!driverMarker) return alert('⚠️ Start the route first to track your position.');
      
      isAutoTracking = !isAutoTracking;
      if (isAutoTracking) {
        btnTrack.classList.add('active');
        map.panTo(driverMarker.getLatLng());
      } else {
        btnTrack.classList.remove('active');
      }
    });

    // Automatically disable tracking if the user manually drags the map
    map.on('dragstart', () => {
      isAutoTracking = false;
      btnTrack.classList.remove('active');
    });
  }
}

function showStartLocationPrompt() {
  const overlay = document.getElementById('start-location-overlay');

  // Use current location
  document.getElementById('btn-start-current').addEventListener('click', () => {
    const btn = document.getElementById('btn-start-current');
    if (!navigator.geolocation) {
      document.getElementById('start-geo-status').textContent = 'Geolocation not supported';
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Locating...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartLocation(pos.coords.latitude, pos.coords.longitude);
        overlay.classList.add('hidden');
        btn.disabled = false;
        btn.innerHTML = '📍 Use My Current Location';
      },
      () => {
        btn.disabled = false;
        btn.innerHTML = '📍 Use My Current Location';
        document.getElementById('start-geo-status').textContent = 'Failed — pick on map instead';
      },
      { enableHighAccuracy: true }
    );
  });

  // Pick on map
  document.getElementById('btn-start-pick-map').addEventListener('click', () => {
    overlay.classList.add('hidden');
    document.getElementById('map-pick-banner').classList.remove('hidden');
    enablePinDrop(map, (lat, lng) => {
      document.getElementById('map-pick-banner').classList.add('hidden');
      setStartLocation(lat, lng);
    });
  });
}

function setStartLocation(lat, lng) {
  startLocation = { lat, lng };
  if (startMarker) map.removeLayer(startMarker);
  startMarker = addMarker(map, lat, lng, 'start', `<strong>Start</strong><br/>${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  document.getElementById('start-display').classList.remove('hidden');
  document.getElementById('start-coords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  document.getElementById('btn-optimize').disabled = false;

  placeMarkers();
}

function placeMarkers() {
  if (isRouteActive) return;
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const deliveries = getActiveDeliveries();
  const allCoords = startLocation ? [[startLocation.lat, startLocation.lng]] : [];

  deliveries.forEach((node) => {
    const marker = addMarker(map, node.lat, node.lng, 'delivery', `<strong>${node.customer}</strong><br/>${node.address}`);
    markers.push(marker);
    allCoords.push([node.lat, node.lng]);
  });

  if (allCoords.length > 1) fitBounds(map, allCoords);
}

function setupControls() {
  document.getElementById('btn-optimize').addEventListener('click', optimizeRoute);
  
  // Start / Pause / Resume route execution button
  document.getElementById('btn-start-route').addEventListener('click', () => {
    if (!isRouteActive) {
      startRoute();
    } else {
      if (!animation) return;
      const routeBtn = document.getElementById('btn-start-route');
      if (!isRoutePaused) {
        animation.pause();
        isRoutePaused = true;
        routeBtn.innerHTML = '<span>▶️</span> Continue Route';
      } else {
        animation.resume();
        isRoutePaused = false;
        routeBtn.innerHTML = '<span>⏸️</span> Pause Route';
      }
    }
  });

  document.getElementById('qr-close').addEventListener('click', hideQRModal);
  document.getElementById('btn-confirm-delivery').addEventListener('click', confirmDelivery);
  document.getElementById('btn-show-qr-trigger').addEventListener('click', () => {
    if (optimizedSequence && optimizedSequence[currentStopIdx]) {
      showQRModal(optimizedSequence[currentStopIdx]);
    }
  });

  // Re-open start location dialog trigger
  document.getElementById('btn-change-start').addEventListener('click', () => {
    if (isRouteActive) return alert('Cannot change start location while route is active.');
    document.getElementById('start-location-overlay').classList.remove('hidden');
  });
}

/* ---- Route Optimization ---- */

async function optimizeRoute() {
  const deliveries = getActiveDeliveries();
  if (!startLocation || deliveries.length === 0) return alert('Need a start location and at least one delivery');

  const btn = document.getElementById('btn-optimize');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Optimizing...';

  const allLocations = [startLocation, ...deliveries.map(n => ({ lat: n.lat, lng: n.lng }))];
  const matrix = await fetchDistanceMatrix(allLocations, currentUser.vehicle);

  let result;
  if (matrix) {
    result = solveTSPWithMatrix(matrix.distances, deliveries);
  } else {
    result = solveTSP(deliveries, startLocation);
  }

  optimizedSequence = result.sequence;
  document.getElementById('stat-distance').textContent = result.totalDistance.toFixed(1);

  // Clear old route layers
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];

  // Draw optimized route on real roads
  const waypoints = [startLocation, ...optimizedSequence.map(n => ({ lat: n.lat, lng: n.lng }))];
  const roadRoute = await fetchRoadRoute(waypoints, currentUser.vehicle);

  if (roadRoute) {
    const { glow, main } = drawOptimizedRoute(map, roadRoute.geometry);
    routeLayers.push(glow, main);
    fitBounds(map, roadRoute.geometry);
    document.getElementById('stat-distance').textContent = roadRoute.distance.toFixed(1);
  } else {
    const coords = waypoints.map(w => [w.lat, w.lng]);
    const { glow, main } = drawOptimizedRoute(map, coords);
    routeLayers.push(glow, main);
    fitBounds(map, coords);
  }

  // Numbered markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  optimizedSequence.forEach((node, i) => {
    const iconHtml = `<div class="map-icon icon-delivery" style="position:relative;">
      <span>📦</span>
      <div style="position:absolute;top:-8px;right:-8px;background:#7c3aed;color:white;border-radius:50%;width:20px;height:20px;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid white;">${i + 1}</div>
    </div>`;
    const icon = L.divIcon({ html: iconHtml, className: 'custom-map-icon', iconSize: [34, 34], iconAnchor: [17, 17] });
    markers.push(L.marker([node.lat, node.lng], { icon }).addTo(map));
  });

  const routeBtn = document.getElementById('btn-start-route');
  routeBtn.disabled = false;
  routeBtn.innerHTML = '<span>🚀</span> Start Route';
  routeBtn.classList.remove('completed');

  btn.innerHTML = '<span>✅</span> Optimized';
  btn.disabled = false;
}

/* ---- Route Execution ---- */

async function startRoute() {
  if (!optimizedSequence || optimizedSequence.length === 0) return;
  isRouteActive = true;
  isRoutePaused = false;
  currentStopIdx = 0;
  completedCount = 0;

  const routeBtn = document.getElementById('btn-start-route');
  routeBtn.innerHTML = '<span>⏸️</span> Pause Route';
  routeBtn.classList.remove('completed');
  document.getElementById('btn-optimize').disabled = true;
  document.getElementById('route-info-overlay').classList.remove('hidden');

  if (driverMarker) map.removeLayer(driverMarker);
  driverMarker = addMarker(map, startLocation.lat, startLocation.lng, 'courier');

  navigateToNextStop();
}

async function navigateToNextStop() {
  if (currentStopIdx >= optimizedSequence.length) {
    routeComplete();
    return;
  }

  const target = optimizedSequence[currentStopIdx];
  const from = currentStopIdx === 0
    ? startLocation
    : { lat: optimizedSequence[currentStopIdx - 1].lat, lng: optimizedSequence[currentStopIdx - 1].lng };

  updateDeliveryStatus(target.id, 'active');
  document.getElementById('btn-show-qr-trigger').classList.add('hidden');

  // Update route info overlay
  const dist = haversineDistance(from.lat, from.lng, target.lat, target.lng);
  const eta = Math.ceil((dist / 40) * 60);
  document.getElementById('ri-next-stop').textContent = target.customer;
  document.getElementById('ri-distance').textContent = `${dist.toFixed(1)} km`;
  document.getElementById('ri-eta').textContent = `${eta} min`;

  // Fetch real road segment based on driver's vehicle shortcuts
  const segRoute = await fetchRoadRoute([from, { lat: target.lat, lng: target.lng }], currentUser.vehicle);

  let pathCoords, segDistKm;
  if (segRoute) {
    pathCoords = segRoute.geometry;
    segDistKm = segRoute.distance;
  } else {
    pathCoords = [[from.lat, from.lng], [target.lat, target.lng]];
    segDistKm = dist;
  }

  currentSegDistance = segDistKm;

  const segLine = drawRoute(map, pathCoords, { color: '#059669', weight: 5, opacity: 0.8 });
  routeLayers.push(segLine);
  fitBounds(map, [[from.lat, from.lng], [target.lat, target.lng]]);

  // Speed-adjusted simulation duration
  const segDuration = Math.max(4000, Math.min(18000, segDistKm * 2500));

  let lastBroadcastTime = 0;

  animation = animateMarker(driverMarker, pathCoords, segDuration,
    (prog) => {
      const remKm = prog.remainingDistance;
      const etaMins = Math.ceil((remKm / 40) * 60);
      document.getElementById('ri-distance').textContent = `${remKm.toFixed(1)} km`;
      document.getElementById('ri-eta').textContent = `${etaMins} min`;

      // Center map dynamically if auto-tracking is enabled
      if (isAutoTracking) {
        map.panTo([prog.lat, prog.lng]);
      }

      // Hide or show the QR manual trigger button depending on proximity
      if (remKm < 0.1) {
        document.getElementById('btn-show-qr-trigger').classList.remove('hidden');
      } else {
        document.getElementById('btn-show-qr-trigger').classList.add('hidden');
      }

      // Throttled real-time updates broadcasted instantly within animation frames
      const now = performance.now();
      if (now - lastBroadcastTime > 150) {
        lastBroadcastTime = now;
        broadcast('DRIVER_LOCATION', {
          lat: prog.lat,
          lng: prog.lng,
          targetId: target.id,
          eta: etaMins,
          distance: remKm,
          initialDistance: segDistKm,
          driverName: currentUser.name,
          driverVehicle: currentUser.vehicle,
          driverPhoto: currentUser.photo
        });
      }

      // QR proximity check (< 100m)
      if (remKm < 0.1 && !animation.qrTriggered) {
        animation.qrTriggered = true;
        showQRModal(target);
      }
    },
    () => {
      // Final destination broadcast to ensure marker snaps exactly to the target coordinate
      broadcast('DRIVER_LOCATION', {
        lat: target.lat,
        lng: target.lng,
        targetId: target.id,
        eta: 0,
        distance: 0,
        initialDistance: segDistKm,
        driverName: currentUser.name,
        driverVehicle: currentUser.vehicle,
        driverPhoto: currentUser.photo
      });

      document.getElementById('btn-show-qr-trigger').classList.remove('hidden');
      if (!animation.qrTriggered) {
        animation.qrTriggered = true;
        showQRModal(target);
      }
    }
  );
}

/* ---- QR / Delivery Confirmation ---- */

function showQRModal(node) {
  if (animation) animation.pause();
  document.getElementById('qr-order-id').textContent = node.id;
  document.getElementById('qr-customer').textContent = node.customer;
  generateQRCode(document.getElementById('qr-code-container'), createDeliveryProof(node.id), 180);
  document.getElementById('qr-modal').classList.remove('hidden');
  document.getElementById('qr-modal').dataset.orderId = node.id;
}

function hideQRModal() {
  document.getElementById('qr-modal').classList.add('hidden');
  if (animation && !isRoutePaused) animation.resume();
}

function confirmDelivery() {
  const orderId = document.getElementById('qr-modal').dataset.orderId;
  hideQRModal();

  updateDeliveryStatus(orderId, 'delivered');
  markDeliveryDone(orderId);

  completedCount++;
  document.getElementById('stat-completed').textContent = completedCount;

  // Change marker to done
  if (markers[currentStopIdx]) {
    markers[currentStopIdx].setIcon(L.divIcon({
      html: '<div class="map-icon icon-delivery-done"><span>✅</span></div>',
      className: 'custom-map-icon', iconSize: [34, 34], iconAnchor: [17, 17]
    }));
  }

  currentStopIdx++;
  isRoutePaused = false;
  document.getElementById('btn-start-route').innerHTML = '<span>⏸️</span> Pause Route';
  setTimeout(() => navigateToNextStop(), 1000);
}

function routeComplete() {
  isRouteActive = false;
  isRoutePaused = false;

  // Set startLocation to last completed sequence stop for subsequent route execution
  if (optimizedSequence && optimizedSequence.length > 0) {
    const lastStop = optimizedSequence[optimizedSequence.length - 1];
    startLocation = { lat: lastStop.lat, lng: lastStop.lng };
    document.getElementById('start-coords').textContent = `${startLocation.lat.toFixed(4)}, ${startLocation.lng.toFixed(4)} (Last Stop)`;

    // Update start coordinate pin marker
    if (startMarker) map.removeLayer(startMarker);
    startMarker = addMarker(map, startLocation.lat, startLocation.lng, 'start', `<strong>Start (Last Stop)</strong>`);
  }

  isAutoTracking = false;
  const btnTrack = document.getElementById('btn-driver-track');
  if (btnTrack) btnTrack.classList.remove('active');

  document.getElementById('route-info-overlay').classList.add('hidden');
  document.getElementById('btn-show-qr-trigger').classList.add('hidden');
  const btn = document.getElementById('btn-start-route');
  btn.innerHTML = '<span>🏁</span> Route Complete!';
  btn.classList.add('completed');
  btn.disabled = true;

  document.getElementById('btn-optimize').disabled = false;

  if (optimizedSequence && optimizedSequence.length > 0) {
    const allCoords = [startLocation, ...optimizedSequence].map(n => [n.lat, n.lng]);
    fitBounds(map, allCoords);
  }
}
