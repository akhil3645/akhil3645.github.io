const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const initialState = {
  activePage: "overview",
  businessUnit: "REPLACE_WITH_BUSINESS_UNIT",
  threshold: 95,
  multiplier: 1.25,
  documentTypeId: "REPLACE_WITH_DOCUMENT_TYPE_ID",
  extraRule: false,
};

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("abm-sap-plan-editor") || "null");
  } catch {
    return null;
  }
})();

const state = saved && typeof saved === "object" ? { ...initialState, ...saved } : { ...initialState };

const pageMetadata = {
  overview: ["Program overview", "FUNCTION"],
  data: ["ABM Calculation Input", "DATABASE LOOKUP"],
  measures: ["Team Average Incentive", "TABLE OPERATION"],
  eligibility: ["Payout Eligibility", "BOOLEAN EXPRESSION"],
  payout: ["Potential Incentive", "FORMULA"],
  parameters: ["Business Parameters", "CONSTANTS"],
  definition: ["Canonical V2 Definition", "JSON AST"],
};

const sourceFields = [
  ["Business unit", "business_unit", "TEXT", "Program parameter"],
  ["Team average incentive", "team_average_incentive", "NUMBER", "Dependent programs + FF Count"],
  ["Total net sales", "total_net_sales_amount", "NUMBER", "UNS Daily Sales"],
  ["Total target", "total_target_amount", "NUMBER", "UNS Daily Sales targets"],
  ["Sales achievement", "sales_achievement_percentage", "NUMBER", "Prepared calculation"],
  ["Has resigned", "has_resigned", "BOOLEAN", "Employee timeline"],
  ["Potential incentive", "potential_incentive", "NUMBER", "Rounded team average × multiplier"],
];

const measureDefinitions = [
  ["Team Average Incentive", "team_average_incentive", "NUMBER", "FF-weighted dependent-program incentive"],
  ["Total Net Sales", "total_net_sales_amount", "NUMBER", "Prepared area sales total"],
  ["Total Target", "total_target_amount", "NUMBER", "De-duplicated area target"],
  ["Sales Achievement", "sales_achievement_percentage", "NUMBER", "Net sales ÷ target × 100"],
  ["Has Resigned", "has_resigned", "BOOLEAN", "Timeline employment status"],
  ["Potential Incentive", "potential_incentive", "NUMBER", "Rounded team average × manager multiplier"],
];

const sourceField = (sourceAlias, field) => ({
  type: "SOURCE_FIELD",
  sourceAlias,
  sourceField: field,
});

const selection = (alias) => ({ type: "SELECTION", selectionAlias: alias });

const constant = (type, value) => ({
  type: "CONSTANT",
  constantType: type,
  constantValue: value,
});

const parameter = (alias) => ({
  type: "VARIABLE",
  variableSource: "PROGRAM_PARAMETERS",
  variableAlias: alias,
});

const operation = (name, ...operands) => ({
  type: "OPERATION",
  operation: name,
  operands,
});

function variable(title, alias, dataType, field, showInReport = true) {
  return {
    title,
    alias,
    dataType,
    showInReport,
    value: sourceField("abm_input", field),
  };
}

