<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Slug;
use Symfony\Component\Validator\Constraints as Assert;

final readonly class CategoryPayload
{
    public function __construct(
        #[Assert\NotBlank]
        #[Assert\Regex('/^'.Slug::PATTERN.'$/D')]
        #[Assert\Length(max: Slug::MAX_LENGTH)]
        public string $slug,
        #[Assert\NotBlank(normalizer: 'trim')]
        #[Assert\Length(max: Category::NAME_MAX_LENGTH)]
        public string $name,
    ) {
    }
}
