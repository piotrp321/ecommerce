<?php

use App\Tests\Support\Security\TestKeys;
use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

// Signing keys of the fake identity provider: new ones on every test run, so no
// key material is committed (tests/Support/Security).
TestKeys::generate();

// The tests talk to the fake identity provider of .env.test only. The dev container
// sets real OIDC_* variables (compose.override.yaml), and real variables win over
// .env files, so they are removed before the .env files are loaded.
foreach (array_keys($_SERVER + $_ENV + getenv()) as $name) {
    if (str_starts_with((string) $name, 'OIDC_')) {
        unset($_SERVER[$name], $_ENV[$name]);
        putenv((string) $name);
    }
}

(new Dotenv())->bootEnv(dirname(__DIR__).'/.env');

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
