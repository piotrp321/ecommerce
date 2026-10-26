<?php

declare(strict_types=1);

namespace App\Customers\Domain;

use App\Shared\Domain\Exception\InvalidValue;
use App\Shared\Domain\Identity\ExternalIdentity;

/**
 * A customer of the store. Accounts, passwords and e-mail verification live in
 * the identity provider (realm "store"); the shop knows the customer by their
 * external identity and keeps a copy of the profile data it needs.
 */
final class Customer
{
    public const int EMAIL_MAX_LENGTH = 254;

    private string $issuer;
    private string $subject;
    private ?string $email;
    private bool $emailVerified;
    private \DateTimeImmutable $updatedAt;

    private function __construct(
        private readonly CustomerId $id,
        ExternalIdentity $identity,
        ?string $email,
        bool $emailVerified,
        private readonly \DateTimeImmutable $createdAt,
    ) {
        $this->issuer = $identity->issuer;
        $this->subject = $identity->subject;
        [$this->email, $this->emailVerified] = self::profile($email, $emailVerified);
        $this->updatedAt = $createdAt;
    }

    /**
     * The customer seen for the first time (just-in-time registration).
     */
    public static function register(CustomerId $id, ExternalIdentity $identity, ?string $email, bool $emailVerified, \DateTimeImmutable $now): self
    {
        return new self($id, $identity, $email, $emailVerified, $now);
    }

    /**
     * Copies the profile from the identity provider.
     *
     * @return bool whether anything changed (and needs saving)
     */
    public function syncProfile(?string $email, bool $emailVerified, \DateTimeImmutable $now): bool
    {
        [$email, $emailVerified] = self::profile($email, $emailVerified);
        if ($email === $this->email && $emailVerified === $this->emailVerified) {
            return false;
        }
        $this->email = $email;
        $this->emailVerified = $emailVerified;
        $this->updatedAt = $now;

        return true;
    }

    public function id(): CustomerId
    {
        return $this->id;
    }

    public function identity(): ExternalIdentity
    {
        return new ExternalIdentity($this->issuer, $this->subject);
    }

    public function email(): ?string
    {
        return $this->email;
    }

    public function emailVerified(): bool
    {
        return $this->emailVerified;
    }

    public function createdAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function updatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * An empty e-mail means none; without an e-mail nothing is verified.
     *
     * @return array{?string, bool}
     */
    private static function profile(?string $email, bool $emailVerified): array
    {
        $email = null === $email ? null : trim($email);
        if ('' === $email || null === $email) {
            return [null, false];
        }
        if (\strlen($email) > self::EMAIL_MAX_LENGTH) {
            throw new InvalidValue(\sprintf('An e-mail address can have at most %d characters.', self::EMAIL_MAX_LENGTH));
        }

        return [$email, $emailVerified];
    }
}
