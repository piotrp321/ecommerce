<?php

declare(strict_types=1);

namespace App\Catalog\Application\Product;

use App\Catalog\Domain\Category\CategoryId;
use App\Catalog\Domain\Category\CategoryRepository;
use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Pricing\VatRate;

/**
 * Turns the primitive input shared by the product commands into domain values.
 */
final readonly class ProductInput
{
    public function __construct(private CategoryRepository $categories)
    {
    }

    public function vatRate(int $vatRate): VatRate
    {
        return VatRate::tryFrom($vatRate)
            ?? throw new InvalidValue(\sprintf('%d%% is not an allowed VAT rate (23, 8, 5, 0).', $vatRate));
    }

    /**
     * A product can only be assigned to an existing category.
     */
    public function existingCategory(?string $categoryId): ?CategoryId
    {
        if (null === $categoryId) {
            return null;
        }

        $id = CategoryId::fromString($categoryId);
        if (!$this->categories->exists($id)) {
            throw new InvalidValue(\sprintf('Category "%s" does not exist.', $id));
        }

        return $id;
    }
}
