<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http;

use App\Catalog\Application\Query\CategoryDetails;
use App\Catalog\Application\Query\CategoryNode;
use App\Catalog\Application\Query\CategoryRecord;
use App\Catalog\Application\Query\CategoryRef;
use App\Catalog\Application\Query\Page;
use App\Catalog\Application\Query\ProductView;
use App\Shared\Domain\Pricing\Money;

/**
 * JSON representations of the catalog API (docs/api/openapi.yaml).
 * Customers see gross prices and only whether a product is in stock;
 * administrators see net prices and stock quantities as well.
 */
final class CatalogJson
{
    /**
     * @return array<string, mixed>
     */
    public static function publicProduct(ProductView $view): array
    {
        $product = $view->product;

        return [
            'id' => $product->id,
            'sku' => $product->sku,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'price' => [
                'gross' => self::money($view->grossPrice),
                'vatRate' => $product->vatRate->value,
            ],
            'category' => self::categoryRef($product->category),
            'inStock' => $view->availability->isInStock(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function adminProduct(ProductView $view): array
    {
        $product = $view->product;

        return [
            'id' => $product->id,
            'sku' => $product->sku,
            'slug' => $product->slug,
            'name' => $product->name,
            'description' => $product->description,
            'price' => [
                'net' => self::money($product->netPrice),
                'vatRate' => $product->vatRate->value,
                'gross' => self::money($view->grossPrice),
            ],
            'category' => self::categoryRef($product->category),
            'active' => $product->active,
            'stock' => [
                'onHand' => $view->availability->onHand,
                'reserved' => $view->availability->reserved,
                'available' => $view->availability->available,
            ],
            'createdAt' => $product->createdAt->format(\DATE_ATOM),
            'updatedAt' => $product->updatedAt->format(\DATE_ATOM),
        ];
    }

    /**
     * A category with its subcategories, recursively.
     *
     * @return array<string, mixed>
     */
    public static function publicCategoryNode(CategoryNode $node): array
    {
        return self::publicCategory($node->category) + [
            'children' => array_map(self::publicCategoryNode(...), $node->children),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function publicCategoryDetails(CategoryDetails $details): array
    {
        return self::publicCategory($details->node->category) + [
            'ancestors' => array_map(self::publicCategory(...), $details->ancestors),
            'children' => array_map(self::publicCategoryNode(...), $details->node->children),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function adminCategoryNode(CategoryNode $node): array
    {
        return self::adminCategory($node->category) + [
            'children' => array_map(self::adminCategoryNode(...), $node->children),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function adminCategoryDetails(CategoryDetails $details): array
    {
        return self::adminCategory($details->node->category) + [
            'ancestors' => array_map(self::publicCategory(...), $details->ancestors),
            'children' => array_map(self::adminCategoryNode(...), $details->node->children),
        ];
    }

    /**
     * @template T
     *
     * @param Page<T>                          $page
     * @param callable(T): array<string, mixed> $item
     *
     * @return array<string, mixed>
     */
    public static function page(Page $page, callable $item): array
    {
        return [
            'items' => array_map($item, $page->items),
            'page' => $page->page,
            'perPage' => $page->perPage,
            'totalItems' => $page->totalItems,
            'totalPages' => $page->totalPages(),
        ];
    }

    /**
     * @return array{id: string, slug: string, name: string}
     */
    private static function publicCategory(CategoryRecord $category): array
    {
        return ['id' => $category->id, 'slug' => $category->slug, 'name' => $category->name];
    }

    /**
     * @return array<string, mixed>
     */
    private static function adminCategory(CategoryRecord $category): array
    {
        return self::publicCategory($category) + [
            'parentId' => $category->parentId,
            'productCount' => $category->productCount,
        ];
    }

    /**
     * @return array{amount: string, currency: string}
     */
    private static function money(Money $money): array
    {
        return ['amount' => $money->toDecimal(), 'currency' => Money::CURRENCY];
    }

    /**
     * @return array{id: string, slug: string, name: string}|null
     */
    private static function categoryRef(?CategoryRef $category): ?array
    {
        return null === $category ? null : ['id' => $category->id, 'slug' => $category->slug, 'name' => $category->name];
    }
}
