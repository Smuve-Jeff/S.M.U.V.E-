import { Injectable, signal } from '@angular/core';
import { AuthUser } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class SessionStateService {
  private _currentUser = signal<AuthUser | null>(null);
  private _isAuthenticated = signal(false);

  currentUser = this._currentUser.asReadonly();
  isAuthenticated = this._isAuthenticated.asReadonly();

  setUser(user: AuthUser | null) {
    this._currentUser.set(user);
    this._isAuthenticated.set(!!user);
  }
}
