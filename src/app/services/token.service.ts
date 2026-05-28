import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  private _jwtToken = signal<string | null>(null);
  jwtToken = this._jwtToken.asReadonly();

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this._jwtToken.set(localStorage.getItem('smuve_jwt_token'));
    }
  }

  setToken(token: string | null) {
    this._jwtToken.set(token);
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('smuve_jwt_token', token);
      } else {
        localStorage.removeItem('smuve_jwt_token');
      }
    }
  }
}
