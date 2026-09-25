"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const path = require("node:path");

class MemoryStorage {
  constructor(initial) {
    this.values = new Map(Object.entries(initial || {}));
    this.setCalls = 0;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.setCalls += 1;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class BrowserTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    const index = callbacks.indexOf(callback);
    if (index !== -1) callbacks.splice(index, 1);
  }

  dispatch(type, event) {
    (this.listeners.get(type) || []).slice().forEach((callback) => callback(event));
  }
}

class BrowserDocument extends BrowserTarget {
  dispatchEvent(event) {
    event.target = this;
    this.dispatch(event.type, event);
    return true;
  }

  createEvent(type) {
    assert.equal(type, "CustomEvent");
    return {
      initCustomEvent(name, bubbles, cancelable, detail) {
        this.type = name;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.detail = detail;
      }
    };
  }
}

class BrowserCustomEvent {
  constructor(type, options) {
    this.type = type;
    this.bubbles = Boolean(options && options.bubbles);
    this.cancelable = Boolean(options && options.cancelable);
    this.detail = options && options.detail;
  }
}

const modulePath = path.join(__dirname, "vini.js");
const originalGlobals = {};
const globalNames = ["window", "document", "CustomEvent"];
let storage;
let windowTarget;
let documentTarget;

function loadLibrary() {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

beforeEach(() => {
  globalNames.forEach((name) => { originalGlobals[name] = global[name]; });
  storage = new MemoryStorage();
  windowTarget = new BrowserTarget();
  documentTarget = new BrowserDocument();
  global.window = windowTarget;
  windowTarget.localStorage = storage;
  windowTarget.addEventListener = windowTarget.addEventListener.bind(windowTarget);
  windowTarget.removeEventListener = windowTarget.removeEventListener.bind(windowTarget);
  global.document = documentTarget;
  global.CustomEvent = BrowserCustomEvent;
});

afterEach(() => {
  globalNames.forEach((name) => {
    if (originalGlobals[name] === undefined) delete global[name];
    else global[name] = originalGlobals[name];
  });
  delete require.cache[require.resolve(modulePath)];
});

test("runs a workflow and emits ordered lifecycle events", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const events = [];
  vini.on((event) => events.push(event));

  const workflow = vini.define("Order", {
    steps: [
      { id: "details", title: "Details" },
      { id: "confirm", title: "Confirm" }
    ]
  });

  assert.equal(vini.start(workflow.id, { cart: 2 }).status, "running");
  assert.equal(vini.continue(workflow.id, { email: "ada@example.test" }).current, 1);
  const completed = vini.continue(workflow.id, { confirmed: true });

  assert.equal(completed.status, "done");
  assert.equal(completed.progress, 100);
  assert.equal(completed.steps[0].data.email, "ada@example.test");
  assert.ok(completed.steps[1].completed_at);
  assert.deepEqual(events.map((event) => event.type), [
    "vini:start",
    "vini:step",
    "vini:continue",
    "vini:step",
    "vini:continue",
    "vini:step",
    "vini:complete"
  ]);
  assert.equal(events[0].detail.workflow.id, workflow.id);
  assert.equal(events[0].workflowId, workflow.id);
  assert.equal(events[0].current, 0);
  assert.deepEqual(events[0].steps, workflow.steps);
});

test("pause and resume are idempotent and ignore continue while paused", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const workflow = vini.define("Pauseable", { steps: [{ id: "one" }] });
  const seen = [];
  vini.on("pause", (event) => seen.push(event.type));
  vini.on("resume", (event) => seen.push(event.type));

  vini.start(workflow.id);
  assert.equal(vini.pause(workflow.id).status, "paused");
  assert.equal(vini.pause(workflow.id).status, "paused");
  assert.equal(vini.continue(workflow.id).current, 0);
  assert.equal(vini.resume(workflow.id).status, "running");
  assert.equal(vini.resume(workflow.id).status, "running");
  assert.deepEqual(seen, ["vini:pause", "vini:resume"]);
});

test("starting a terminal workflow clears the previous step run", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const workflow = vini.define("Restartable", { steps: [{ id: "one" }] });

  vini.start(workflow.id);
  vini.continue(workflow.id, { old: true });
  const restarted = vini.start(workflow.id, { fresh: true });

  assert.equal(restarted.status, "running");
  assert.equal(restarted.current, 0);
  assert.equal(restarted.progress, 0);
  assert.equal(restarted.steps[0].data, null);
  assert.equal(restarted.steps[0].completed_at, null);
  assert.equal(restarted.end_time, undefined);
  assert.deepEqual(restarted.data, { fresh: true });
});

