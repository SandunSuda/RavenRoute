/* ================================================
   RavenRoute — Driver Deliveries Manager
   ================================================ */

import { getDeliveries, addDelivery, removeDelivery, onMessage } from '../shared/store.js';

let activeDeliveries = [];
let mapRef = null;  // set by routing.js after map is ready

/** Called by routing.js once map is initialised */
export function setMapRef(m) {
  mapRef = m;
}

export function initDeliveries(user) {
  activeDeliveries = getDeliveries().filter(d => d.status !== 'delivered');
  renderList();

  // Cross-tab: new delivery from customer app (deduplicate)
  onMessage('DELIVERY_CREATED', (delivery) => {
    if (activeDeliveries.some(d => d.id === delivery.id)) return;
    activeDeliveries.push(delivery);
    renderList();
    window.dispatchEvent(new CustomEvent('deliveries-updated'));
  });

  // Cross-tab: delivery removed
  onMessage('DELIVERY_REMOVED', (id) => {
    const before = activeDeliveries.length;
    activeDeliveries = activeDeliveries.filter(d => d.id !== id);
    if (activeDeliveries.length !== before) {
      renderList();
      window.dispatchEvent(new CustomEvent('deliveries-updated'));
    }
  });

  setupManualAdd();
}

export function getActiveDeliveries() {
  return activeDeliveries;
}

export function markDeliveryDone(id) {
  activeDeliveries = activeDeliveries.filter(d => d.id !== id);
  renderList();
  window.dispatchEvent(new CustomEvent('deliveries-updated'));
}

// ---- Manual Add ----

let pinDropCallback = null; // set when waiting for a pin

function setupManualAdd() {
  const btnAdd  = document.getElementById('btn-add-delivery');
  const banner  = document.getElementById('add-delivery-banner');
  const modal   = document.getElementById('manual-add-modal');
  let selLat, selLng;

  btnAdd.addEventListener('click', () => {
    if (!mapRef) return alert('Map not ready yet. Please wait.');
    banner.classList.remove('hidden');
    modal.classList.add('hidden');

    // Use Leaflet map directly through the exported ref
    import('../shared/map.js').then(({ enablePinDrop }) => {
      enablePinDrop(mapRef, (lat, lng) => {
        banner.classList.add('hidden');
        selLat = lat; selLng = lng;
        document.getElementById('manual-loc-display').textContent =
          `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        modal.classList.remove('hidden');
      });
    });
  });

  document.getElementById('manual-add-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    banner.classList.add('hidden');
  });

  document.getElementById('manual-add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (selLat == null || selLng == null) return alert('Drop a pin on the map first');

    const customerVal = document.getElementById('manual-customer').value.trim();
    const descVal     = document.getElementById('manual-desc').value.trim();
    const weightVal   = document.getElementById('manual-weight').value.trim();

    // Field validations
    if (customerVal && customerVal.length < 2) {
      alert('⚠️ Validation failed: Customer Name must be at least 2 characters.');
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

    const id = 'MAN-' + Math.floor(1000 + Math.random() * 9000);
    const delivery = {
      id,
      customer:      customerVal || 'Manual Entry',
      customerPhone: '',
      customerPhoto: '📦',
      address:  `${selLat.toFixed(4)}, ${selLng.toFixed(4)}`,
      lat: selLat, lng: selLng,
      availability: 'AVAILABLE',
      package: {
        description: descVal || 'Standard',
        weight:      weightVal || '--',
        icon: '📦'
      },
      status: 'pending'
    };

    addDelivery(delivery);
    modal.classList.add('hidden');
    e.target.reset();
    selLat = null; selLng = null;
  });
}

// ---- Render ----

function renderList() {
  const list = document.getElementById('delivery-list');
  document.getElementById('delivery-count').textContent = `${activeDeliveries.length} stops`;
  document.getElementById('stat-pending').textContent   = activeDeliveries.length;

  if (activeDeliveries.length === 0) {
    list.innerHTML = `<div class="empty-list">No pending deliveries.<br>Waiting for orders...</div>`;
    return;
  }

  list.innerHTML = activeDeliveries.map(node => `
    <div class="delivery-item" data-id="${node.id}">
      <div class="di-order">
        <span class="di-avatar">${node.customerPhoto || '👤'}</span>
      </div>
      <div class="di-info">
        <strong>${node.customer}</strong>
        <span class="di-address">${node.address}</span>
        <div class="di-meta">
          <span>${node.package.icon} ${node.package.description}</span>
          ${node.package.weight && node.package.weight !== '--' ? `<span>⚖️ ${node.package.weight}</span>` : ''}
          ${node.customerPhone ? `<span>📱 ${node.customerPhone}</span>` : ''}
        </div>
      </div>
      <div class="di-actions">
        <button class="btn-remove-delivery" data-id="${node.id}" title="Remove">✕</button>
      </div>
    </div>`).join('');

  // Attach remove handlers
  list.querySelectorAll('.btn-remove-delivery').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove delivery ${btn.dataset.id}?`)) {
        removeDelivery(btn.dataset.id);
      }
    });
  });

  // Click item → pan map
  list.querySelectorAll('.delivery-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-remove-delivery')) return;
      const node = activeDeliveries.find(n => n.id === item.dataset.id);
      if (node) {
        window.dispatchEvent(new CustomEvent('focus-location', {
          detail: { lat: node.lat, lng: node.lng }
        }));
      }
    });
  });
}
