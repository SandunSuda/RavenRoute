/* ================================================
   RavenRoute — Driver Auth UI (with Form Validation)
   ================================================ */

import { register, login } from '../shared/auth.js';

// Vehicle emoji map
const VEHICLE_EMOJI = {
  Bicycle:    '🚲',
  Motorcycle: '🏍️',
  Car:        '🚗',
  Van:        '🚐',
  Truck:      '🚚'
};

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
    const phone   = document.getElementById('register-phone').value.trim();
    const pass    = document.getElementById('register-password').value;
    const name    = document.getElementById('register-name').value.trim();
    const vehicle = document.getElementById('register-vehicle').value;

    // Form Validation Checks
    if (!name || name.length < 2) {
      alert('⚠️ Registration failed: Full Name must be at least 2 characters.');
      return;
    }

    const phoneRegex = /^[0-9]{9,10}$/;
    if (!phoneRegex.test(phone)) {
      alert('⚠️ Registration failed: Phone Number must be a valid 9 or 10 digit number (e.g. 771234567).');
      return;
    }

    if (!pass || pass.length < 4) {
      alert('⚠️ Registration failed: Password must be at least 4 characters long.');
      return;
    }

    if (!vehicle) {
      alert('⚠️ Registration failed: Please select a vehicle type.');
      return;
    }

    const photo = VEHICLE_EMOJI[vehicle] || '🧑‍✈️';
    try {
      const user = register(phone, pass, 'driver', { name, photo, vehicle });
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
      if (user.role !== 'driver') throw new Error('Not a driver account. Please use the Customer Portal.');
      onSuccess(user);
    } catch (err) {
      alert(err.message);
    }
  });
}
