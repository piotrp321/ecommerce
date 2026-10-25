<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Persistence\Doctrine;

use App\Shared\Domain\Identity\UuidIdentifier;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Exception\InvalidType;
use Doctrine\DBAL\Types\Exception\ValueNotConvertible;
use Doctrine\DBAL\Types\GuidType;

/**
 * Maps an identifier value object to a native UUID column.
 *
 * @template T of UuidIdentifier
 */
abstract class UuidIdentifierType extends GuidType
{
    /**
     * @return class-string<T>
     */
    abstract protected function identifierClass(): string;

    /**
     * @return T|null
     */
    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?UuidIdentifier
    {
        if (null === $value) {
            return null;
        }
        $class = $this->identifierClass();
        if ($value instanceof $class) {
            return $value;
        }
        if (!\is_string($value)) {
            throw ValueNotConvertible::new($value, $class);
        }

        return $class::fromString($value);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if (null === $value) {
            return null;
        }
        if ($value instanceof UuidIdentifier) {
            return $value->value;
        }

        throw InvalidType::new($value, static::class, ['null', UuidIdentifier::class]);
    }
}
