# VINI browser workflow helper

VINI is a small, dependency-free JavaScript helper for defining and advancing
multi-step browser workflows. It manages state, step payloads, progress, and a
bounded local execution log. It does not render workflow UI and it does not
provide a server, ATP client, authentication layer, authorization layer, or
transaction engine.

VINI is primarily a **browser asset**. Stenella serves this directory's
`vini.js` directly; there is no build step and no Node.js server runtime.

## Browser use

Load the script before application code that uses it. A `defer` script executes
after the document has been parsed and before `DOMContentLoaded`:

```html
<script src="/s/static/lib/vini.js" defer></script>
<script src="/app.js" defer></script>
```

The script exposes two browser globals:

- `window.vini` — the shared workflow manager used by most applications.
- `window.Vini` — the constructor for an isolated manager with its own
  listeners. Workflows still use the same browser-origin storage key.

The existing CommonJS export (`require("./vini.js").Vini`) is retained for
tests and tooling only. VINI does not turn JavaScript browser state into a
server-side or durable workflow service.

## Basic example

```html
<form id="profile-form">
  <label>Email <input id="email" type="email" required></label>
  <button type="submit">Continue</button>
</form>
<pre id="workflow-status" aria-live="polite"></pre>

<script src="/s/static/lib/vini.js" defer></script>
<script defer>
  const workflow = vini.define("profile", {
    steps: [
      {
        id: "email",
        title: "Confirm your email",
        validate(data) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "");
        }
      },
      { id: "review", title: "Review the profile" }
    ]
  });

  vini.on("step", (event) => {
    const current = event.detail.workflow;
    const step = event.detail.step;
    document.querySelector("#workflow-status").textContent = step
      ? `${current.current + 1}/${current.steps.length}: ${step.title}`
      : "Workflow complete";
  });

  vini.on("error", (event) => {
    console.warn(event.detail.error.message);
  });

  document.querySelector("#profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    vini.continue(workflow.id, {
      email: document.querySelector("#email").value
    });
  });

  vini.start(workflow.id);
</script>
```

`define()`, `start()`, and the other lifecycle methods are synchronous. They
return workflow objects; they are not Promises.

## Defining and inspecting workflows

```javascript
const workflow = vini.define("checkout", {
  id: "checkout-v1",       // optional; defaults to a generated slug + suffix
  label: "Checkout",
  steps: [
    {
      id: "contact",       // defaults to the numeric step index
      title: "Contact",    // defaults to the one-based step number
      action: "collect",   // metadata only; VINI does not execute it
      validate(data) {     // synchronous; false or a throw rejects the step
        return Boolean(data.email);
      }
    },
    { id: "review", title: "Review" }
  ]
});

vini.get(workflow.id);       // workflow or null
vini.getWorkflow(workflow.id); // compatibility alias
vini.list();                // newest-created workflow first
vini.remove(workflow.id);   // true when a workflow was removed
```

A persisted or returned workflow has this general shape:

```javascript
{
  id: "checkout-v1",
  name: "checkout",
  label: "Checkout",
  status: "running", // defined | running | paused | done | ended
  steps: [
    {
      id: "contact",
      title: "Contact",
      action: "collect",
      validate: null,       // functions are runtime-only
      data: { email: "ada@example.test" },
      completed_at: "2026-09-25T12:00:00.000Z"
    }
  ],
  current: 1,
  progress: 50,
  data: {},
  created: "...",
  updated: "...",
  start_time: "...",
  end_time: "...",
  log: [{ at: "...", level: "info", message: "completed step contact" }]
}
```

`define()` with an existing explicit ID replaces that workflow definition. This
is useful when an application wants a fresh definition at page initialization;
use a versioned ID when old and new definitions must coexist.

## Lifecycle

| Method | Behavior |
| --- | --- |
| `vini.start(id, data?)` | Start a defined, paused, done, or ended workflow. A running workflow is returned unchanged. Starting resets step payloads/completion times and workflow data. |
| `vini.continue(id, data?)` | Validate and complete the current step, then advance. It is a no-op unless status is `running`. |
| `vini.complete(id)` | Mark the workflow `done`, set progress to 100, and emit `complete`. |
| `vini.pause(id)` | Change a running workflow to `paused`. Other statuses are unchanged. |
| `vini.resume(id)` | Change a paused workflow to `running`. Other statuses are unchanged. |
| `vini.end(id)` | Mark the workflow `ended` rather than successfully `done`. |
| `vini.remove(id)` | Remove a workflow from memory and local storage. |

An empty workflow emits `start`, `step` with a `null` step, and then `complete`
during `start()`. Completing the last normal step emits `continue`, `step` with
a `null` step, and then `complete`.

