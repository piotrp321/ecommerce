/**
 * A dependency of the sign-in (Keycloak or the session store) is unavailable. Auth routes
 * answer 503; the session is kept, so the user is not signed out by an outage.
 */
export class AuthUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthUnavailableError';
  }
}

/** The session store (Redis) cannot be reached or did not answer in time. */
export class SessionStoreUnavailableError extends AuthUnavailableError {
  constructor(options?: ErrorOptions) {
    super('Session store unavailable', options);
    this.name = 'SessionStoreUnavailableError';
  }
}

/**
 * A stored token was encrypted with a key (`kid`) this replica does not have, e.g. during a
 * key rotation. The session is kept (another replica can read it); the request fails as
 * unavailable instead of signing the user out.
 */
export class SessionKeyUnavailableError extends AuthUnavailableError {
  constructor(options?: ErrorOptions) {
    super('Session encryption key unavailable in this replica', options);
    this.name = 'SessionKeyUnavailableError';
  }
}

/**
 * The backend rejected the access token of a session even after a refresh: the session was
 * removed. Shown as an error page, never as a redirect to the login (with an active SSO
 * session that would loop: login -> callback -> page -> 401 -> login).
 */
export class SessionRejectedError extends Error {
  constructor() {
    super('Session rejected by the backend');
    this.name = 'SessionRejectedError';
  }
}

/**
 * The authorization response or the login transaction is not valid (state, iss, nonce, PKCE,
 * an expired or replayed transaction, an error from the authorization server). The user
 * sees a friendly error page and no session is created.
 */
export class LoginFailedError extends Error {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super(`Login failed: ${reason}`, options);
    this.name = 'LoginFailedError';
  }
}
