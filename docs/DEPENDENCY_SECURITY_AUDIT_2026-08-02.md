# Dependency Security Audit - 2026-08-02

## Result

`npm audit` reports 8 high-severity package nodes grouped into two production-runtime dependency chains. No `--force` or major-version upgrade was applied.

The compatible `npm audit fix` updated `fast-uri` from 2.4.3 to 2.4.4. All remaining automatic remediations require breaking framework upgrades.

## Classification

| Priority | Chain | Reachability | Decision |
| --- | --- | --- | --- |
| P0 | `next@14.2.35` and bundled `postcss` | Direct web runtime; advisories include server-component denial of service, SSRF, request smuggling, cache issues, and parser/file disclosure | Upgrade in an isolated Next 16 compatibility branch before any public deployment |
| P0 | `fastify@4.29.1` and `find-my-way` | Direct API runtime; request validation and HTTP routing process untrusted requests | Upgrade in an isolated Fastify 5 compatibility branch before any public deployment |
| P1 | `@fastify/ajv-compiler`, `@fastify/fast-json-stringify-compiler`, `fast-json-stringify`, `fast-uri` | Transitive API schema and serialization path | Resolve with the Fastify 5 upgrade; compatible `fast-uri@2.4.4` patch already applied |

## Current Exposure

ProspectPilot currently runs on localhost and is not bound to a public domain. This reduces current remote exposure but does not make the advisories acceptable for a public SaaS deployment.

Until the framework upgrade passes:

- Keep web and API services local or behind a trusted private network.
- Do not configure untrusted Next.js image hosts, rewrites, middleware destinations, or custom WebSocket upgrade handling.
- Keep reverse-proxy host/protocol trust disabled unless a trusted proxy is explicitly configured.
- Preserve API body limits, validation schemas, attachment restrictions, and request-rate controls.

## Upgrade Gates

For each framework upgrade:

```text
npm ci
npm run typecheck
npm test -- --run
npm run build
local API and browser acceptance
Gmail send/reply regression
attachment and suppression regression
```

Do not run `npm audit fix --force` on the active communication release. Fastify 5 and Next 16 should be upgraded and accepted independently so any routing, rendering, plugin, or React compatibility regression remains attributable.
