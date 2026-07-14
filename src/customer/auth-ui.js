/* ================================================
   RavenRoute — Customer Auth UI (with Form Validation)
   ================================================ */

import { register, login } from '../shared/auth.js';

export function setupAuthUI(onSuccess) {
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showRegister = document.getElementById('show-register');
  const showLogin    = document.getElementById('show-login');

  showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  });

  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  // Register Form Submit
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = document.getElementById('register-phone').value.trim();
    const pass  = document.getElementById('register-password').value;
    const name  = document.getElementById('register-name').value.trim();

    // Form Validation Checks
    if (!name || name.length < 2) {
      alert('⚠️ Registration failed: Full Name must be at least 2 characters.');
      return;
    }
    
    // 9 or 10 digit number validation (standard Sri Lanka/mobile format)
    const phoneRegex = /^[0-9]{9,10}$/;
    if (!phoneRegex.test(phone)) {
      alert('⚠️ Registration failed: Phone Number must be a valid 9 or 10 digit number (without spaces or country code e.g. 771234567).');
      return;
    }

    if (!pass || pass.length < 4) {
      alert('⚠️ Registration failed: Password must be at least 4 characters long.');
      return;
    }

    try {
      const user = register(phone, pass, 'customer', { name, photo: '👤' });
      onSuccess(user);
    } catch (err) {
      alert(err.message);
    }
  });

  // Login Form Submit
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();
    const pass  = document.getElementById('login-password').value;

    const phoneRegex = /^[0-9]{9,10}$/;
    if (!phoneRegex.test(phone)) {
      alert('⚠️ Login failed: Please enter a valid 9 or 10 digit phone number.');
      return;
    }

    if (!pass) {
      alert('⚠️ Login failed: Please enter your password.');
      return;
    }

    try {
      const user = login(phone, pass);
      if (user.role !== 'customer') throw new Error('Not a customer account. Please use the Driver App.');
      onSuccess(user);
    } catch (err) {
      alert(err.message);
    }
  });
}
