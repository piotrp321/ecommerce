<?php

declare(strict_types=1);

namespace App\Customers\Infrastructure\Http;

use App\Customers\Infrastructure\Security\CustomerUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * The signed-in customer (registered on their first request).
 */
#[AsController]
final readonly class GetMeController
{
    #[Route('/me', name: 'customer_me', methods: ['GET'], format: 'json')]
    public function __invoke(#[CurrentUser] CustomerUser $customer): JsonResponse
    {
        return new JsonResponse([
            'id' => $customer->id,
            'email' => $customer->email,
            'emailVerified' => $customer->emailVerified,
        ]);
    }
}
