<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Security;

use App\Shared\Infrastructure\Http\Problem;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Exception\AccessDeniedException;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\Authentication\AuthenticationFailureHandlerInterface;
use Symfony\Component\Security\Http\Authorization\AccessDeniedHandlerInterface;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/**
 * Problem responses of the API firewalls (RFC 6750): 401 without a bearer token
 * or with an invalid one, 403 for an authenticated caller without the required
 * role. The details are generic; the cause of a rejection is only logged.
 */
final class ApiSecurityResponses implements AuthenticationEntryPointInterface, AuthenticationFailureHandlerInterface, AccessDeniedHandlerInterface
{
    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return Problem::response(Response::HTTP_UNAUTHORIZED, 'A bearer token is required.', [
            'WWW-Authenticate' => 'Bearer',
        ]);
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): Response
    {
        return Problem::response(Response::HTTP_UNAUTHORIZED, 'The bearer token is invalid.', [
            'WWW-Authenticate' => 'Bearer error="invalid_token"',
        ]);
    }

    public function handle(Request $request, AccessDeniedException $accessDeniedException): Response
    {
        return Problem::response(Response::HTTP_FORBIDDEN, 'Access denied.', [
            'WWW-Authenticate' => 'Bearer error="insufficient_scope"',
        ]);
    }
}
