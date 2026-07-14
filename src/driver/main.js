/* ================================================
   RavenRoute — Driver Main Entry
   ================================================ */

import { initTheme } from '../shared/theme.js';
import { getCurrentUser, logout } from '../shared/auth.js';
import { setupAuthUI } from './auth-ui.js';
import { initDeliveries } from './deliveries.js';
import { initRouting } from './routing.js';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const user = getCurrentUser();
  if (user && user.role === 'driver') {
    showMainApp(user);
  } else {
    setupAuthUI(showMainApp);
  }
});

function showMainApp(user) {
  document.getElementById('view-auth').classList.remove('active');
  document.getElementById('view-main').classList.add('active');

  document.getElementById('driver-avatar').textContent = user.photo || '🧑‍✈️';
  document.getElementById('driver-name').textContent = user.name;
  document.getElementById('driver-vehicle').textContent = user.vehicle || '--';

  document.getElementById('btn-logout').addEventListener('click', () => {
    logout();
    window.location.reload();
  });

  initDeliveries(user);
  initRouting(user);
}
