/* ================================================
   RavenRoute — Customer Main Entry
   ================================================ */

import { initTheme } from '../shared/theme.js';
import { getCurrentUser } from '../shared/auth.js';
import { setupAuthUI } from './auth-ui.js';
import { initProfile } from './profile.js';
import { initTracking } from './tracking.js';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const user = getCurrentUser();
  if (user && user.role === 'customer') {
    showMainApp(user);
  } else {
    setupAuthUI(showMainApp);
  }
});

function showMainApp(user) {
  document.getElementById('view-auth').classList.remove('active');
  document.getElementById('view-main').classList.add('active');
  document.getElementById('user-avatar-mini').textContent = user.photo || '👤';

  initProfile(user);

  // Small delay so the map container has dimensions before Leaflet init
  requestAnimationFrame(() => {
    initTracking(user);
  });
}