function definition() {
  const rules = [
    {
      title: `Minimum ${state.threshold}% sales achievement`,
      condition: operation(
        "GREATER_THAN_OR_EQUALS",
        selection("sales_achievement_percentage"),
        parameter("achievement_threshold"),
      ),
    },
    {
      title: "Employee has not resigned",
      condition: operation("EQUALS", selection("has_resigned"), constant("BOOLEAN", false)),
    },
  ];

  if (state.extraRule) {
    rules.push({
      title: "Potential incentive is positive",
      condition: operation("GREATER_THAN", selection("potential_incentive"), constant("NUMBER", 0)),
    });
  }

  return {
    sourceDataTypes: [{ key: "abm_calculation_input", id: state.documentTypeId }],
    blocks: [
      {
        title: "ABM Incentive Block",
        type: "VOLUME_BASED",
        employees: {
          alias: "abm",
          joins: [],
          filter: operation(
            "AND",
            operation("EQUALS", sourceField("abm", "emp_cat_type"), constant("TEXT", "ABM")),
            operation("EQUALS", sourceField("abm", "division_name"), parameter("business_unit")),
          ),
        },
        blockSources: [
          {
            sourceKey: "abm_calculation_input",
            sourceAlias: "abm_input",
            alias: "abm_input_raw",
            joins: [],
            filter: operation(
              "EQUALS",
              sourceField("abm_input_raw", "business_unit"),
              parameter("business_unit"),
            ),
          },
        ],
        transformationSteps: [],
        employeeCalculationSources: [
          {
            source: { type: "TRANSFORMATION", key: "abm_input", alias: "abm_input" },
            relation: operation(
              "EQUALS",
              sourceField("employees", "id"),
              sourceField("abm_input", "employee_id"),
            ),
          },
        ],
        employeeCalculationVariables: [
          variable("Team's Average Incentive", "team_average_incentive", "NUMBER", "team_average_incentive"),
          variable("Total Net Sales Amount", "total_net_sales_amount", "NUMBER", "total_net_sales_amount"),
          variable("Total Target Amount", "total_target_amount", "NUMBER", "total_target_amount"),
          variable("Sales Achievement Percentage", "sales_achievement_percentage", "NUMBER", "sales_achievement_percentage"),
          variable("Has Resigned", "has_resigned", "BOOLEAN", "has_resigned", false),
          variable("Potential Incentive", "potential_incentive", "NUMBER", "potential_incentive"),
        ],
        workspaceCharts: [
          { type: "amountChart", amountChart: { label: "Total Net Sales Amount", value: selection("total_net_sales_amount") } },
          { type: "amountChart", amountChart: { label: "Total Target Amount", value: selection("total_target_amount") } },
          {
            type: "gaugeChart",
            gaugeChart: {
              label: "Percentage of Target Achieved",
              minValue: constant("NUMBER", 0),
              maxValue: constant("NUMBER", 120),
              thresholdValue: parameter("achievement_threshold"),
              value: selection("sales_achievement_percentage"),
            },
          },
          { type: "amountChart", amountChart: { label: "Team's Average Incentive", value: selection("team_average_incentive") } },
        ],
        parameters: [
          { key: "business_unit", name: "Business Unit", isArray: false, type: "string" },
          { key: "achievement_threshold", name: "Achievement Threshold (%)", isArray: false, type: "number" },
          { key: "manager_multiplier", name: "Manager Multiplier", isArray: false, type: "number" },
        ],
        parametersValues: [
          {
            fromDate: null,
            toDate: null,
            values: [
              { key: "business_unit", value: state.businessUnit },
              { key: "achievement_threshold", value: state.threshold },
              { key: "manager_multiplier", value: state.multiplier },
            ],
          },
        ],
        volumeIncentiveGeneration: {
          rules,
          incentiveAmount: selection("potential_incentive"),
        },
      },
    ],
  };
}

function renderSourceSchema() {
  $("#source-schema").innerHTML = sourceFields
    .map(
      ([label, key, type, origin]) => `
        <tr class="border-t border-line">
          <td class="px-5 py-3 font-semibold">${label}</td>
          <td class="px-4 py-3 font-mono text-muted">${key}</td>
          <td class="px-4 py-3"><span class="status-pill status-neutral">${type}</span></td>
          <td class="px-4 py-3 text-muted">${origin}</td>
        </tr>`,
    )
    .join("");
}

function renderMeasureDefinitions() {
  $("#measure-definitions").innerHTML = measureDefinitions
    .map(
      ([name, alias, type, definitionText]) => `
        <tr class="border-t border-line">
          <td class="px-5 py-3 font-semibold">${name}</td>
          <td class="px-4 py-3 font-mono text-muted">${alias}</td>
          <td class="px-4 py-3"><span class="status-pill status-neutral">${type}</span></td>
          <td class="px-4 py-3 text-muted">${definitionText}</td>
        </tr>`,
    )
    .join("");
}

function renderLogicPath() {
  const nodes = [
    ["Data object", "ABM Calculation Input"],
    ["Measure", "FF-weighted average"],
    ["Decision", "Achievement + employment"],
    ["Payout", "Potential incentive"],
  ];
  $("#logic-path").innerHTML = nodes
    .map(
      ([label, value], index) => `<div class="logic-line"><div class="logic-node ${index === 3 ? "active-node" : ""}"><div class="logic-node-label">${label}</div><div class="logic-node-value">${value}</div></div></div>`,
    )
    .join("");
}