Validation is synchronous. A false result or thrown value leaves the current
step and its data unchanged and emits `error`. Promise-returning validators are
not supported; their Promise object would be treated as a truthy result.

## Events and listeners

By default, lifecycle methods dispatch bubbling `CustomEvent`s on `document`:

| Event | `detail.step` |
| --- | --- |
| `vini:start` | First step, or `null` for an empty workflow |
| `vini:step` | Current/next step, or `null` after the final step |
| `vini:continue` | Next step, or `null` after the final step |
| `vini:error` | Step whose validator failed or threw |
| `vini:complete` | `null` |
| `vini:pause` | Current step |
| `vini:resume` | Current step |
| `vini:end` | Current step |

Every event has:

```javascript
event.detail = {
  workflowId: workflow.id,
  workflow, // live workflow object
  step
};
```

`vini:error` additionally has `detail.error`, an `Error` object. For compatibility
with early consumers, VINI also exposes the workflow fields (`id`, `steps`,
`current`, `status`, and so on) directly on the event passed to `on()`.
Application code should prefer `event.detail`.

Listeners can be removed, and a separately constructed manager can release its
callbacks and cross-tab storage listener:

```javascript
const handler = (event) => console.log(event.type);
vini.on("step", handler);
vini.on(handler);       // shorthand: receive every supported event
vini.off("step", handler);
vini.off(handler);      // remove from every event list
vini.destroy();
```

Listener exceptions are intentionally isolated so one callback cannot interrupt
workflow persistence or later callbacks. A custom manager can namespace DOM
events:

```javascript
const checkout = new Vini({ eventPrefix: "checkout", storage: window.localStorage });
// dispatches checkout:start, checkout:step, ...
```

A custom `storage` object implementing `getItem` and `setItem` is useful for
isolated tests. Passing `null` creates a memory-only manager.

## Persistence and cross-tab updates

VINI serializes its state to the origin-wide `vini_workflows` local-storage key.
It caps each workflow log at 500 entries. A `storage` event for that key reloads
the manager's in-memory state, so separate tabs eventually see one another's
changes. Array-form records from the early implementation are migrated to the
current keyed object form on load.

Important limitations:

- Storage can be unavailable, full, or blocked. VINI then continues in memory;
  callers cannot assume a successful disk write.
- Workflow data and step payloads are stored as **plain JSON**. Do not put
  secrets, credentials, payment data, or regulated data in a workflow unless
  the application encrypts sensitive values before calling VINI.
- Executable validators cannot be serialized and are absent after a page
  reload. Redefine or reattach them before continuing a restored workflow.
- VINI does not merge concurrent in-memory changes. Treat workflows as local UI
  coordination, not a distributed consistency mechanism.
- Public workflow objects and event details are live references. Mutating them
  directly bypasses persistence and lifecycle checks.

## Optional VICI encryption delegation

If the VICI browser helper is already loaded, these methods delegate to its
Web Crypto implementation:

```javascript
const payload = await vini.encryptData("secret", passphrase);
const plaintext = await vini.decryptData(payload, passphrase);
```

VICI is not bundled by VINI. Without it, `encryptData()` deliberately returns:

```javascript
{ plain: "secret", method: "none" }
```

This fallback is a compatibility envelope, **not encryption**. Applications
must not persist or transmit it as though the payload were protected. See
[SECURITY.md](SECURITY.md).

## Optional standard-library Go demo

The repository includes a small static demo server. It is useful for exercising
the browser asset outside Stenella; it is not required to embed VINI and does
not turn local workflows into a server API.

```bash
go run .
# open http://127.0.0.1:8088
```

Configuration:

- `VINI_HOST` — listen host, default `127.0.0.1`.
- `VINI_PORT` — listen port, default `8088`.

The demo serves only the page, `vini.js`, and its own CSS/JavaScript. It has no
accounts, persistence backend, TLS, or authorization. The container binds all
interfaces internally for publishing; publish port 8088 to host loopback only
unless a separate network policy is in place.

## Tests and checks

The JavaScript tests use Node's built-in test runner only as a development test
harness with a small browser-environment stub. They do not add a Node runtime
or server dependency.

```bash
npm test
# or: node --test vini_test.js
```

The Go demo and its handlers are tested with the Go standard library:

```bash
go test ./...
```

The browser helper uses ES2017 JavaScript (`class`, `Promise`, and `async`).
It has a `document.createEvent("CustomEvent")` fallback for browsers where the
`CustomEvent` constructor is unavailable.

## License

MIT. See [LICENSE](LICENSE).
