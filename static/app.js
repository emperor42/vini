(function () {
  "use strict";

  var DEMO_ID = "vini-browser-demo";
  var MAX_EVENTS = 40;
  var elements = {};
  var demoWorkflow;
  var eventLogStarted = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function workflow() {
    return window.vini && window.vini.get ? window.vini.get(DEMO_ID) : null;
  }

  function validators() {
    return {
      profile: function (data) {
        return !!(data && typeof data.name === "string" && data.name.trim());
      },
      review: function (data) {
        return !!(data && data.confirmed === true);
      }
    };
  }

  function defineDemo() {
    var checks = validators();
    return window.vini.define("VINI browser demo", {
      id: DEMO_ID,
      label: "Welcome flow",
      steps: [
        {
          id: "profile",
          title: "What should we call you?",
          action: "collect",
          validate: checks.profile
        },
        {
          id: "review",
          title: "Review the name",
          action: "confirm",
          validate: checks.review
        },
        {
          id: "finish",
          title: "Ready to finish",
          action: "finish"
        }
      ]
    });
  }

  function ensureDemo() {
    demoWorkflow = workflow();
    if (!demoWorkflow) {
      demoWorkflow = defineDemo();
      return;
    }

    // A JSON round-trip through localStorage drops functions. Restore only
    // the demo validators in memory; the workflow's persisted data is intact.
    var checks = validators();
    demoWorkflow.steps.forEach(function (step) {
      if (step.id === "profile") step.validate = checks.profile;
      if (step.id === "review") step.validate = checks.review;
    });
  }

  function setText(id, value) {
    if (elements[id]) elements[id].textContent = value;
  }

  function render() {
    var wf = workflow() || demoWorkflow;
    if (!wf) return;

    var status = elements["workflow-status"];
    status.textContent = wf.status;
    status.className = "status status-" + wf.status;

    var completed = Number(wf.progress || 0);
    elements["progress-bar"].style.width = Math.max(0, Math.min(100, completed)) + "%";
    setText("workflow-summary", wf.label + " · " + completed + "% complete · " + wf.log.length + " log entries");

    var current = wf.steps[wf.current] || null;
    var running = wf.status === "running" && current;
    elements["step-fields"].hidden = !running;
    elements["next-button"].hidden = !running;
    elements["pause-button"].hidden = wf.status !== "running";
    elements["resume-button"].hidden = wf.status !== "paused";

    if (running) {
      setText("step-label", current.title);
      setText("step-hint", "Step " + (wf.current + 1) + " of " + wf.steps.length + ". Data is kept on the current step.");
      var isProfile = current.id === "profile";
      var isReview = current.id === "review";
      elements["step-input"].hidden = !isProfile;
      elements["step-label"].hidden = !isProfile;
      elements["confirm-label"].hidden = !isReview;
      if (isProfile && elements["step-input"].value === "" && wf.steps[wf.current].data && wf.steps[wf.current].data.name) {
        elements["step-input"].value = wf.steps[wf.current].data.name;
      }
    } else if (wf.status === "paused") {
      setText("workflow-summary", wf.label + " · paused at step " + (wf.current + 1));
    } else if (wf.status === "done") {
      setText("workflow-summary", wf.label + " · complete · " + completed + "%");
    } else if (wf.status === "ended") {
      setText("workflow-summary", wf.label + " · ended");
    }
  }

  function payloadForCurrentStep(wf) {
    var current = wf.steps[wf.current];
    if (!current) return {};
    if (current.id === "profile") {
      return { name: elements["step-input"].value.trim() };
    }
    if (current.id === "review") {
      return { confirmed: elements["step-confirm"].checked };
    }
    return {};
  }

  function clearValidationMessage() {
    elements["validation-message"].textContent = "";
    elements["validation-message"].className = "message";
  }

  function showValidationMessage() {
    elements["validation-message"].textContent = "That step needs a value before the workflow can continue.";
    elements["validation-message"].className = "message error";
  }

  function addEventLine(event, wf) {
    var name = event.type.replace(/^vini:/, "");
    var step = event.detail && event.detail.step;
    var stepName = step && step.title ? step.title : "no active step";
    var item = document.createElement("li");
    item.textContent = new Date().toLocaleTimeString() + " · vini:" + name + " · " + stepName;
    elements["event-log"].insertBefore(item, elements["event-log"].firstChild);
    while (elements["event-log"].childElementCount > MAX_EVENTS) {
      elements["event-log"].removeChild(elements["event-log"].lastChild);
    }
  }

  function renderStoredLogs(wf) {
    if (eventLogStarted) return;
    eventLogStarted = true;
    (wf.log || []).slice().reverse().forEach(function (entry) {
      var item = document.createElement("li");
      item.textContent = entry.at + " · " + entry.level + " · " + entry.message;
      elements["event-log"].appendChild(item);
    });
  }

  function onViniEvent(event) {
    var detail = event.detail || {};
    if (detail.workflowId !== DEMO_ID) return;
    addEventLine(event, detail.workflow);
    if (event.type === "vini:error") showValidationMessage();
    else clearValidationMessage();
    render();
  }

  function resetDemo() {
    window.vini.remove(DEMO_ID);
    demoWorkflow = defineDemo();
    eventLogStarted = false;
    elements["event-log"].innerHTML = "";
    elements["step-input"].value = "";
    elements["step-confirm"].checked = false;
    clearValidationMessage();
    render();
  }

  function bind() {
    elements["workflow-status"] = byId("workflow-status");
    elements["workflow-summary"] = byId("workflow-summary");
    elements["progress-bar"] = byId("progress-bar");
    elements["step-fields"] = byId("step-fields");
    elements["step-label"] = byId("step-label");
    elements["step-input"] = byId("step-input");
    elements["step-confirm"] = byId("step-confirm");
    elements["step-hint"] = byId("step-hint");
    elements["next-button"] = byId("next-button");
    elements["pause-button"] = byId("pause-button");
    elements["resume-button"] = byId("resume-button");
    elements["event-log"] = byId("event-log");
    elements["validation-message"] = byId("validation-message");

    byId("start-button").addEventListener("click", function () {
      clearValidationMessage();
      elements["step-input"].value = "";
      elements["step-confirm"].checked = false;
      window.vini.start(DEMO_ID, { source: "demo" });
    });
    byId("step-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var wf = workflow();
      if (!wf || wf.status !== "running") return;
      window.vini.continue(DEMO_ID, payloadForCurrentStep(wf));
    });
    byId("pause-button").addEventListener("click", function () {
      window.vini.pause(DEMO_ID);
    });
    byId("resume-button").addEventListener("click", function () {
      window.vini.resume(DEMO_ID);
    });
    byId("reset-button").addEventListener("click", resetDemo);
    byId("clear-events-button").addEventListener("click", function () {
      elements["event-log"].innerHTML = "";
      eventLogStarted = true;
    });
  }

  function init() {
    if (!window.vini || typeof window.vini.define !== "function") {
      setText("workflow-summary", "VINI failed to load.");
      return;
    }
    bind();
    ensureDemo();
    renderStoredLogs(demoWorkflow);
    window.vini.on(onViniEvent);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
