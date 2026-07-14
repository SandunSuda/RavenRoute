/* ================================================
   RavenRoute — Customer Tracking & Delivery Creation
   Multi-delivery support, smooth real-time updates
   ================================================ */

import { initMap, enablePinDrop, createIcon } from '../shared/map.js';
import { addDelivery, getDeliveries, onMessage, saveProfile, getProfile } from '../shared/store.js';

let map = null;
let currentUser = null;

// Per-delivery state
const deliveryPins = {};       // id → Leaflet marker
let driverMarker = null;       // single marker for the active driver

// Currently-tracked delivery in the detail view
let viewingDeliveryId = null;

// Map of all active (non-delivered) deliveries we know about
let myDeliveries = [];         // array of delivery objects

// Per-delivery tracking state
const deliveryState = {};     // id → { initialDistance, lastEta, lastDist }

// Pin drop for new delivery
let pendingLat = null;
let pendingLng = null;

let isAutoTrackingDriver = false;

// ============================================================
export function initTracking(user) {
  currentUser = user;

  // Restore existing deliveries from localStorage that belong to this customer
  myDeliveries = getDeliveries().filter(d =>
    d.customerPhone === user.phone && d.status !== 'delivered'
  );

  const center = (user.lat && user.lng)
    ? [parseFloat(user.lat), parseFloat(user.lng)]
    : [6.7960, 79.9010];

  map = initMap('customer-map', center, 14);

  // Place existing delivery pins on the map
  myDeliveries.forEach(d => placeDeliveryPin(d));

  setupCreation();
  setupTracking();
  setupPanel();
  setupLocateButton();
  setupTrackDriverButton();
  updateDeliveryListPanel();
  updateHomeAddressUI();
}

// Update the home address topbar and modal options visibility
export function updateHomeAddressUI() {
  if (!currentUser) return;
  const profile = getProfile(currentUser.phone) || currentUser;
  const topbarHomeBtn = document.getElementById('btn-topbar-home');
  const homeOpt = document.getElementById('home-addr-option');
  const saveHomeOpt = document.getElementById('save-current-as-home-option');

  if (profile && profile.lat && profile.lng) {
    if (topbarHomeBtn) topbarHomeBtn.classList.add('hidden');
    if (homeOpt) homeOpt.classList.remove('hidden');
    if (saveHomeOpt) saveHomeOpt.classList.add('hidden');
  } else {
    if (topbarHomeBtn) topbarHomeBtn.classList.remove('hidden');
    if (homeOpt) homeOpt.classList.add('hidden');
    if (saveHomeOpt) saveHomeOpt.classList.remove('hidden');
  }
}

function placeDeliveryPin(d) {
  if (deliveryPins[d.id]) map.removeLayer(deliveryPins[d.id]);
  deliveryPins[d.id] = L.marker([d.lat, d.lng], { icon: createIcon('customer') }).addTo(map);
  deliveryPins[d.id].bindPopup(`<strong>Order: ${d.id}</strong><br>${d.package.description}`);
}

// Locate button in the bottom-right corner of the map
function setupLocateButton() {
  const btnLocate = document.getElementById('btn-customer-locate');
  if (btnLocate) {
    btnLocate.addEventListener('click', () => {
      const coords = [];
      // Add driver marker coordinates if active
      if (driverMarker) {
        coords.push([driverMarker.getLatLng().lat, driverMarker.getLatLng().lng]);
      }
      // Add active deliveries coordinates
      myDeliveries.forEach(d => {
        if (d.lat && d.lng && d.status !== 'delivered') {
          coords.push([d.lat, d.lng]);
        }
      });

      if (coords.length > 0) {
        import('../shared/map.js').then(m => {
          m.fitBounds(map, coords, [60, 60]);
        });
      } else {
        // Fallback default center if empty
        map.flyTo([6.7960, 79.9010], 14, { duration: 0.8 });
      }
    });
  }
}

