/* ================================================
   RavenRoute — SMS Simulation
   ================================================ */

/**
 * Simulates sending an SMS by displaying a phone-style toast notification
 * @param {string} phone 
 * @param {string} message 
 */
export function sendSMS(phone, message) {
  console.log(`[SMS to ${phone}]: ${message}`);

  // Create UI element if it doesn't exist
  let container = document.getElementById('sms-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sms-toast-container';
    document.body.appendChild(container);

    // Add minimal CSS for the toast container if not present
    if (!document.getElementById('sms-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'sms-toast-styles';
      style.textContent = `
        #sms-toast-container {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
        }
        .sms-toast {
          width: 320px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          display: flex;
          gap: 12px;
          align-items: flex-start;
          transform: translateY(-20px);
          opacity: 0;
          animation: smsSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          pointer-events: auto;
        }
        .sms-toast-dark {
          background: rgba(30, 41, 59, 0.95);
          color: white;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        @keyframes smsSlideIn {
          to { transform: translateY(0); opacity: 1; }
        }
        .sms-toast-fadeout {
          animation: smsFadeOut 0.4s ease forwards !important;
        }
        @keyframes smsFadeOut {
          to { transform: translateY(-10px); opacity: 0; }
        }
        .sms-icon { font-size: 1.5rem; }
        .sms-content { flex: 1; }
        .sms-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .sms-sender { font-size: 0.8rem; font-weight: 600; color: #10b981; }
        .sms-toast-dark .sms-sender { color: #34d399; }
        .sms-time { font-size: 0.7rem; color: #64748b; }
        .sms-toast-dark .sms-time { color: #94a3b8; }
        .sms-text { font-size: 0.85rem; color: #334155; line-height: 1.4; }
        .sms-toast-dark .sms-text { color: #e2e8f0; }
      `;
      document.head.appendChild(style);
    }
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  const toast = document.createElement('div');
  toast.className = `sms-toast ${isDark ? 'sms-toast-dark' : ''}`;
  
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  toast.innerHTML = `
    <div class="sms-icon">💬</div>
    <div class="sms-content">
      <div class="sms-header">
        <span class="sms-sender">RavenRoute</span>
        <span class="sms-time">${now}</span>
      </div>
      <div class="sms-text">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  // Auto-remove after 6 seconds
  setTimeout(() => {
    toast.classList.add('sms-toast-fadeout');
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}
