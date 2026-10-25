<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Application\Category\CategoryHandler;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Requirement\Requirement;

#[AsController]
final readonly class DeleteCategoryController
{
    public function __construct(private CategoryHandler $handler)
    {
    }

    #[Route('/admin/catalog/categories/{id}', name: 'admin_catalog_category_delete', requirements: ['id' => Requirement::UUID], methods: ['DELETE'], format: 'json')]
    public function __invoke(string $id): Response
    {
        $this->handler->delete($id);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