function setupTrackDriverButton() {
  const btnTrack = document.getElementById('btn-customer-track');
  if (btnTrack) {
    btnTrack.addEventListener('click', () => {
      if (!driverMarker) return alert('⚠️ No active driver to track yet.');
      
      isAutoTrackingDriver = !isAutoTrackingDriver;
      if (isAutoTrackingDriver) {
        btnTrack.classList.add('active');
        map.panTo(driverMarker.getLatLng());
      } else {
        btnTrack.classList.remove('active');
      }
    });

    // Automatically disable tracking if the user manually drags the map
    map.on('dragstart', () => {
      isAutoTrackingDriver = false;
      btnTrack.classList.remove('active');
    });
  }
}

// ============================================================
// PIN DROP / DELIVERY CREATION
// ============================================================

function setupCreation() {
  const overlay = document.getElementById('create-delivery-overlay');
  const btnGeo  = document.getElementById('btn-use-location');
  const modal   = document.getElementById('create-form-modal');

  function activatePinDrop() {
    enablePinDrop(map, (lat, lng) => {
      pendingLat = lat; pendingLng = lng;
      openCreateForm(lat, lng);
    });
  }

  // Geolocation button
  btnGeo.addEventListener('click', () => {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    btnGeo.disabled = true;
    btnGeo.innerHTML = '<span class="spinner"></span> Locating...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        pendingLat = pos.coords.latitude; pendingLng = pos.coords.longitude;
        openCreateForm(pendingLat, pendingLng);
        btnGeo.disabled = false;
        btnGeo.innerHTML = '📍 Use My Location';
      },
      () => {
        btnGeo.disabled = false;
        btnGeo.innerHTML = '📍 Use My Location';
        document.getElementById('geo-status').textContent = 'Failed — tap the map instead';
      },
      { enableHighAccuracy: true }
    );
  });

  // "Use Home Address" shortcut in the create form
  const btnHomeAddr = document.getElementById('btn-use-home-addr');
  if (btnHomeAddr) {
    btnHomeAddr.addEventListener('click', () => {
      const profile = getProfile(currentUser.phone) || currentUser;
      if (!profile || !profile.lat || !profile.lng) return;
      pendingLat = parseFloat(profile.lat);
      pendingLng = parseFloat(profile.lng);
      // Update pin
      if (deliveryPins['__pending']) map.removeLayer(deliveryPins['__pending']);
      deliveryPins['__pending'] = L.marker([pendingLat, pendingLng], { icon: createIcon('customer') }).addTo(map);
      map.flyTo([pendingLat, pendingLng], 16, { duration: 0.8 });
      document.getElementById('create-loc-display').textContent =
        `${pendingLat.toFixed(5)}, ${pendingLng.toFixed(5)} (Home)`;
    });
  }

  // "Save Pinned Location as Home" option inside new delivery form
  const btnSaveCurrentAsHome = document.getElementById('btn-save-current-as-home');
  if (btnSaveCurrentAsHome) {
    btnSaveCurrentAsHome.addEventListener('click', () => {
      if (pendingLat == null || pendingLng == null) return;
      const profile = getProfile(currentUser.phone) || {};
      saveProfile(currentUser.phone, {
        ...profile,
        lat:     pendingLat,
        lng:     pendingLng,
        address: `${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`
      });
      // Update local memory
      currentUser.lat = pendingLat;
      currentUser.lng = pendingLng;
      currentUser.address = `${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`;
      updateHomeAddressUI();
      alert('This location has been saved as your home address!');
    });
  }

  function openCreateForm(lat, lng) {
    overlay.classList.add('hidden');
    if (deliveryPins['__pending']) map.removeLayer(deliveryPins['__pending']);
    deliveryPins['__pending'] = L.marker([lat, lng], { icon: createIcon('customer') }).addTo(map);
    map.flyTo([lat, lng], 16, { duration: 0.8 });
    document.getElementById('create-loc-display').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    updateHomeAddressUI();
    modal.classList.remove('hidden');
  }

  // Close create form
  document.getElementById('create-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    overlay.classList.add('hidden'); // overlay hidden by default
    if (deliveryPins['__pending']) { map.removeLayer(deliveryPins['__pending']); delete deliveryPins['__pending']; }
    // Deactivate pin drop cursor
    import('../shared/map.js').then(m => m.cancelPinDrop(map));
  });

  // "+ Request" from topbar handles initiation now

  // "+ Request" from topbar
  const topbarCreateBtn = document.getElementById('btn-topbar-create');
  if (topbarCreateBtn) {
    topbarCreateBtn.addEventListener('click', () => {
      overlay.classList.remove('hidden');
      activatePinDrop();
    });
  }

  // Submit delivery
  document.getElementById('create-delivery-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (pendingLat == null || pendingLng == null) return alert('Pin a location first');

    const receiverVal = document.getElementById('create-receiver').value.trim();
    const descVal     = document.getElementById('create-desc').value.trim();
    const weightVal   = document.getElementById('create-weight').value.trim();

    // Form Field Validations
    if (receiverVal && receiverVal.length < 2) {
      alert('⚠️ Validation failed: Receiver Name must be at least 2 characters.');
      return;
    }
    if (descVal && descVal.length < 3) {
      alert('⚠️ Validation failed: Description must be at least 3 characters.');
      return;
    }
    if (weightVal) {
      const weightRegex = /^[0-9]+(\.[0-9]+)?\s*(kg|g|lbs|kg)?$/i;
      if (!weightRegex.test(weightVal)) {
        alert('⚠️ Validation failed: Please specify weight in a valid format (e.g. "2kg", "500g", or just "2").');
        return;
      }
    }

    const id = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
    const delivery = {
      id,
      customer:      currentUser.name,
      customerPhone: currentUser.phone,
      customerPhoto: currentUser.photo || '👤',
      address:  `${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`,
      lat: pendingLat,
      lng: pendingLng,
      availability: 'AVAILABLE',
      package: {
        description: descVal || 'Standard Package',
        weight:      weightVal || '1 kg',
        icon: '📦'
      },
      receiver: receiverVal || currentUser.name,
      status:   'pending'
    };

    addDelivery(delivery);
    e.target.reset();
    modal.classList.add('hidden');

    // Move pending pin to named pin
    if (deliveryPins['__pending']) {
      deliveryPins[id] = deliveryPins['__pending'];
      delete deliveryPins['__pending'];
    }
    pendingLat = null; pendingLng = null;

    myDeliveries.push(delivery);
    deliveryState[id] = { initialDistance: null };
    updateDeliveryListPanel();

    // Go directly to tracking view for this new delivery
    showTrackingView(id);
    import('../shared/map.js').then(m => m.cancelPinDrop(map)); // deactivate crosshair cursor after submission
  });
}

