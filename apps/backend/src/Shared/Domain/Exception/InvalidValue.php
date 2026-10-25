<?php

declare(strict_types=1);

namespace App\Shared\Domain\Exception;

/**
 * A value breaks a domain rule (e.g. negative amount, malformed SKU).
 * The API adapters report it as invalid input.
 */
class InvalidValue extends \InvalidArgumentException
{
}
