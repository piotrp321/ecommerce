<?php

declare(strict_types=1);

namespace App\Shared\Domain\Exception;

/**
 * The requested object does not exist (or is not visible to the caller).
 */
abstract class NotFound extends \RuntimeException
{
}
