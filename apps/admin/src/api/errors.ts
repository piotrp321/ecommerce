/** One field error of an RFC 9457 validation problem (`violations`). */
export interface Violation {
  propertyPath: string;
  title: string;
}

export interface Problem {
  status: number;
  title: string;
  detail?: string;
  violations?: Violation[];
}

/**
 * Error answered by the API (RFC 9457 `application/problem+json`).
 * Request format errors carry `violations`; business-rule errors (409, 422)
 * carry only `detail`, which the UI shows as it is.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly violations: readonly Violation[];

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
    this.violations = problem.violations ?? [];
  }
}

/** Field errors keyed by request property, e.g. `{ netPrice: '…' }`. */
export function violationsByField(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const violation of error.violations) {
    fields[violation.propertyPath] ??= violation.title;
  }

  return fields;
}

/** A message for the user; never exposes stack traces or raw responses. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Brak uprawnień do wykonania tej operacji.';
    }
    if (error.violations.length > 0 && error.detail === undefined) {
      return 'Popraw zaznaczone pola formularza.';
    }

    return error.detail ?? error.title;
  }

  return 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.';
}
