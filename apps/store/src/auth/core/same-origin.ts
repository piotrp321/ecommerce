interface HeaderSource {
  get(name: string): string | null;
}

export class CrossOriginRequestError extends Error {
  constructor() {
    super('Cross-origin request rejected');
    this.name = 'CrossOriginRequestError';
  }
}

/**
 * CSRF check of state-changing requests (Server Actions), in addition to the one of
 * Next.js. `Origin` must equal the public origin of the store (`STORE_PUBLIC_URL`, never
 * the `Host` header, which a proxy may rewrite). A request without `Origin` is accepted
 * only when the browser marks it `Sec-Fetch-Site: same-origin`.
 */
export function isSameOrigin(headers: HeaderSource, publicOrigin: string): boolean {
  const origin = headers.get('origin');
  if (origin === null || origin === '') return headers.get('sec-fetch-site') === 'same-origin';
  return origin === publicOrigin;
}

export function assertSameOrigin(headers: HeaderSource, publicOrigin: string): void {
  if (!isSameOrigin(headers, publicOrigin)) throw new CrossOriginRequestError();
}
