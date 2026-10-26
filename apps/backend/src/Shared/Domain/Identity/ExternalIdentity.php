<?php

declare(strict_types=1);

namespace App\Shared\Domain\Identity;

use App\Shared\Domain\Exception\InvalidValue;

/**
 * A person as known to an external identity provider: the subject (`sub`) is
 * unique only within its issuer (`iss`), so only the pair identifies the person.
 * Both parts are compared exactly (case-sensitive), as OpenID Connect requires.
 */
final readonly class ExternalIdentity
{
    public const int MAX_LENGTH = 255;

    public function __construct(public string $issuer, public string $subject)
    {
        foreach (['issuer' => $issuer, 'subject' => $subject] as $part => $value) {
            if ('' === $value || \strlen($value) > self::MAX_LENGTH) {
                throw new InvalidValue(\sprintf('The %s of an external identity must have 1 to %d characters.', $part, self::MAX_LENGTH));
            }
        }
    }

    public function equals(self $other): bool
    {
        return $this->issuer === $other->issuer && $this->subject === $other->subject;
    }
}
