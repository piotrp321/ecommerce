# ADR-0007: API contract lint and contract tests

- Status: accepted
- Date: 2026-10-25

## Context

The REST API contract `docs/api/openapi.yaml` (OpenAPI 3.1, [ADR-0005](0005-catalog-inventory-and-admin-api-access.md)) is maintained by hand next to the Symfony implementation.
Stage 5 of the monorepo plan requires that changes to the contract are verified in CI and that contract tests detect differences between the backend and the contract.
The typed client `packages/sdk` follows in a separate step, coordinated with the store and admin work.

## Decision

1. **Lint.** Redocly CLI (exact version, root dev dependency) with `recommended-strict`, so warnings are errors.
   - Exceptions are listed with a reason in `.redocly.lint-ignore.yaml`.
   - `make contract-lint` runs it in the container with telemetry disabled; `make check` runs it first.

2. **Response validation in the existing functional tests.**
   - `ApiTestCase::request()` validates every response against the operation documented for its method and path:
     - the status code must be documented (exact, `4XX` range or `default`),
     - the `Content-Type` must be documented for that status,
     - the JSON body must validate against the schema.
   - Schemas are validated with `opis/json-schema` (draft 2020-12, the schema dialect of OpenAPI 3.1, e.g. `type: [string, "null"]`).
   - The whole contract is registered as one document, so `$ref`s resolve as in the contract; pointers are percent-encoded per RFC 6901.
   - Result: every functional test is also a contract test, with no separate suite to keep in sync.

3. **Route parity.** `ApiRoutesMatchContractTest` compares the Symfony routes (method + path) with the documented operations in both directions. An undocumented endpoint and a documented operation without a route both fail.

4. **The contract stays in `docs/api`.** The backend dev container mounts it read-only at `/contract`; the production image does not contain it.

5. **In-process validation instead of black-box fuzzing.**
   - It is fast and deterministic, and needs no extra services.
   - Property-based black-box testing (e.g. Schemathesis) can be added later if needed.

## Consequences

- **Every endpoint or JSON change needs a contract change in the same commit**, otherwise the tests fail. Requests sent directly through `$this->client` (outside `ApiTestCase::request()`) are not validated automatically; call `assertResponseMatchesContract()` there when it matters.
- **The first run found a real mismatch.** Router-level 404/405 responses of JSON requests (e.g. a non-UUID id) were plain `application/json`. `ApiExceptionSubscriber` now renders them as problem details, based on the `Accept` header (HTML clients unchanged).
- **The contract gained `GET /health`** (Operations tag) and explicit `security: []` on public operations.
- **Validation covers what the tests exercise.** Documented statuses that no test triggers (e.g. some `400`/`415` cases described in the contract's introduction) are not proven.
