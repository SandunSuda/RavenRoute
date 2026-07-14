/* ================================================
   RavenRoute — Shared Store (Cross-Tab Sync)
   BroadcastChannel for real-time push, localStorage for persistence
   ================================================ */

// ---- localStorage Keys (declared first — used by storage event listener) ----
const KEYS = {
  DELIVERIES: 'rr_deliveries',
  PROFILES: 'rr_profiles',
  THEME: 'rr_theme'
};

const bc = new BroadcastChannel('ravenroute_sync');
const listeners = {};

bc.onmessage = (event) => {
  const { type, payload } = event.data;
  if (listeners[type]) {
    listeners[type].forEach(cb => cb(payload));
  }
};

// Fallback: catch localStorage changes from other tabs
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.DELIVERIES && listeners['STORAGE_DELIVERIES_CHANGED']) {
    listeners['STORAGE_DELIVERIES_CHANGED'].forEach(cb => cb());
  }
});

export function broadcast(type, payload) {
  bc.postMessage({ type, payload });
  if (listeners[type]) {
    listeners[type].forEach(cb => cb(payload));
  }
}

export function onMessage(type, callback) {
  if (!listeners[type]) listeners[type] = [];
  listeners[type].push(callback);
}

// ---- Delivery CRUD ----

export function getDeliveries() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.DELIVERIES)) || [];
  } catch { return []; }
}

export function saveDeliveries(deliveries) {
  localStorage.setItem(KEYS.DELIVERIES, JSON.stringify(deliveries));
}

export function addDelivery(delivery) {
  const deliveries = getDeliveries();
  if (deliveries.some(d => d.id === delivery.id)) return; // prevent duplicate
  deliveries.push(delivery);
  saveDeliveries(deliveries);
  broadcast('DELIVERY_CREATED', delivery);
}

export function removeDelivery(id) {
  const deliveries = getDeliveries().filter(d => d.id !== id);
  saveDeliveries(deliveries);
  broadcast('DELIVERY_REMOVED', id);
}

export function updateDeliveryStatus(id, status) {
  const deliveries = getDeliveries();
  const idx = deliveries.findIndex(d => d.id === id);
  if (idx !== -1) {
    deliveries[idx].status = status;
    saveDeliveries(deliveries);
    broadcast('DELIVERY_STATUS', { id, status });
  }
}

// ---- Profile CRUD ----

export function getProfiles() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.PROFILES)) || {};
  } catch { return {}; }
}

export function saveProfile(phone, profileData) {
  const profiles = getProfiles();
  profiles[phone] = profileData;
  localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));
  broadcast('PROFILE_UPDATED', { phone, profileData });
}

export function getProfile(phone) {
  return getProfiles()[phone] || null;
}
