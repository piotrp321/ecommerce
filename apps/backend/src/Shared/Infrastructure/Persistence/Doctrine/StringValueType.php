<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Persistence\Doctrine;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Exception\InvalidType;
use Doctrine\DBAL\Types\Exception\ValueNotConvertible;
use Doctrine\DBAL\Types\StringType;

/**
 * Maps a value object with a public string $value and a constructor taking it.
 *
 * @template T of \Stringable
 */
abstract class StringValueType extends StringType
{
    /**
     * @return class-string<T>
     */
    abstract protected function valueClass(): string;

    /**
     * @return T|null
     */
    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?\Stringable
    {
        if (null === $value) {
            return null;
        }
        $class = $this->valueClass();
        if ($value instanceof $class) {
            return $value;
        }
        if (!\is_string($value)) {
            throw ValueNotConvertible::new($value, $class);
        }

        return new $class($value);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if (null === $value) {
            return null;
        }
        if ($value instanceof ($this->valueClass())) {
            return (string) $value;
        }

        throw InvalidType::new($value, static::class, ['null', $this->valueClass()]);
    }
}
