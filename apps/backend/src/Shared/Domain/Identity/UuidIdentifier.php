<?php

declare(strict_types=1);

namespace App\Shared\Domain\Identity;

use App\Shared\Domain\Exception\InvalidValue;
use Symfony\Component\Uid\Uuid;

/**
 * Base for aggregate identifiers: a UUID (v7 when generated, so new rows are
 * inserted in index order) in its canonical lowercase form.
 */
abstract readonly class UuidIdentifier implements \Stringable
{
    final private function __construct(public string $value)
    {
    }

    public static function generate(): static
    {
        return new static(Uuid::v7()->toRfc4122());
    }

    public static function fromString(string $value): static
    {
        if (!Uuid::isValid($value)) {
            throw new InvalidValue(\sprintf('"%s" is not a valid identifier.', $value));
        }

        return new static(Uuid::fromString($value)->toRfc4122());
    }

    public function equals(self $other): bool
    {
        return static::class === $other::class && $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
