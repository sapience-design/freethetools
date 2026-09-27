# Security policy

Free the Tools promises that files never leave the visitor's device. A way to break that promise is the most serious kind of bug we can have, and we want to hear about it.

## Report a vulnerability privately

**Do not open a public issue.** Use either:

- **GitHub private vulnerability reporting**: [open a draft security advisory](https://github.com/sapience-design/freethetools/security/advisories/new) (preferred), or
- **Email**: security@freethetools.com

Please include what you found, steps to reproduce it, the affected page or tool, and the impact you believe it has.

## What happens next

We follow coordinated vulnerability disclosure (ISO/IEC 29147 and 30111):

| Step | Target |
|---|---|
| We confirm we received your report | 3 working days |
| We confirm whether it's a vulnerability and how severe (CVSS 4.0) | 10 working days |
| Fix released for critical and high severity | 30 days |
| Fix released for medium and low severity | 90 days |
| Public advisory, crediting you unless you'd rather not | After the fix is live |

We'll keep you updated along the way. If we can't meet a target, we'll tell you why.

## In scope

- The site at freethetools.com and its preview deployments
- Any tool that sends data off the device, loads code from another origin, or bypasses the Content Security Policy
- Cross-site scripting, injection through file contents, or a crafted file that runs code in a tool
- The build and release pipeline: GitHub Actions workflows and dependencies
- Command-line versions in `tools/*/*/cli/`

## Out of scope

- Denial of service by giving a tool a huge or malicious file on your own device (it only affects you), unless it escapes the browser tab
- Missing headers that have no demonstrated impact
- Vulnerabilities in browsers or in upstream projects (report those upstream; tell us if we need to update)
- Social engineering, and physical attacks

## Safe harbour

We won't pursue legal action against research done in good faith that follows this policy: stay in scope, don't access other people's data, don't degrade the service, and give us reasonable time to fix before disclosing.

## How deploys are protected

- The site is built and deployed by Cloudflare Workers Builds from the `main` branch. No Cloudflare credentials are stored in GitHub, so workflows, forks and contributors have nothing to leak.
- Nothing reaches `main` without passing checks and a maintainer review (branch protection with code owners).
- GitHub Actions are pinned to full commit hashes and run with read-only permissions.

## Supported versions

Only the current site (the `main` branch) is supported. There are no older releases to patch.
