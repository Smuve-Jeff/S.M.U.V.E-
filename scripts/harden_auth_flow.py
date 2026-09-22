#!/usr/bin/env python3
import os
import re
import sys

# Target files to audit and harden
AUTH_SERVICE_PATH = "src/services/AuthService.js"

HARDENED_AUTH_SERVICE_CODE = """/**
 * Hardened AuthService
 * Automatically generated/fixed by scripts/harden_auth_flow.py
 */

class AuthService {
  constructor() {
    this.localStorageAvailable = this._checkStorage('localStorage');
    this.sessionStorageAvailable = this._checkStorage('sessionStorage');
  }

  _checkStorage(type) {
    try {
      const storage = window[type];
      const testKey = '__smv_storage_probe__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  async login(credentials) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Distinguish client/server validation from outage
        const err = new Error(errorData.message || 'Login failed');
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      this.persistSession(data.token, data.user);
      return data;
    } catch (error) {
      // Only treat network failures/TypeError as API outages
      if (error instanceof TypeError || (error.status && error.status >= 500)) {
        throw new Error('API Outage: Authentication server is temporarily unavailable.');
      }
      throw error;
    }
  }

  async register(userData) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err = new Error(errorData.message || 'Registration failed');
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      this.persistSession(data.token, data.user);
      return data;
    } catch (error) {
      if (error instanceof TypeError || (error.status && error.status >= 500)) {
        throw new Error('API Outage: Authentication server is temporarily unavailable.');
      }
      throw error;
    }
  }

  persistSession(token, user) {
    if (!this.localStorageAvailable) {
      throw new Error('Storage rejection: localStorage is unavailable or blocked.');
    }
    try {
      localStorage.setItem('smv_auth_token', token);
      localStorage.setItem('smv_user', JSON.stringify(user));
      return true;
    } catch (error) {
      throw new Error('Storage write rejected: Quota exceeded or permission denied.');
    }
  }

  persistTemporarySession(key, value) {
    if (!this.sessionStorageAvailable) {
      throw new Error('Storage rejection: sessionStorage is unavailable or blocked.');
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      throw new Error('Storage write rejected: Unable to save to sessionStorage.');
    }
  }
}

export default new AuthService();
"""

def audit_and_harden():
    print("[INFO] Running authentication flow hardening script...")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(AUTH_SERVICE_PATH), exist_ok=True)
    
    # Write the hardened service code
    with open(AUTH_SERVICE_PATH, "w", encoding="utf-8") as f:
        f.write(HARDENED_AUTH_SERVICE_CODE)
        
    print(f"[SUCCESS] Successfully wrote hardened authentication module to {AUTH_SERVICE_PATH}")
    print("[INFO] Fixed items:")
    print(" - Added browser-storage availability probes for localStorage and sessionStorage")
    print(" - Enforced rejection when storage is unavailable")
    print(" - Differentiated API outages (5xx/Network) from client validation errors (4xx)")

if __name__ == "__main__":
    audit_and_harden()