test("an empty workflow completes during start", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const workflow = vini.define("Empty", { steps: [] });
  const seen = [];
  vini.on((event) => seen.push(event.type));

  const started = vini.start(workflow.id);

  assert.equal(started.status, "done");
  assert.equal(started.progress, 100);
  assert.deepEqual(seen, ["vini:start", "vini:step", "vini:complete"]);
});

test("false and thrown validation errors keep the current step", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const workflow = vini.define("Validated", {
    steps: [{ id: "email", validate: (data) => Boolean(data.valid) }]
  });
  const errors = [];
  vini.on("error", (event) => errors.push(event));

  vini.start(workflow.id);
  vini.continue(workflow.id, { valid: false });
  workflow.steps[0].validate = () => { throw new Error("validator exploded"); };
  const afterThrow = vini.continue(workflow.id, { valid: true });

  assert.equal(afterThrow.current, 0);
  assert.equal(afterThrow.steps[0].data, null);
  assert.equal(afterThrow.steps[0].completed_at, null);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].detail.error.message, "validation failed on step email");
  assert.equal(errors[1].detail.error.message, "validator exploded");
  assert.equal(errors[1].step.id, "email");
});

test("persists, removes, and migrates an array-form storage record", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  const workflow = vini.define("Saved", {
    steps: [{ id: "one", validate: () => true }]
  });
  vini.start(workflow.id, { total: 3 });

  const reloaded = new Vini({ storage });
  assert.equal(reloaded.get(workflow.id).data.total, 3);
  // JSON cannot preserve executable validators; this is intentional and documented.
  assert.equal(reloaded.get(workflow.id).steps[0].validate, undefined);
  assert.equal(reloaded.remove(workflow.id), true);
  assert.equal(reloaded.remove(workflow.id), false);

  storage.values.set("vini_workflows", JSON.stringify([{
    id: "legacy",
    name: "Legacy",
    steps: [{ id: "one" }],
    current: 1,
    progress: 100,
    data: { ok: true },
    log: [],
    status: "done",
    created: "2026-01-01T00:00:00.000Z"
  }]));
  const migrated = new Vini({ storage });
  assert.equal(migrated.get("legacy").data.ok, true);
  assert.equal(migrated.list().length, 1);
});

test("storage events refresh this instance and destroy releases its listener", () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  storage.values.set("vini_workflows", JSON.stringify({
    external: {
      id: "external",
      name: "External",
      steps: [],
      current: 0,
      progress: 0,
      data: {},
      log: [],
      status: "defined"
    }
  }));
  windowTarget.dispatch("storage", { key: "vini_workflows" });
  assert.equal(vini.get("external").name, "External");

  vini.destroy();
  storage.values.set("vini_workflows", "{}");
  windowTarget.dispatch("storage", { key: "vini_workflows" });
  assert.equal(vini.get("external").name, "External");
});

test("off, listener isolation, custom prefixes, and legacy CustomEvent work", () => {
  const { Vini } = loadLibrary();
  delete global.CustomEvent;
  const vini = new Vini({ storage, eventPrefix: "checkout" });
  const seen = [];
  const first = (event) => {
    seen.push(event.type);
    throw new Error("listener failures stay isolated");
  };
  const second = (event) => seen.push("second:" + event.type);
  vini.on(first);
  vini.on("start", second);

  const workflow = vini.define("Prefix", { steps: [] });
  vini.start(workflow.id);
  vini.off("start", second);
  vini.start(workflow.id);

  assert.deepEqual(seen, [
    "checkout:start",
    "second:checkout:start",
    "checkout:step",
    "checkout:complete",
    "checkout:start",
    "checkout:step",
    "checkout:complete"
  ]);
});

test("local listeners still work without a document", () => {
  const { Vini } = loadLibrary();
  delete global.document;
  const vini = new Vini({ storage });
  const types = [];
  vini.on("start", (event) => types.push(event.type));
  const workflow = vini.define("No DOM", { steps: [] });

  vini.start(workflow.id);
  assert.deepEqual(types, ["vini:start"]);
});

test("encryption helpers delegate to VICI and label the fallback honestly", async () => {
  const { Vini } = loadLibrary();
  const vini = new Vini({ storage });
  windowTarget.vici = {
    encrypt: async (plaintext, passphrase) => "encrypted:" + plaintext + ":" + passphrase,
    decrypt: async (payload, passphrase) => payload.replace(":", ":" + passphrase)
  };

  assert.equal(await vini.encryptData("secret", "key"), "encrypted:secret:key");
  assert.equal(await vini.decryptData("encrypted:value", "key"), "encrypted:keyvalue");

  delete windowTarget.vici;
  const fallback = await vini.encryptData("secret", "unused");
  assert.deepEqual(fallback, { plain: "secret", method: "none" });
  assert.equal(await vini.decryptData(fallback, "unused"), "secret");
});
