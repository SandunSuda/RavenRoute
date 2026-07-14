/* ================================================
   RavenRoute — Customer Profile UI
   ================================================ */

import { logout, getCurrentUser } from '../shared/auth.js';
import { toggleTheme } from '../shared/theme.js';
import { initMap, enablePinDrop } from '../shared/map.js';
import { saveProfile, getProfile } from '../shared/store.js';

let homeMap = null;
let homeMapPendingLat = null;
let homeMapPendingLng = null;

export function initProfile(user) {
  const modal = document.getElementById('profile-modal');

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Open profile
  document.getElementById('profile-trigger').addEventListener('click', () => {
    // Always read fresh from store in case home address was saved
    const fresh = getProfile(user.phone) || user;
    document.getElementById('profile-avatar').textContent  = fresh.photo || '👤';
    document.getElementById('profile-name').textContent    = fresh.name;
    document.getElementById('profile-phone').textContent   = fresh.phone;
    document.getElementById('profile-address').textContent = fresh.address || 'No home address saved';
    modal.classList.remove('hidden');
  });

  document.getElementById('profile-close').addEventListener('click', () => modal.classList.add('hidden'));

  document.getElementById('btn-logout').addEventListener('click', () => { logout(); window.location.reload(); });

  // Save Home Address
  document.getElementById('btn-save-home').addEventListener('click', () => {
    modal.classList.add('hidden');
    openHomeAddressModal(user);
  });
}

function openHomeAddressModal(user) {
  const homeModal   = document.getElementById('home-address-modal');
  const coordsEl    = document.getElementById('home-address-coords');
  const confirmBtn  = document.getElementById('btn-confirm-home');
  const closeBtn    = document.getElementById('home-address-close');
  homeMapPendingLat = null; homeMapPendingLng = null;

  homeModal.classList.remove('hidden');

  // Init map once
  if (!homeMap) {
    requestAnimationFrame(() => {
      const existing = getProfile(user.phone);
      const center = existing?.lat
        ? [parseFloat(existing.lat), parseFloat(existing.lng)]
        : [6.7960, 79.9010];
      homeMap = initMap('home-address-map', center, 14);
      homeMap.invalidateSize();
      activateHomeMapPin();
    });
  } else {
    homeMap.invalidateSize();
    activateHomeMapPin();
  }

  function activateHomeMapPin() {
    let homePin = null;
    enablePinDrop(homeMap, (lat, lng) => {
      homeMapPendingLat = lat; homeMapPendingLng = lng;
      coordsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      confirmBtn.disabled = false;
      if (homePin) homeMap.removeLayer(homePin);
      homePin = L.marker([lat, lng]).addTo(homeMap);
      // Allow re-drop
      enablePinDrop(homeMap, (la, lo) => {
        homeMapPendingLat = la; homeMapPendingLng = lo;
        coordsEl.textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
        homeMap.removeLayer(homePin);
        homePin = L.marker([la, lo]).addTo(homeMap);
      });
    });
  }

  confirmBtn.onclick = () => {
    if (homeMapPendingLat == null) return;
    const profile = getProfile(user.phone) || {};
    saveProfile(user.phone, {
      ...profile,
      lat:     homeMapPendingLat,
      lng:     homeMapPendingLng,
      address: `${homeMapPendingLat.toFixed(4)}, ${homeMapPendingLng.toFixed(4)}`
    });
    homeModal.classList.add('hidden');
    // Update in-memory user reference
    user.lat     = homeMapPendingLat;
    user.lng     = homeMapPendingLng;
    user.address = `${homeMapPendingLat.toFixed(4)}, ${homeMapPendingLng.toFixed(4)}`;
    
    import('./tracking.js').then(module => {
      module.updateHomeAddressUI();
    });
    
    alert('Home address saved!');
  };

  closeBtn.onclick = () => homeModal.classList.add('hidden');
}
