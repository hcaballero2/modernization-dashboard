import { Injectable } from '@angular/core';

export const SESSION_KEYS = {
  organization: 'organization',
  token: 'token',
} as const;

@Injectable({ providedIn: 'root' })
export class SessionStorageService {
  private available = this.checkAvailability();

  private checkAvailability(): boolean {
    if (typeof sessionStorage === 'undefined') {
      return false;
    }
    try {
      const testKey = '__storage_test__';
      sessionStorage.setItem(testKey, '1');
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  get(key: string): string {
    if (!this.available) {
      return '';
    }
    try {
      return sessionStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  set(key: string, value: string): void {
    if (!this.available) {
      return;
    }
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Swallow errors to keep this a no-op when storage is unavailable.
    }
  }
}
