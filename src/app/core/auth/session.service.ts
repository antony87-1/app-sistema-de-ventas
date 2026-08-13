import { Injectable } from '@angular/core';

import type { AuthenticatedIdentity } from '../../domain/auth/authenticate-user.use-case';

export const SESSION_INACTIVITY_MS = 60 * 60 * 1000;

export class SessionManager {
  private identity: AuthenticatedIdentity | null = null;
  private lastActivityMilliseconds: number | null = null;

  constructor(private readonly nowMilliseconds: () => number = () => Date.now()) {}

  start(identity: AuthenticatedIdentity): void {
    this.identity = { ...identity };
    this.lastActivityMilliseconds = this.nowMilliseconds();
  }

  current(): AuthenticatedIdentity | null {
    if (this.hasExpired()) {
      this.clear();
      return null;
    }
    return this.identity === null ? null : { ...this.identity };
  }

  isAuthenticated(): boolean {
    return this.current() !== null;
  }

  touch(): boolean {
    if (this.current() === null) return false;
    this.lastActivityMilliseconds = this.nowMilliseconds();
    return true;
  }

  clear(): void {
    this.identity = null;
    this.lastActivityMilliseconds = null;
  }

  private hasExpired(): boolean {
    return (
      this.identity !== null &&
      this.lastActivityMilliseconds !== null &&
      this.nowMilliseconds() - this.lastActivityMilliseconds >= SESSION_INACTIVITY_MS
    );
  }
}

@Injectable({ providedIn: 'root' })
export class SessionService extends SessionManager {
  constructor() {
    super();
  }
}