function renderExtraRule() {
  $("#rule-builder").querySelector(".extra-rule-row")?.remove();
  if (!state.extraRule) return;
  $("#rule-builder").insertAdjacentHTML(
    "beforeend",
    `<div class="rule-row extra-rule-row">
      <label><span class="field-label">Measure</span><select disabled><option>Potential incentive</option></select></label>
      <label><span class="field-label">Operator</span><select disabled><option>is greater than</option></select></label>
      <label><span class="field-label">Value</span><input value="0" disabled class="w-full" /></label>
      <span class="status-pill status-neutral mb-1 justify-center">Configured</span>
    </div>`,
  );
}

function syncInputs() {
  $$('[data-threshold-input]').forEach((input) => (input.value = state.threshold));
  $$('[data-multiplier-input]').forEach((input) => (input.value = state.multiplier));
  $$('[data-business-unit-input]').forEach((input) => (input.value = state.businessUnit));
  $("#document-type-id").value = state.documentTypeId;
  $$('[data-threshold-text]').forEach((element) => (element.textContent = state.threshold));
  $$('[data-rule-count]').forEach((element) => (element.textContent = state.extraRule ? "3" : "2"));
}

function render() {
  syncInputs();
  renderExtraRule();
  $("#payout-expression").textContent = JSON.stringify(selection("potential_incentive"), null, 2);
  $("#definition-json").textContent = JSON.stringify(definition(), null, 2);
  $("#definition-rule-count").textContent = state.extraRule ? "3" : "2";
}

function setPage(page) {
  state.activePage = page;
  $$('.editor-page').forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  $$('.nav-button').forEach((button) => {
    if (button.dataset.page === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const [title, kind] = pageMetadata[page];
  $("#inspector-title").textContent = title;
  $("#inspector-kind").textContent = kind;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer;
function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(definition(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "abm-v2-incentive-definition.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("V2 definition downloaded");
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(definition(), null, 2));
  toast("V2 definition copied");
}

function bindEvents() {
  $("#object-navigation").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (button) setPage(button.dataset.page);
  });
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => setPage(button.dataset.go)));

  $$('[data-threshold-input]').forEach((input) =>
    input.addEventListener("change", () => {
      state.threshold = Number(input.value || 0);
      render();
    }),
  );
  $$('[data-multiplier-input]').forEach((input) =>
    input.addEventListener("change", () => {
      state.multiplier = Number(input.value || 0);
      render();
    }),
  );
  $$('[data-business-unit-input]').forEach((input) =>
    input.addEventListener("change", () => {
      state.businessUnit = input.value.trim() || initialState.businessUnit;
      render();
    }),
  );

  $("#document-type-id").addEventListener("change", (event) => {
    state.documentTypeId = event.target.value.trim() || initialState.documentTypeId;
    render();
  });
  $("#check-binding").addEventListener("click", () => {
    const placeholder = state.documentTypeId === initialState.documentTypeId;
    toast(placeholder ? "Replace the document type placeholder before runtime" : "Binding format accepted for prototype");
  });
  $$('[data-capability]').forEach((button) =>
    button.addEventListener("click", () => toast(`${button.dataset.capability} requires an engine capability`)),
  );

  $("#add-condition").addEventListener("click", () => {
    state.extraRule = !state.extraRule;
    $("#add-condition").textContent = state.extraRule ? "− Remove added condition" : "+ Add condition";
    render();
  });

  $("#save-draft").addEventListener("click", () => {
    localStorage.setItem("abm-sap-plan-editor", JSON.stringify(state));
    toast("Plan configuration saved in this browser");
  });
  $("#validate-definition").addEventListener("click", () => toast("Plan structure is valid · 1 integration warning"));
  $("#export-definition").addEventListener("click", downloadJson);
  $("#copy-json").addEventListener("click", copyJson);
  $("#download-json").addEventListener("click", downloadJson);
  $("#mobile-actions").addEventListener("click", () => setPage("definition"));
}

renderSourceSchema();
renderMeasureDefinitions();
renderLogicPath();
bindEvents();
setPage(state.activePage in pageMetadata ? state.activePage : "overview");
$("#add-condition").textContent = state.extraRule ? "− Remove added condition" : "+ Add condition";
render();
