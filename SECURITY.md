# VINI security notes

## Scope and trust boundary

VINI has two separate pieces:

1. `vini.js`, a browser-local workflow coordinator; and
2. an optional standard-library Go server that serves a static demo.

Neither piece is a security boundary, workflow authorization service, or
durable transaction system. Browser JavaScript runs with the same privileges as
the page that loaded it. Code, step metadata, validators, and event handlers
supplied by an application must therefore be trusted to the same degree as the
application itself.

VINI does **not** implement accounts, roles, permissions, CSRF protection,
server-side workflow validation, audit attestation, conflict resolution, or
sandboxing. There are no ATP, VICI, VIDI, or VENI network calls. Integrations
must be implemented and secured by the embedding application.

## Browser workflow data

Workflow state, step payloads, and execution logs are serialized as plain JSON
under the origin-wide `vini_workflows` local-storage key.

- Anyone with access to the browser profile or origin can inspect that data.
- Browser extensions, injected scripts, XSS, and same-origin compromise can read
  or modify workflow state and execute validators.
- Local storage is not encrypted, integrity protected, access controlled, or
  suitable as a tamper-evident audit log.
- Storage failure is handled as memory-only operation. Applications that need a
  durability guarantee must persist and authorize data through a server.
- The 500-entry workflow log limit bounds growth but does not make the log
  tamper-resistant or suitable for regulated audit evidence.

Do not place passwords, access tokens, private keys, payment details, medical
data, or other secrets in `workflow.data` or `step.data`. The execution log
contains step IDs and lifecycle messages and should not be treated as a secret
store either.

If an application needs durable or sensitive state, it should store a small,
non-sensitive workflow reference in VINI and keep authoritative records behind
an authenticated server API with server-side validation, authorization,
transaction boundaries, and an appropriate audit design.

## Validation

Step validators run synchronously in the page with page privileges. A validator
can read cookies, call APIs available to the origin, mutate the workflow, or run
arbitrary code. Its return value is useful for local UX only.

- A false result or exception prevents the current step from advancing.
- A truthy Promise is not an awaited validation result and must not be used.
- Local validation can be bypassed by modifying JavaScript or local storage.
- Security-sensitive decisions must be repeated and enforced by the server.
- `action` is descriptive metadata; VINI never executes it.

Errors thrown by a validator are converted to event/log data. Avoid placing
credentials or sensitive payloads in exception messages.

## Events and callbacks

VINI dispatches bubbling DOM events with the live workflow object in
`event.detail.workflow`. Other same-page code can therefore observe and mutate
workflows. Treat event handlers as trusted application code and avoid exposing
VINI on pages that accept untrusted script.

DOM event delivery is not an integrity mechanism. Do not use an event listener
as proof that a privileged action was authorized or completed. Keep privileged
work on a server that independently checks identity, authorization, CSRF state,
and request validity.

Listener exceptions are isolated to protect lifecycle execution, but this is
only fault containment, not isolation or recovery.

## Encryption helpers

VINI does not bundle an encryption implementation. If `window.vici` exposes
`encrypt` and `decrypt`, the helper methods delegate to it. The referenced VICI
implementation is responsible for key derivation, authenticated encryption, and
its own operational security.

Without VICI, `encryptData()` returns:

```javascript
{ plain: String(plaintext), method: "none" }
```

This is explicitly plaintext compatibility data. It provides no
confidentiality, integrity, authentication, or protection against tampering.
Never treat `method: "none"` as ciphertext or send it to an untrusted party.

Passphrases and plaintext are held in page memory while helper code runs. Avoid
long-lived secrets in browser workflow code. Browser encryption cannot protect
content from scripts executing in the same origin.

## Cross-tab and manual mutation risks

VINI responds to same-origin `storage` changes by reloading its in-memory
snapshot. It does not lock, merge, or reconcile simultaneous writes. Last-write-
wins behavior and page-local validators must not be used for financial,
inventory, identity, or other authoritative decisions.

The constructor and methods return live mutable objects for compatibility.
Direct mutation is not logged and is not automatically persisted. Prefer the
lifecycle API, and validate any object before passing it to a server.

## Go demo server

The Go server is a local development/demo convenience, not a production
workflow backend.

- It binds to `127.0.0.1:8088` by default.
- It serves only embedded static files and accepts `GET`/`HEAD` requests.
- It sends a restrictive Content Security Policy and anti-sniffing/referrer
  headers.
- It performs no authentication, authorization, rate limiting, CSRF checks, or
  TLS termination.
- Its workflow state remains entirely in the browser; the server never receives
  or validates it.

The Docker image sets `VINI_HOST=0.0.0.0` so a published port can work inside a
container. Publish that port to host loopback only. The image runs as an
unprivileged user and requires no writable application files, but it is still
not hardened as an Internet-facing application.

## Reporting a suspected vulnerability

Report suspected vulnerabilities privately to the project maintainers rather
than putting credentials, sensitive payloads, or exploit details in a public
issue. Include the affected file, a minimal browser reproduction, and the
deployment assumptions. Distinguish clearly between a browser workflow UX
issue and a claim that a server-authorized action was bypassed.
