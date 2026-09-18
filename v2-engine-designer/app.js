const views = {
  map: ["Definition map", "program"],
  setup: ["Plan setup", "program"],
  blocks: ["Calculation blocks", "program.blocks[]"],
  population: ["Employee population", "block.employees"],
  sources: ["Source data", "block.blockSources[]"],
  transformations: ["Transformations", "block.transformationSteps[]"],
  inputs: ["Calculation sources", "block.employeeCalculationSources[]"],
  variables: ["Calculation variables", "block.employeeCalculationVariables[]"],
  generation: ["Rules & payout", "block.volumeIncentiveGeneration"],
  parameters: ["Parameters", "block.parameters + parametersValues"],
  distribution: ["Distribution", "block.distribution"],
  workspace: ["Workspace charts", "block.workspaceCharts[]"],
  expressions: ["Expression builder", "shared expression editor"],
  review: ["Validate & inspect", "definition"],
};

function selectView(view) {
  if (!views[view]) return;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#inspector-title").textContent = views[view][0];
  document.querySelector("#inspector-path").textContent = views[view][1];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelector("#object-navigation").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) selectView(button.dataset.view);
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => selectView(button.dataset.go));
});
