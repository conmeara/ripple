const demoStates = [
  {
    status: "Reviewing the frame",
    comment: "Make the phone hero feel more premium and hold the final frame longer.",
    action: "Visual context attached",
    agent: "Working",
    agentLine: "Reviewed the current frame, sampled a short frame sheet, and prepared a focused composition edit.",
    step: "Editing timing",
    frame: "18",
    time: "00:03:14",
    shot: 0
  },
  {
    status: "Updating composition",
    comment: "Use the ripple wave treatment for the product reveal.",
    action: "Proposed version running",
    agent: "Editing",
    agentLine: "Adjusted the reveal, extended the hold, and kept Main untouched while the proposal renders.",
    step: "Rendering proposal",
    frame: "24",
    time: "00:04:02",
    shot: 1
  },
  {
    status: "Changes ready",
    comment: "Soften the transition and keep the logo readable at the cut.",
    action: "Compare Main and Proposed",
    agent: "Ready",
    agentLine: "The revision is ready to preview. Accept it into Main or keep refining the comment thread.",
    step: "Ready to preview",
    frame: "31",
    time: "00:05:18",
    shot: 2
  }
];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nodes = {
  status: document.querySelector("[data-demo-status]"),
  comment: document.querySelector("[data-demo-comment]"),
  action: document.querySelector("[data-demo-action]"),
  agent: document.querySelector("[data-demo-agent]"),
  agentLine: document.querySelector("[data-demo-agent-line]"),
  step: document.querySelector("[data-demo-step]"),
  frame: document.querySelector("[data-demo-frame]"),
  time: document.querySelector("[data-demo-time]")
};
const shots = Array.from(document.querySelectorAll("[data-demo-shot]"));
let stateIndex = 0;

function setText(node, value) {
  if (node) node.textContent = value;
}

function setDemoState(nextIndex) {
  const state = demoStates[nextIndex % demoStates.length];
  stateIndex = nextIndex % demoStates.length;

  setText(nodes.status, state.status);
  setText(nodes.comment, state.comment);
  setText(nodes.action, state.action);
  setText(nodes.agent, state.agent);
  setText(nodes.agentLine, state.agentLine);
  setText(nodes.step, state.step);
  setText(nodes.frame, state.frame);
  setText(nodes.time, state.time);

  shots.forEach((shot) => {
    shot.classList.toggle("is-active", shot.dataset.demoShot === String(state.shot));
  });
}

setDemoState(0);

if (!prefersReducedMotion) {
  window.setInterval(() => setDemoState(stateIndex + 1), 3600);
}
