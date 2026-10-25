<?php

declare(strict_types=1);

namespace App\Shared\Domain\Exception;

/**
 * The operation conflicts with the current state (duplicate identifier,
 * object still in use, concurrent modification).
 */
abstract class Conflict extends \RuntimeException
{
}
