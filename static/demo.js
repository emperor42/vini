(function () {
  "use strict";

  var workflowId = "vini-browser-demo";
  var statusElement = document.querySelector("#status");
  var progressElement = document.querySelector("#progress");
  var stepsElement = document.querySelector("#steps");
  var form = document.querySelector("#step-form");
  var emailField = document.querySelector("#email-field");
  var emailInput = document.querySelector("#email");
  var reviewMessage = document.querySelector("#review");
  var validationMessage = document.querySelector("#validation");
  var startButton = document.querySelector("#start");
  var nextButton = document.querySelector("#next");
  var pauseButton = document.querySelector("#pause");
  var endButton = document.querySelector("#end");
  var clearButton = document.querySelector("#clear");
  var eventList = document.querySelector("#events");

  function statusLabel(status) {
    return {
      defined: "Not started",
      running: "Running",
      paused: "Paused",
      done: "Complete",
      ended: "Ended"
    }[status] || status;
  }

  function paint(workflow) {
    statusElement.textContent = statusLabel(workflow.status);
    progressElement.value = workflow.progress;
    progressElement.textContent = workflow.progress + "%";

    stepsElement.replaceChildren();
    workflow.steps.forEach(function (step, index) {
      var item = document.createElement("li");
      var marker = document.createElement("span");
      var title = document.createElement("span");
      marker.className = "marker";
      title.textContent = step.title;

      if (index < workflow.current || workflow.status === "done") {
        item.className = "complete";
        marker.textContent = "✓";
      } else if (index === workflow.current && workflow.status !== "ended") {
        item.className = "active";
        marker.textContent = "•";
      } else {
        marker.textContent = "·";
      }
      item.appendChild(marker);
      item.appendChild(title);
      stepsElement.appendChild(item);
    });

    var step = workflow.steps[workflow.current] || null;
    var canContinue = workflow.status === "running" && step !== null;
    form.hidden = !canContinue;
    emailField.hidden = !step || step.id !== "email";
    reviewMessage.hidden = !step || step.id !== "review";
    validationMessage.hidden = true;
    nextButton.disabled = !canContinue;
    nextButton.textContent = step && step.id === "done" ? "Finish workflow" : "Continue";
    pauseButton.disabled = workflow.status !== "running" && workflow.status !== "paused";
    pauseButton.textContent = workflow.status === "paused" ? "Resume" : "Pause";
    endButton.disabled = workflow.status === "done" || workflow.status === "ended";
  }

  function logEvent(event) {
    if (event.detail.workflow.id !== workflowId) return;
    var item = document.createElement("li");
    var name = document.createElement("span");
    var time = document.createElement("time");
    name.textContent = event.type;
    time.className = "event-time";
    time.dateTime = new Date(event.timeStamp || Date.now()).toISOString();
    time.textContent = time.dateTime.slice(11, 19) + " UTC";
    item.appendChild(name);
    item.appendChild(time);
    eventList.prepend(item);
    while (eventList.children.length > 20) {
      eventList.removeChild(eventList.lastElementChild);
    }
  }

  function resetView() {
    statusElement.textContent = "Not started";
    progressElement.value = 0;
    progressElement.textContent = "0%";
    stepsElement.replaceChildren();
    form.hidden = true;
    validationMessage.hidden = true;
    pauseButton.disabled = true;
    endButton.disabled = true;
  }

  vini.define(workflowId, {
    id: workflowId,
    label: "Browser profile demo",
    steps: [
      {
        id: "email",
        title: "Email address",
        validate: function (data) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "");
        }
      },
      { id: "review", title: "Review" },
      { id: "done", title: "Finish" }
    ]
  });

  vini.on(logEvent);
  vini.on("start", function (event) { paint(event.detail.workflow); });
  vini.on("step", function (event) { paint(event.detail.workflow); });
  vini.on("pause", function (event) { paint(event.detail.workflow); });
  vini.on("resume", function (event) { paint(event.detail.workflow); });
  vini.on("end", function (event) { paint(event.detail.workflow); });
  vini.on("complete", function (event) {
    paint(event.detail.workflow);
    form.hidden = true;
  });
  vini.on("error", function (event) {
    if (event.detail.step && event.detail.step.id === "email") {
      validationMessage.hidden = false;
    }
  });

  startButton.addEventListener("click", function () {
    vini.start(workflowId);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var workflow = vini.get(workflowId);
    var step = workflow && workflow.steps[workflow.current];
    if (!step) return;
    vini.continue(workflowId, {
      email: emailInput.value.trim(),
      confirmed: step.id === "review"
    });
  });

  pauseButton.addEventListener("click", function () {
    var workflow = vini.get(workflowId);
    if (!workflow) return;
    if (workflow.status === "paused") vini.resume(workflowId);
    else if (workflow.status === "running") vini.pause(workflowId);
  });

  endButton.addEventListener("click", function () {
    vini.end(workflowId);
  });

  clearButton.addEventListener("click", function () {
    vini.remove(workflowId);
    resetView();
  });
})();
