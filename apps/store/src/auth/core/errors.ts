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