// ============================================================
// PANEL MANAGEMENT
// ============================================================

function updateDeliveryListPanel() {
  const predispatch = document.getElementById('panel-predispatch');
  const listPanel   = document.getElementById('panel-deliveries');
  const listEl      = document.getElementById('active-deliveries-list');

  const active = myDeliveries.filter(d => d.status !== 'delivered');

  if (active.length === 0) {
    predispatch.classList.remove('hidden');
    listPanel.classList.add('hidden');
    return;
  }

  predispatch.classList.add('hidden');
  listPanel.classList.remove('hidden');

  listEl.innerHTML = active.map(d => {
    const statusClass = d.status === 'active' ? 'status-active' : 'status-dispatching';
    const statusLabel = d.status === 'active' ? '🚚 En route' : '⏳ Pending';
    return `
      <div class="my-delivery-item" data-id="${d.id}">
        <div class="mdi-icon">📦</div>
        <div class="mdi-info">
          <strong>${d.id}</strong>
          <span>${d.package.description}</span>
        </div>
        <div class="mdi-status ${statusClass}">${statusLabel}</div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.my-delivery-item').forEach(item => {
    item.addEventListener('click', () => showTrackingView(item.dataset.id));
  });
}

function showTrackingView(id) {
  viewingDeliveryId = id;
  const d = myDeliveries.find(x => x.id === id);
  if (!d) return;

  document.getElementById('panel-predispatch').classList.add('hidden');
  document.getElementById('panel-deliveries').classList.add('hidden');
  document.getElementById('panel-delivered').classList.add('hidden');
  document.getElementById('panel-tracking').classList.remove('hidden');

  document.getElementById('track-order-id').textContent = id;

  const s = deliveryState[id] || {};
  document.getElementById('track-courier-name').textContent    = s.driverName    || 'Waiting for driver';
  document.getElementById('track-courier-vehicle').textContent = s.driverVehicle || '--';
  document.getElementById('track-courier-avatar').textContent  = s.driverPhoto   || '🧑‍✈️';
  document.getElementById('track-eta').textContent             = s.eta ? `${s.eta} min` : '-- min';
  document.getElementById('track-distance').textContent        = s.dist != null ? `${s.dist.toFixed(1)} km remaining` : '-- km remaining';
  document.getElementById('track-completion').textContent      = s.pct  != null ? `${Math.round(s.pct)}% complete` : '0% complete';
  document.getElementById('track-progress-fill').style.width  = s.pct  != null ? `${s.pct}%` : '0%';

  const statusClass = d.status === 'active' ? 'status-active' : 'status-dispatching';
  const statusText  = d.status === 'active' ? 'Courier en route' : 'Dispatching';
  document.getElementById('track-status-badge').className = `order-status-badge ${statusClass}`;
  document.getElementById('track-status-text').textContent = statusText;

  const timelineStep = d.status === 'active' ? (s.dist != null && s.dist < 0.5 ? 'arriving' : 'transit') : 'dispatching';
  setTimelineStep(timelineStep);

  // Fly map to delivery pin
  if (d.lat && d.lng) map.flyTo([d.lat, d.lng], 15, { duration: 0.8 });
}

function backToList() {
  viewingDeliveryId = null;
  document.getElementById('panel-tracking').classList.add('hidden');
  document.getElementById('panel-delivered').classList.add('hidden');
  updateDeliveryListPanel();
}

// ============================================================
// LIVE TRACKING (BroadcastChannel)
// ============================================================

function setupTracking() {
  onMessage('DRIVER_LOCATION', (data) => {
    const { lat, lng, targetId, eta, distance, initialDistance, driverName, driverVehicle, driverPhoto } = data;

    // Only process if one of our deliveries is being targeted
    const myDelivery = myDeliveries.find(d => d.id === targetId);
    if (!myDelivery) {
      if (driverMarker) {
        map.removeLayer(driverMarker);
        driverMarker = null;
      }
      return;
    }

    // Update or create driver marker instantly (browser handles smooth CSS transition on .icon-courier)
    if (!driverMarker) {
      driverMarker = L.marker([lat, lng], {
        icon: createIcon('courier'),
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      driverMarker.setLatLng([lat, lng]);
    }

    // Auto-center map if tracking mode is active
    if (isAutoTrackingDriver) {
      map.panTo([lat, lng]);
    }

    // Save state for this delivery
    const dist = (typeof distance === 'number' && !isNaN(distance)) ? distance : null;
    const etaVal = (typeof eta === 'number') ? eta : (parseFloat(eta) || null);

    if (!deliveryState[targetId]) deliveryState[targetId] = {};
    const s = deliveryState[targetId];

    if (driverName) s.driverName = driverName;
    if (driverVehicle) s.driverVehicle = driverVehicle;
    if (driverPhoto) s.driverPhoto = driverPhoto;
    if (etaVal !== null) s.eta = Math.ceil(etaVal);
    if (dist !== null) {
      s.dist = dist;
      // Use road matrix initialDistance, fall back to current distance only if invalid
      const initDist = (typeof initialDistance === 'number' && !isNaN(initialDistance) && initialDistance > 0.01) ? initialDistance : dist;
      s.initialDistance = initDist;
      s.pct = initDist > 0.01
        ? Math.min(100, Math.max(0, ((initDist - dist) / initDist) * 100))
        : 0;
    }

    // Mark delivery as active
    const delivObj = myDeliveries.find(d => d.id === targetId);
    if (delivObj && delivObj.status !== 'active') {
      delivObj.status = 'active';
      updateDeliveryListPanel();
    }

    // If this is the one we're currently viewing, update UI
    if (viewingDeliveryId === targetId) {
      if (s.driverName) document.getElementById('track-courier-name').textContent = s.driverName;
      if (s.driverVehicle) document.getElementById('track-courier-vehicle').textContent = s.driverVehicle;
      if (s.driverPhoto) document.getElementById('track-courier-avatar').textContent = s.driverPhoto;

      document.getElementById('track-status-text').textContent = 'Courier en route';
      document.getElementById('track-status-badge').className  = 'order-status-badge status-active';

      if (etaVal !== null)
        document.getElementById('track-eta').textContent = `${Math.ceil(etaVal)} min`;
      if (dist !== null) {
        document.getElementById('track-distance').textContent = `${dist.toFixed(1)} km remaining`;
        document.getElementById('track-progress-fill').style.width = `${s.pct}%`;
        document.getElementById('track-completion').textContent = `${Math.round(s.pct)}% complete`;
        if (dist < 0.5) setTimelineStep('arriving');
        else setTimelineStep('transit');
      }
    }
  });

  // Delivery delivered
  onMessage('DELIVERY_STATUS', (data) => {
    if (data.status !== 'delivered') return;
    const delivObj = myDeliveries.find(d => d.id === data.id);
    if (!delivObj) return;

    delivObj.status = 'delivered';
    updateDeliveryListPanel();

    if (viewingDeliveryId === data.id) {
      completeDelivery(data.id);
    }
  });

  // Delivery removed/cancelled by driver
  onMessage('DELIVERY_REMOVED', (id) => {
    const deliv = myDeliveries.find(d => d.id === id);
    if (!deliv) return;

    alert(`⚠️ Delivery Request ${id} has been cancelled by the driver.`);

    if (deliveryPins[id]) {
      map.removeLayer(deliveryPins[id]);
      delete deliveryPins[id];
    }

    if (viewingDeliveryId === id) {
      if (driverMarker) {
        map.removeLayer(driverMarker);
        driverMarker = null;
      }
      document.getElementById('panel-tracking').classList.add('hidden');
      document.getElementById('panel-delivered').classList.add('hidden');
      viewingDeliveryId = null;
    }

    myDeliveries = myDeliveries.filter(d => d.id !== id);
    updateDeliveryListPanel();
  });
}

function completeDelivery(id) {
  setTimelineStep('delivered');
  document.getElementById('track-status-text').textContent = 'Delivered';
  document.getElementById('track-status-badge').className  = 'order-status-badge status-delivered';

  // Mark pin as complete instead of deleting it!
  if (deliveryPins[id]) {
    deliveryPins[id].setIcon(createIcon('done'));
    deliveryPins[id].bindPopup(`<strong>Order ${id}</strong><br>Status: Delivered ✅`);
  }

  // Remove driver marker if no more active deliveries
  const stillActive = myDeliveries.some(d => d.status === 'active');
  if (!stillActive && driverMarker) {
    map.removeLayer(driverMarker);
    driverMarker = null;
  }

  setTimeout(() => {
    document.getElementById('panel-tracking').classList.add('hidden');
    document.getElementById('panel-delivered').classList.remove('hidden');
    document.getElementById('delivered-time').textContent = `Delivered at ${new Date().toLocaleTimeString()}`;

    // Automatically transition back to active list after 4 seconds
    setTimeout(() => {
      document.getElementById('panel-delivered').classList.add('hidden');
      myDeliveries = myDeliveries.filter(d => d.id !== id);
      viewingDeliveryId = null;
      updateDeliveryListPanel();
    }, 4000);
  }, 1200);
}

function setTimelineStep(step) {
  const order = ['dispatching', 'transit', 'arriving', 'delivered'];
  const idx = order.indexOf(step);
  document.querySelectorAll('#panel-tracking .timeline-step').forEach((el, i) => {
    el.classList.remove('completed', 'active');
    if (i < idx) el.classList.add('completed');
    else if (i === idx) el.classList.add('active');
  });
}

// ============================================================
// PANEL SETUP
// ============================================================

function setupPanel() {
  document.getElementById('btn-back-to-list').addEventListener('click', backToList);
}
