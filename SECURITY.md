# Security Policy

atlas-ui hub is an **alpha lab** console. Bind it to loopback, use TLS at a reverse proxy if it leaves localhost, and do not treat default lab files as production secrets.

## Reporting a vulnerability

Do not open a public issue that includes secrets, tokens, private keys, or a one-time admin password.

If this repository is on GitHub, use a [private vulnerability advisory](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories).

Include:

- Affected commit or version
- Impact
- Reproduction steps that do not leak live credentials
