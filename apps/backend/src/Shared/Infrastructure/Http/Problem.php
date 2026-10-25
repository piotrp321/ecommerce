<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Http;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * RFC 9457 problem details response.
 */
final class Problem
{
    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>  $extra   extension members, e.g. "violations"
     */
    public static function response(int $status, string $detail, array $headers = [], array $extra = []): JsonResponse
    {
        return new JsonResponse(
            [
                'type' => 'about:blank',
                'title' => Response::$statusTexts[$status] ?? 'Error',
                'status' => $status,
                'detail' => $detail,
            ] + $extra,
            $status,
            ['Content-Type' => 'application/problem+json'] + $headers,
        );
    }
}
