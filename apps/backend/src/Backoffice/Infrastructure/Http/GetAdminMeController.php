<?php

declare(strict_types=1);

namespace App\Backoffice\Infrastructure\Http;

use App\Backoffice\Infrastructure\Security\AdminSecurityUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * The signed-in administrator (registered on their first request) with the
 * roles granted by the current access token.
 */
#[AsController]
final readonly class GetAdminMeController
{
    #[Route('/admin/me', name: 'admin_me', methods: ['GET'], format: 'json')]
    public function __invoke(#[CurrentUser] AdminSecurityUser $admin): JsonResponse
    {
        return new JsonResponse([
            'id' => $admin->id,
            'email' => $admin->email,
            'roles' => $admin->getRoles(),
        ]);
    }
}
