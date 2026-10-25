<?php

declare(strict_types=1);

namespace App\Catalog\Domain;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * URL-friendly unique name of a product or category, e.g. "green-tea-100g".
 */
final readonly class Slug implements \Stringable
{
    public const string PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';
    public const int MAX_LENGTH = 120;

    public function __construct(public string $value)
    {
        if (\strlen($value) > self::MAX_LENGTH || 1 !== preg_match('/^'.self::PATTERN.'$/D', $value)) {
            throw new InvalidValue(\sprintf('"%s" is not a valid slug: use lowercase letters, digits and single hyphens, at most %d characters.', $value, self::MAX_LENGTH));
        }
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
