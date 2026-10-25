<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Domain\Product\Product;
use App\Catalog\Domain\Product\Sku;
use App\Catalog\Domain\Slug;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Body of product create (with SKU) and update (SKU must be absent: it is immutable).
 */
final readonly class ProductPayload
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Regex('/^'.Slug::PATTERN.'$/D')]
        #[Assert\Length(max: Slug::MAX_LENGTH)]
        public string $slug,
        #[Assert\NotBlank(normalizer: 'trim')]
        #[Assert\Length(max: Product::NAME_MAX_LENGTH)]
        public string $name,
        #[Assert\NotBlank]
        #[Assert\Regex('/^(0|[1-9]\d{0,6})\.\d{2}$/D', message: 'Use a decimal amount with two decimal places, e.g. "10.00".')]
        public string $netPrice,
        #[Assert\Choice(choices: [23, 8, 5, 0])]
        public int $vatRate,
        #[Assert\Length(max: Product::DESCRIPTION_MAX_LENGTH)]
        public ?string $description = null,
        #[Assert\Uuid(strict: false)]
        public ?string $categoryId = null,
        #[Assert\NotBlank(groups: ['create'])]
        #[Assert\Regex('/^'.Sku::PATTERN.'$/D', groups: ['create'])]
        #[Assert\IsNull(groups: ['update'], message: 'The SKU cannot be changed.')]
        public ?string $sku = null,
    ) {
    }
}
