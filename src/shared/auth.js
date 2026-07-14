/* ================================================
   RavenRoute — Auth Simulation
   ================================================ */

import { getProfile, saveProfile } from './store.js';
import { sendSMS } from './sms.js';

/**
 * Register a new user
 * @param {string} phone 
 * @param {string} password 
 * @param {string} role 'customer' | 'driver'
 * @param {object} profileData { name, photo, homeAddress, vehicle, etc }
 */
export function register(phone, password, role, profileData) {
  const existing = getProfile(phone);
  if (existing) {
    throw new Error('Phone number already registered.');
  }

  const userProfile = {
    phone,
    password, // Storing plaintext for simulation
    role,
    ...profileData,
    createdAt: new Date().toISOString()
  };

  saveProfile(phone, userProfile);

  // Send welcome SMS
  const welcomeMsg = `Welcome to RavenRoute! Your ${role} account is ready.`;
  sendSMS(phone, welcomeMsg);

  return login(phone, password);
}

/**
 * Login
 */
export function login(phone, password) {
  const profile = getProfile(phone);
  if (!profile || profile.password !== password) {
    throw new Error('Invalid phone number or password.');
  }

  // Set session
  sessionStorage.setItem('rr_session', JSON.stringify({
    phone: profile.phone,
    role: profile.role,
    name: profile.name
  }));

  return profile;
}

export function logout() {
  sessionStorage.removeItem('rr_session');
}

export function getCurrentUser() {
  const session = sessionStorage.getItem('rr_session');
  if (!session) return null;
  const { phone } = JSON.parse(session);
  return getProfile(phone);
}
