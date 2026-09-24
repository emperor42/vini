"use strict";

/**
 * vini — workflow / data-passing management.
 *
 * Define multi-step workflows, run them (start/continue/complete/pause/
 * resume/end), persist progress and execution logs to localStorage under
 * "vini_workflows", and react through documented events:
 *
 *   vini:start  vini:continue  vini:complete
 *   vini:pause  vini:resume    vini:end
 *   vini:step   vini:error
 *
 * Each event carries { workflowId, workflow, step } in detail.
 *
 * Usage:
 *   vini.define("onboarding", { label: "Onboarding", steps: [ { id: "intro", title: "Welcome" } ] })
 *     .then(wf => vini.start(wf.id))
 *     .then(wf => vini.continue(wf.id, { name: "Ada" }));
 *   vini.on("start", function (e) { console.log("started", e.detail.workflow.label); });
 *
 * encryptData/decryptData route through vici (WebCrypto AES-GCM) when present;
 * there is no fake "XOR encryption" in this library.
 *
 * Browser global: window.vini (instance) and window.Vini (class).
 * No external dependencies.
 */

(function () {
  "use strict";

  var STORAGE_KEY = "vini_workflows";
  var EVENTS = ["start", "continue", "complete", "pause", "resume", "end", "step", "error"];

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      var b = new Uint8Array(12);
      crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) {
        return ("0" + x.toString(16)).slice(-2);
      }).join("");
    }
    return "wf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  class Vini {
    constructor(opts) {
      opts = opts || {};
      this.state = loadState();
      this.listener = null; // single subscriber + manual listeners below
      this._listeners = {};
      EVENTS.forEach(function (ev) { this._listeners[ev] = []; }, this);
      this.prefix = opts.eventPrefix || "vini";
      if (typeof document !== "undefined") {
        var self = this;
        // Catch any vini:* event dispatched on the document.
        document.addEventListener("vini:start", this._collector("start"));
        document.addEventListener("vini:continue", this._collector("continue"));
        document.addEventListener("vini:complete", this._collector("complete"));
        document.addEventListener("vini:pause", this._collector("pause"));
        document.addEventListener("vini:resume", this._collector("resume"));
        document.addEventListener("vini:end", this._collector("end"));
        document.addEventListener("vini:step", this._collector("step"));
        document.addEventListener("vini:error", this._collector("error"));
      }
    }

    _collector(name) {
      var self = this;
      return function (e) {
        (self._listeners[name] || []).forEach(function (cb) {
          try { cb(e); } catch (err) { /* listener errors are non-fatal */ }
        });
      };
    }

    /** Subscribe to workflow events: vini.on("start", cb) or vini.on(cb) (all). */
    on(ev, cb) {
      if (typeof ev === "function") {
        this.listener = ev;
        EVENTS.forEach(function (k) { this._listeners[k].push(ev); }, this);
        return this;
      }
      var list = this._listeners[ev];
      if (list) list.push(cb);
      return this;
    }

    _emit(type, wf, step) {
      if (typeof document === "undefined") return;
      var detail = { workflowId: wf.id, workflow: wf, step: step || null };
      var ev = new CustomEvent("vini:" + type, { detail: detail, bubbles: true });
      document.dispatchEvent(ev);
    }

    _log(wf, level, msg) {
      wf.log = wf.log || [];
      wf.log.push({ at: nowISO(), level: level, message: msg });
      if (wf.log.length > 500) wf.log = wf.log.slice(-500);
    }

    _persist() {
      saveState(this.state);
    }

    _touch(wf) {
      wf.updated = nowISO();
      this.state[wf.id] = wf;
    }

    /**
     * Define a workflow. steps: [{ id, title, action?, validate?(data)->bool }]
     * Returns the workflow object.
     */
    define(name, opts) {
      opts = opts || {};
      if (!name) name = "workflow-" + uuid();
      var steps = (opts.steps || []).map(function (s, i) {
        return {
          id: s.id || String(i),
          title: s.title || String(i + 1),
          action: s.action || "",
          validate: s.validate || null,
          data: null,
          completed_at: null,
        };
      });
      var wf = {
        id: opts.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + uuid().slice(0, 6),
        name: name,
        label: opts.label || name,
        status: "defined", // defined | running | paused | done | ended
        steps: steps,
        current: 0,
        progress: 0,
        data: {},
        created: nowISO(),
        updated: nowISO(),
        log: [],
      };
      this.state[wf.id] = wf;
      this._persist();
      return wf;
    }

    get(id) { return this.state[id] || null; }

    list() {
      var out = [];
      for (var k in this.state) {
        if (Object.prototype.hasOwnProperty.call(this.state, k)) out.push(this.state[k]);
      }
      return out.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    }

    remove(id) {
      if (this.state[id]) {
        delete this.state[id];
        this._persist();
        return true;
      }
      return false;
    }

    start(id, data) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status === "running") return wf;
      wf.status = "running";
      wf.start_time = nowISO();
      wf.current = 0;
      wf.data = Object.assign({}, data || {});
      wf.progress = wf.steps.length ? Math.round(((wf.current) / wf.steps.length) * 100) : 100;
      this._log(wf, "info", "workflow started");
      this._touch(wf);
      this._persist();
      this._emit("start", wf, wf.steps[wf.current] || null);
      this._emit("step", wf, wf.steps[wf.current] || null);
      return wf;
    }

    /** Advance to the next step, validating the optional step payload. */
    continue(id, stepData) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status !== "running") return wf;
      var idx = Math.min(wf.current, wf.steps.length - 1);
      var step = wf.steps[idx];
      if (step) {
        if (step.validate && typeof step.validate === "function") {
          var ok = step.validate(stepData || {});
          if (!ok) {
            this._log(wf, "error", "validation failed on step " + step.id);
            this._touch(wf);
            this._persist();
            this._emit("error", wf, step);
            return wf;
          }
        }
        step.data = Object.assign({}, stepData || {});
        step.completed_at = nowISO();
        this._log(wf, "info", "completed step " + step.id);
      }
      wf.current = idx + 1;
      var next = wf.steps[wf.current] || null;
      wf.progress = wf.steps.length ? Math.round((wf.current / wf.steps.length) * 100) : 100;
      this._touch(wf);
      this._persist();
      this._emit("continue", wf, next);
      this._emit("step", wf, next);
      if (wf.current >= wf.steps.length) this.complete(id);
      return wf;
    }

    complete(id) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status === "done") return wf;
      wf.status = "done";
      wf.progress = 100;
      wf.end_time = nowISO();
      this._log(wf, "info", "workflow complete");
      this._touch(wf);
      this._persist();
      this._emit("complete", wf, null);
      return wf;
    }

    pause(id) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status !== "running") return wf;
      wf.status = "paused";
      this._log(wf, "info", "workflow paused at step " + wf.current);
      this._touch(wf);
      this._persist();
      this._emit("pause", wf, wf.steps[wf.current] || null);
      return wf;
    }

    resume(id) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status !== "paused") return wf;
      wf.status = "running";
      this._log(wf, "info", "workflow resumed");
      this._touch(wf);
      this._persist();
      this._emit("resume", wf, wf.steps[wf.current] || null);
      return wf;
    }

    end(id) {
      var wf = this.state[id];
      if (!wf) return null;
      if (wf.status === "ended") return wf;
      wf.status = "ended";
      wf.end_time = nowISO();
      this._log(wf, "info", "workflow ended");
      this._touch(wf);
      this._persist();
      this._emit("end", wf, wf.steps[wf.current] || null);
      return wf;
    }

    /**
     * Data passing helpers. When vici is loaded, encryption is real WebCrypto
     * AES-GCM; otherwise data is stored as-is (and marked as such).
     */
    async encryptData(plaintext, passphrase) {
      if (typeof window !== "undefined" && window.vici && window.vici.encrypt) {
        return window.vici.encrypt(plaintext, passphrase);
      }
      return { plain: String(plaintext), method: "none" };
    }

    async decryptData(payload, passphrase) {
      if (payload && typeof payload === "object" && payload.plain !== undefined) {
        return payload.plain;
      }
      if (typeof window !== "undefined" && window.vici && window.vici.decrypt) {
        return window.vici.decrypt(payload, passphrase);
      }
      return String(payload == null ? "" : payload);
    }

    getWorkflow(id) { return this.get(id); }
  }

  var vini = new Vini();

  // Export for module systems
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { Vini: Vini, vini: vini };
  }

  if (typeof window !== "undefined") {
    window.Vini = Vini;
    window.vini = vini;
  }
})();