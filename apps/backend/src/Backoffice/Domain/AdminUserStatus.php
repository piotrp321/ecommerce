<?php

declare(strict_types=1);

namespace App\Backoffice\Domain;

enum AdminUserStatus: string
{
    case Active = 'active';
    /** Locally blocked: denied regardless of the roles in the token. */
    case Blocked = 'blocked';
}
