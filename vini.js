"use strict";

/**
 * vini — small, browser-local workflow and data-passing manager.
 *
 * Define multi-step workflows and run them through start/continue/complete/
 * pause/resume/end. Workflow state and a bounded execution log are persisted
 * in localStorage under "vini_workflows" when storage is available.
 *
 * Lifecycle CustomEvents are dispatched on document:
 *
 *   vini:start  vini:continue  vini:complete  vini:pause
 *   vini:resume vini:end       vini:step      vini:error
 *
 * Every event has detail { workflowId, workflow, step } and error events also
 * have detail.error. The on() callback receives that same Event object. For
 * compatibility with early consumers, workflow fields such as current and
 * steps are also exposed directly on the callback Event.
 *
 * encryptData/decryptData delegate to window.vici when it is present. Their
 * fallback is explicitly marked method:"none"; VINI never claims that this
 * fallback is encryption.
 *
 * Browser globals: window.vini (shared instance) and window.Vini (constructor).
 * There is no build step, external dependency, server API, or Node runtime.
 */

(function () {
  "use strict";

  var STORAGE_KEY = "vini_workflows";
  var EVENTS = ["start", "continue", "complete", "pause", "resume", "end", "step", "error"];
  var STATUSES = ["defined", "running", "paused", "done", "ended"];
  var hasOwn = Object.prototype.hasOwnProperty;

  function defaultStorage() {
    try {
      if (typeof window !== "undefined" && window && window.localStorage) {
        return window.localStorage;
      }
    } catch (e) {
      /* Access to storage can be denied by browser policy. */
    }
    try {
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (e) {
      /* Fall back to memory-only operation. */
    }
    return null;
  }

  function normalizeState(value) {
    var state = {};
    if (!value || typeof value !== "object") return state;

    var keys = Array.isArray(value) ? null : Object.keys(value);
    var count = keys ? keys.length : value.length;
    for (var i = 0; i < count; i++) {
      var key = keys ? keys[i] : null;
      var workflow = keys ? value[key] : value[i];
      if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) continue;
      if (workflow.id == null) continue;

      workflow.id = String(workflow.id);
      if (!keys) key = workflow.id;
      if (!key) continue;
      if (!Array.isArray(workflow.steps)) workflow.steps = [];
      if (!workflow.data || typeof workflow.data !== "object" || Array.isArray(workflow.data)) {
        workflow.data = {};
      }
      if (!Array.isArray(workflow.log)) workflow.log = [];

      workflow.current = Number(workflow.current);
      if (!isFinite(workflow.current) || workflow.current < 0) workflow.current = 0;
      workflow.current = Math.min(Math.floor(workflow.current), workflow.steps.length);
      workflow.progress = Number(workflow.progress);
      if (!isFinite(workflow.progress)) workflow.progress = 0;
      workflow.progress = Math.max(0, Math.min(100, workflow.progress));
      if (STATUSES.indexOf(workflow.status) === -1) workflow.status = "defined";

      // defineProperty avoids triggering Object.prototype's __proto__ setter
      // if a corrupted or manually edited storage record uses that key.
      Object.defineProperty(state, key, {
        value: workflow,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return state;
  }

  function loadState(storage) {
    if (!storage || typeof storage.getItem !== "function") return {};
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return normalizeState(JSON.parse(raw));
    } catch (e) {
      return {};
    }
  }

  function saveState(storage, state) {
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      // Quota, privacy-mode, serialization, and blocked-storage failures must
      // not break the in-memory workflow.
      return false;
    }
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
      var bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (value) {
        return ("0" + value.toString(16)).slice(-2);
      }).join("");
    }
    // This fallback is for compatibility only; generated IDs are not secrets.
    return "wf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function copyObject(value) {
    if (Object.assign) return Object.assign({}, value || {});
    var out = {};
    if (value == null) return out;
    var source = Object(value);
    Object.keys(source).forEach(function (key) { out[key] = source[key]; });
    return out;
  }

  function setWorkflow(state, workflow) {
    Object.defineProperty(state, workflow.id, {
      value: workflow,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function createEvent(name, detail) {
    if (typeof CustomEvent !== "undefined") {
      try {
        return new CustomEvent(name, {
          detail: detail,
          bubbles: true,
          cancelable: false
        });
      } catch (e) {
        /* Fall through to the legacy DOM constructor. */
      }
    }
    if (typeof document !== "undefined" && document && typeof document.createEvent === "function") {
      try {
        var legacy = document.createEvent("CustomEvent");
        legacy.initCustomEvent(name, true, false, detail);
        return legacy;
      } catch (e) {
        /* Fall through to a plain event-like object. */
      }
    }
    return {
      type: name,
      detail: detail,
      bubbles: true,
      cancelable: false
    };
  }

  class Vini {
    constructor(opts) {
      opts = opts || {};
      this.state = loadState(hasOwn.call(opts, "storage") ? opts.storage : defaultStorage());
      this.listener = null; // retained for compatibility with early consumers
      this._listeners = {};
      this._destroyed = false;
      EVENTS.forEach(function (eventName) { this._listeners[eventName] = []; }, this);

      this.prefix = String(opts.eventPrefix || "vini").replace(/[^a-zA-Z0-9_-]+/g, "") || "vini";
      this.storage = hasOwn.call(opts, "storage") ? opts.storage : defaultStorage();

      this._onStorage = function (event) {
        if (!event || event.key === null || event.key === STORAGE_KEY) {
          this.state = loadState(this.storage);
        }
      }.bind(this);

      try {
        if (typeof window !== "undefined" && window && typeof window.addEventListener === "function") {
          window.addEventListener("storage", this._onStorage);
        }
      } catch (e) {
        /* Storage synchronization is optional. */
      }
    }

    _workflow(id) {
      if (id == null || !hasOwn.call(this.state, String(id))) return null;
      return this.state[String(id)];
    }

    _eventName(eventName) {
      var prefix = this.prefix + ":";
      if (eventName.indexOf(prefix) === 0) eventName = eventName.slice(prefix.length);
      return EVENTS.indexOf(eventName) === -1 ? null : eventName;
    }

    _normalizeEventName(eventName) {
      return typeof eventName === "string" ? this._eventName(eventName) : null;
    }

    /** Subscribe to a short name (start), a full name (vini:start), or all events. */
    on(eventName, callback) {
      if (typeof eventName === "function") {
        var allCallback = eventName;
        this.listener = allCallback;
        EVENTS.forEach(function (name) { this._listeners[name].push(allCallback); }, this);
        return this;
      }

      var name = this._normalizeEventName(eventName);
      if (!name || typeof callback !== "function") return this;
      this._listeners[name].push(callback);
      return this;
    }

    /** Remove one callback from an event, or from every event when omitted. */
    off(eventName, callback) {
      if (typeof eventName === "function") {
        var allCallback = eventName;
        EVENTS.forEach(function (name) {
          var list = this._listeners[name];
          for (var i = list.length - 1; i >= 0; i--) {
            if (list[i] === allCallback) list.splice(i, 1);
          }
        }, this);
        if (this.listener === allCallback) this.listener = null;
        return this;
      }

      var name = this._normalizeEventName(eventName);
      if (!name || typeof callback !== "function") return this;
      var listeners = this._listeners[name];
      for (var i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i] === callback) listeners.splice(i, 1);
      }
      return this;
    }

    /** Release callbacks and the cross-tab storage listener. */
    destroy() {
      if (this._destroyed) return this;
      this._destroyed = true;
      EVENTS.forEach(function (name) { this._listeners[name] = []; }, this);
      this.listener = null;
      try {
        if (typeof window !== "undefined" && window && typeof window.removeEventListener === "function") {
          window.removeEventListener("storage", this._onStorage);
        }
      } catch (e) {
        /* Nothing else to release. */
      }
      return this;
    }

    _notify(eventName, event) {
      this._listeners[eventName].slice().forEach(function (callback) {
        try { callback(event); } catch (e) { /* A listener must not break lifecycle execution. */ }
      });
    }

    _decorateEvent(event, workflow, step, error) {
      if (!event) return event;

      // Keep Event/detail semantics while allowing old consumers that treated
      // the callback argument as a workflow to continue to work.
      try {
        Object.keys(workflow).forEach(function (key) {
          if (key === "type" || key === "target" || key === "detail" || key in event) return;
          try {
            Object.defineProperty(event, key, {
              value: workflow[key],
              enumerable: true,
              configurable: true
            });
          } catch (e) {
            /* Non-extensible Event implementations still have detail. */
          }
        });
        if (!hasOwn.call(event, "workflow")) event.workflow = workflow;
        if (!hasOwn.call(event, "workflowId")) event.workflowId = workflow.id;
        if (!hasOwn.call(event, "step")) event.step = step || null;
        if (arguments.length > 3 && !hasOwn.call(event, "error")) event.error = error || null;
      } catch (e) {
        /* detail is the portable event contract. */
      }
      return event;
    }

    _emit(type, workflow, step, error) {
      var detail = {
        workflowId: workflow.id,
        workflow: workflow,
        step: step || null
      };
      if (arguments.length > 3) detail.error = error || null;

      var event = createEvent(this.prefix + ":" + type, detail);
      event = arguments.length > 3
        ? this._decorateEvent(event, workflow, step || null, error)
        : this._decorateEvent(event, workflow, step || null);

      if (typeof document !== "undefined" && document && typeof document.dispatchEvent === "function") {
        try { document.dispatchEvent(event); } catch (e) { /* Still notify local listeners. */ }
      }
      this._notify(type, event);
      return event;
    }

    _log(workflow, level, message) {
      workflow.log = workflow.log || [];
      workflow.log.push({ at: nowISO(), level: level, message: message });
      if (workflow.log.length > 500) workflow.log = workflow.log.slice(-500);
    }

    _persist() {
      return saveState(this.storage, this.state);
    }

    _touch(workflow) {
      workflow.updated = nowISO();
      setWorkflow(this.state, workflow);
    }

    /**
     * Define a workflow. Steps accept { id, title, action, validate(data) }.
     * Validation is synchronous. The returned workflow is stored synchronously.
     */
    define(name, opts) {
      opts = opts || {};
      if (!name) name = "workflow-" + uuid();
      name = String(name);

      var sourceSteps = Array.isArray(opts.steps) ? opts.steps : [];
      var steps = sourceSteps.map(function (step, index) {
        step = step || {};
        return {
          id: step.id == null || step.id === "" ? String(index) : String(step.id),
          title: step.title == null || step.title === "" ? String(index + 1) : String(step.title),
          action: step.action || "",
          validate: typeof step.validate === "function" ? step.validate : null,
          data: null,
          completed_at: null
        };
      });

      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow";
      var id = opts.id ? String(opts.id) : slug + "-" + uuid().slice(0, 6);
      var created = nowISO();
      var workflow = {
        id: id,
        name: name,
        label: opts.label == null || opts.label === "" ? name : String(opts.label),
        status: "defined",
        steps: steps,
        current: 0,
        progress: 0,
        data: {},
        created: created,
        updated: created,
        log: []
      };
      setWorkflow(this.state, workflow);
      this._persist();
      return workflow;
    }

    get(id) {
      return this._workflow(id);
    }

    getWorkflow(id) {
      return this.get(id);
    }

    list() {
      var workflows = [];
      var state = this.state;
      Object.keys(state).forEach(function (id) {
        if (state[id] && typeof state[id] === "object") workflows.push(state[id]);
      });
      return workflows.sort(function (a, b) {
        if (a.created === b.created) return 0;
        if (!a.created) return 1;
        if (!b.created) return -1;
        return a.created < b.created ? 1 : -1;
      });
    }

    remove(id) {
      if (!this._workflow(id)) return false;
      delete this.state[String(id)];
      this._persist();
      return true;
    }

    start(id, data) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status === "running") return workflow;

      workflow.status = "running";
      workflow.start_time = nowISO();
      delete workflow.end_time;
      workflow.current = 0;
      workflow.data = copyObject(data);
      workflow.progress = workflow.steps.length ? 0 : 100;
      workflow.steps.forEach(function (step) {
        step.data = null;
        step.completed_at = null;
      });
      this._log(workflow, "info", "workflow started");
      this._touch(workflow);
      this._persist();
      this._emit("start", workflow, workflow.steps[0] || null);
      this._emit("step", workflow, workflow.steps[0] || null);

      // An empty workflow has no work to continue and is immediately complete.
      if (!workflow.steps.length) this.complete(workflow.id);
      return workflow;
    }

    /** Validate and complete the current step, then advance. */
    continue(id, stepData) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status !== "running") return workflow;

      var index = workflow.current;
      var step = workflow.steps[index];
      if (step) {
        if (typeof step.validate === "function") {
          try {
            if (!step.validate(copyObject(stepData))) {
              var validationError = new Error("validation failed on step " + step.id);
              this._log(workflow, "error", validationError.message);
              this._touch(workflow);
              this._persist();
              this._emit("error", workflow, step, validationError);
              return workflow;
            }
          } catch (error) {
            var thrown = error instanceof Error ? error : new Error(String(error));
            this._log(workflow, "error", "validation threw on step " + step.id + ": " + thrown.message);
            this._touch(workflow);
            this._persist();
            this._emit("error", workflow, step, thrown);
            return workflow;
          }
        }

        step.data = copyObject(stepData);
        step.completed_at = nowISO();
        this._log(workflow, "info", "completed step " + step.id);
      }

      workflow.current = index + 1;
      var next = workflow.steps[workflow.current] || null;
      workflow.progress = workflow.steps.length
        ? Math.round((workflow.current / workflow.steps.length) * 100)
        : 100;
      this._touch(workflow);
      this._persist();
      this._emit("continue", workflow, next);
      this._emit("step", workflow, next);
      if (workflow.current >= workflow.steps.length) this.complete(workflow.id);
      return workflow;
    }

    complete(id) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status === "done") return workflow;
      workflow.status = "done";
      workflow.progress = 100;
      workflow.end_time = nowISO();
      this._log(workflow, "info", "workflow complete");
      this._touch(workflow);
      this._persist();
      this._emit("complete", workflow, null);
      return workflow;
    }

    pause(id) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status !== "running") return workflow;
      workflow.status = "paused";
      this._log(workflow, "info", "workflow paused at step " + workflow.current);
      this._touch(workflow);
      this._persist();
      this._emit("pause", workflow, workflow.steps[workflow.current] || null);
      return workflow;
    }

    resume(id) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status !== "paused") return workflow;
      workflow.status = "running";
      this._log(workflow, "info", "workflow resumed");
      this._touch(workflow);
      this._persist();
      this._emit("resume", workflow, workflow.steps[workflow.current] || null);
      return workflow;
    }

    end(id) {
      var workflow = this._workflow(id);
      if (!workflow) return null;
      if (workflow.status === "ended") return workflow;
      workflow.status = "ended";
      workflow.end_time = nowISO();
      this._log(workflow, "info", "workflow ended");
      this._touch(workflow);
      this._persist();
      this._emit("end", workflow, workflow.steps[workflow.current] || null);
      return workflow;
    }

    /**
     * Delegate encryption to VICI when available. The compatibility fallback
     * stores a string in plain and must never be treated as ciphertext.
     */
    async encryptData(plaintext, passphrase) {
      if (typeof window !== "undefined" && window && window.vici && typeof window.vici.encrypt === "function") {
        return window.vici.encrypt(plaintext, passphrase);
      }
      return { plain: String(plaintext), method: "none" };
    }

    async decryptData(payload, passphrase) {
      if (payload && typeof payload === "object" && payload.plain !== undefined) {
        return payload.plain;
      }
      if (typeof window !== "undefined" && window && window.vici && typeof window.vici.decrypt === "function") {
        return window.vici.decrypt(payload, passphrase);
      }
      return String(payload == null ? "" : payload);
    }
  }

  var vini = new Vini();

  // Preserve the existing CommonJS surface for tests and tooling. It is not a
  // server runtime and no Node-specific behavior is part of the browser API.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { Vini: Vini, vini: vini };
  }

  if (typeof window !== "undefined" && window) {
    window.Vini = Vini;
    window.vini = vini;
  }
})();
