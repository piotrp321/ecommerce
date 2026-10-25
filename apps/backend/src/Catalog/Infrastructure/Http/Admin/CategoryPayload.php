<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure\Http\Admin;

use App\Catalog\Domain\Category\Category;
use App\Catalog\Domain\Slug;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Body of category create (with an optional parent) and update (slug and name;
 * the parent changes only through the move operation).
 */
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
        #[Assert\Uuid]
        #[Assert\IsNull(groups: ['update'], message: 'Use the move operation to change the parent.')]
        public ?string $parentId = null,
    ) {
    }
}
