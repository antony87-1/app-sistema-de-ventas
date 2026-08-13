import type { AuthenticatedIdentity } from '../../domain/auth/authenticate-user.use-case';
import { SESSION_INACTIVITY_MS, SessionManager } from './session.service';

const IDENTITY: AuthenticatedIdentity = {
  userId: 'user-admin',
  role: 'ADMINISTRADOR',
  displayName: 'Administrador',
};

describe('SessionManager', () => {
  let currentTime: number;
  let session: SessionManager;

  beforeEach(() => {
    currentTime = Date.parse('2026-07-29T15:00:00.000Z');
    session = new SessionManager(() => currentTime);
  });

  it('keeps the authenticated identity before one hour of inactivity', () => {
    session.start(IDENTITY);
    currentTime += SESSION_INACTIVITY_MS - 1;

    expect(session.current()).toEqual(IDENTITY);
  });

  it('expires exactly after one hour without activity', () => {
    session.start(IDENTITY);
    currentTime += SESSION_INACTIVITY_MS;

    expect(session.current()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });

  it('renews inactivity time only while a session remains valid', () => {
    session.start(IDENTITY);
    currentTime += 30 * 60 * 1000;
    expect(session.touch()).toBe(true);
    currentTime += 31 * 60 * 1000;

    expect(session.current()).toEqual(IDENTITY);
  });

  it('clears all local session state on logout', () => {
    session.start(IDENTITY);
    session.clear();

    expect(session.current()).toBeNull();
  });
});
