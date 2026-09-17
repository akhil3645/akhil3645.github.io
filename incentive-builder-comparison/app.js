const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const definitions = [
  {
    name: "Achievement",
    scope: "EMPLOYEE CALCULATION · NUMBER",
    task: "Calculate target achievement",
    challenge:
      "Try it: change the target to 150,000, then open the C tab, set a cap of 100, and compare. In B, edit the formula directly; in C, use the controlled parts.",
    formula: "net_sales / params.target_amount * 100",
    refs: { net_sales: "NUMBER", "params.target_amount": "NUMBER" },
    inputs: { net_sales: 120000, "params.target_amount": 100000 },
  },
  {
    name: "Eligibility",
    scope: "EMPLOYEES FILTER · BOOLEAN",
    task: "Include active employees in Sales",
    challenge:
      "Try it: include Marketing as well as Sales, while still requiring Active status. In B, add a parenthesized OR; in C, choose ‘is one of’ and enter Sales, Marketing.",
    formula: 'emp.department = "Sales" AND emp.status = "Active"',
    refs: { "emp.department": "TEXT", "emp.status": "TEXT" },
    inputs: { "emp.department": "Sales", "emp.status": "Active" },
  },
  {
    name: "Conditional rate",
    scope: "EMPLOYEE CALCULATION · NUMBER",
    task: "Choose a commission rate by achievement",
    challenge:
      "Try it: change the top threshold from 120 to 130. First matching condition wins; the rate applies to the full amount, not marginal bands.",
    formula:
      "CASE(achievement >= 120, 0.08,\n     achievement >= 100, 0.05,\n     achievement >= 80, 0.02, 0)",
    refs: { achievement: "NUMBER" },
    inputs: { achievement: 125 },
  },
  {
    name: "Approved sales",
    scope: "AGGREGATION SELECTION · NUMBER",
    task: "Sum only approved sales",
    challenge:
      "Try it: compare Approved with Pending sales, then change SUM to AVERAGE. Both editors operate over the same four fictional rows.",
    formula: 'SUM_WHERE(sales.amount, sales.status = "Approved")',
    refs: { "sales.amount": "NUMBER", "sales.status": "TEXT" },
    inputs: {},
  },
];
const rows = [
  { amount: 60000, status: "Approved" },
  { amount: 40000, status: "Approved" },
  { amount: 15000, status: "Pending" },
  { amount: 5000, status: "Rejected" },
];
const defaults = () =>
  definitions.map((d, i) => ({
    b: d.formula,
    c: d.formula,
    inputs: { ...d.inputs },
    group: "AND",
    rules: [
      { field: "emp.department", operator: "=", value: "Sales" },
      { field: "emp.status", operator: "=", value: "Active" },
    ],
    rates: [
      { threshold: 120, rate: 0.08 },
      { threshold: 100, rate: 0.05 },
      { threshold: 80, rate: 0.02 },
    ],
    fallback: 0,
    aggregate: "SUM",
    status: "Approved",
    operandA: "net_sales",
    mathOp: "/",
    operandB: "params.target_amount",
    scale: 100,
    cap: null,
  }));
let states = defaults(),
  active = 0;
function validSharedState(s, i) {
  return (
    typeof s.b === "string" &&
    s.b.length <= 5000 &&
    typeof s.c === "string" &&
    s.c.length <= 5000 &&
    s.inputs &&
    Object.keys(s.inputs).length ===
      Object.keys(definitions[i].inputs).length &&
    Object.entries(definitions[i].inputs).every(
      ([key, value]) =>
        typeof s.inputs[key] === typeof value &&
        (typeof value !== "number" || Number.isFinite(s.inputs[key])),
    ) &&
    ["AND", "OR"].includes(s.group) &&
    ["SUM", "AVERAGE", "COUNT"].includes(s.aggregate) &&
    ["Approved", "Pending", "Rejected"].includes(s.status) &&
    Number.isFinite(s.fallback) &&
    ["net_sales", "params.target_amount"].includes(s.operandA) &&
    ["net_sales", "params.target_amount"].includes(s.operandB) &&
    ["/", "*", "+", "-"].includes(s.mathOp) &&
    Number.isFinite(s.scale) &&
    (s.cap === null || Number.isFinite(s.cap)) &&
    Array.isArray(s.rules) &&
    s.rules.length <= 30 &&
    s.rules.every(
      (r) =>
        ["emp.department", "emp.status"].includes(r.field) &&
        ["=", "!=", "ANY_OF"].includes(r.operator) &&
        typeof r.value === "string",
    ) &&
    Array.isArray(s.rates) &&
    s.rates.length <= 30 &&
    s.rates.every(
      (r) => Number.isFinite(r.threshold) && Number.isFinite(r.rate),
    )
  );
}
try {
  if (location.hash) {
    const saved = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (
      saved.version === 1 &&
      Array.isArray(saved.states) &&
      saved.states.length === 4 &&
      Number.isInteger(saved.active) &&
      saved.active >= 0 &&
      saved.active < 4 &&
      saved.states.every(validSharedState)
    ) {
      states = saved.states;
      active = saved.active;
    }
  }
} catch {
  states = defaults();
  active = 0;
}
const operation = (name, ...operands) => ({
  type: "OPERATION",
  operation: name,
  operands,
});
const constant = (value) => ({
  type: "CONSTANT",
  constantType:
    typeof value === "number"
      ? "NUMBER"
      : typeof value === "boolean"
        ? "BOOLEAN"
        : "TEXT",
  constantValue: value,
});
function reference(name) {
  if (!(name in definitions[active].refs))
    throw Error(
      `Unknown reference “${name}”. Choose one from Insert reference.`,
    );
  if (name.startsWith("params."))
    return {
      type: "VARIABLE",
      variableSource: "PROGRAM_PARAMETERS",
      variableAlias: name.slice(7),
    };
  if (name.includes(".")) {
    const [sourceAlias, sourceField] = name.split(".");
    return { type: "SOURCE_FIELD", sourceAlias, sourceField };
  }
  return { type: "SELECTION", selectionAlias: name };
}
const binary = {
  OR: [1, "OR"],
  AND: [2, "AND"],
  "=": [3, "EQUALS"],
  "!=": [3, "NOT_EQUALS"],
  ">": [3, "GREATER_THAN"],
  ">=": [3, "GREATER_THAN_OR_EQUALS"],
  "<": [3, "LESS_THAN"],
  "<=": [3, "LESS_THAN_OR_EQUALS"],
  "+": [4, "ADD"],
  "-": [4, "SUBTRACT"],
  "*": [5, "MULTIPLY"],
  "/": [5, "DIVIDE"],
};
function compile(text) {
  if (text.length > 5000)
    throw Error("Keep demo formulas under 5,000 characters.");
  const tokens = [];
  let offset = 0;
  while (offset < text.length) {
    if (/\s/.test(text[offset])) {
      offset++;
      continue;
    }
    const match =
      /^(?:\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|[A-Za-z_][\w.]*|>=|<=|!=|[()+*/,=<>-])/.exec(
        text.slice(offset),
      );
    if (!match)
      throw Error(
        `Unexpected character at position ${offset + 1}. Use double quotes for text.`,
      );
    tokens.push(match[0]);
    offset += match[0].length;
  }
  let cursor = 0,
    depth = 0;
  function expression(min = 0) {
    if (++depth > 60) throw Error("Formula is too deeply nested.");
    let left;
    const token = tokens[cursor++];
    if (!token) throw Error("Expected a value or reference.");
    if (token === "(") {
      left = expression();
      if (tokens[cursor++] !== ")") throw Error("Missing closing parenthesis.");
    } else if (token === "-")
      left = operation("SUBTRACT", constant(0), expression(6));
    else if (/^\d/.test(token)) left = constant(Number(token));
    else if (token[0] === '"') {
      try {
        left = constant(JSON.parse(token));
      } catch {
        throw Error("Invalid quoted text.");
      }
    } else if (/^(TRUE|FALSE)$/i.test(token))
      left = constant(token.toUpperCase() === "TRUE");
    else if (tokens[cursor] === "(") {
      cursor++;
      const args = [];
      if (tokens[cursor] !== ")") {
        do {
          args.push(expression());
          if (tokens[cursor] !== ",") break;
          cursor++;
        } while (true);
      }
      if (tokens[cursor++] !== ")")
        throw Error("Expected a comma or closing parenthesis.");
      const fn = token.toUpperCase();
      const signatures = {
        CASE: [3, 99],
        COALESCE: [2, 99],
        GREATEST: [2, 99],
        LEAST: [2, 99],
        SUM: [1, 1],
        AVERAGE: [1, 1],
        COUNT: [1, 1],
        SUM_WHERE: [2, 2],
        AVERAGE_WHERE: [2, 2],
        COUNT_WHERE: [2, 2],
      };
      if (!signatures[fn])
        throw Error(
          `Unsupported demo function ${token}. Use the function picker.`,
        );
      const [min, max] = signatures[fn];
      if (
        args.length < min ||
        args.length > max ||
        (fn === "CASE" && args.length % 2 !== 1)
      )
        throw Error(
          `${fn}: check the number of arguments${fn === "CASE" ? " (condition/result pairs, then fallback)" : ""}.`,
        );
      left = fn.endsWith("_WHERE")
        ? { ...operation(fn.replace("_WHERE", ""), args[0]), filter: args[1] }
        : operation(fn, ...args);
    } else left = reference(token);
    while (cursor < tokens.length) {
      const spec = binary[tokens[cursor].toUpperCase()];
      if (!spec || spec[0] < min) break;
      cursor++;
      left = operation(spec[1], left, expression(spec[0] + 1));
    }
    depth--;
    return left;
  }
  const result = expression();
  if (cursor !== tokens.length)
    throw Error(
      `Unexpected “${tokens[cursor]}”. Add an operator between values.`,
    );
  const type = checkType(result);
  const expected = active === 1 ? "BOOLEAN" : "NUMBER";
  if (type !== expected)
    throw Error(
      `This context needs ${expected.toLowerCase()}, but the expression returns ${type.toLowerCase()}.`,
    );
  return result;
}
function checkType(node, insideAggregate = false) {
  if (node.type === "CONSTANT") return node.constantType;
  if (node.type !== "OPERATION") {
    const key =
      node.selectionAlias ||
      (node.type === "VARIABLE"
        ? "params." + node.variableAlias
        : node.sourceAlias + "." + node.sourceField);
    return definitions[active].refs[key];
  }
  const op = node.operation,
    aggregate = ["SUM", "AVERAGE", "COUNT"].includes(op);
  if (aggregate && (active !== 3 || insideAggregate))
    throw Error(
      "Aggregates are only available in Approved sales and cannot be nested.",
    );
  const types = node.operands.map((n) =>
    checkType(n, insideAggregate || aggregate),
  );
  const need = (t) => {
    if (types.some((x) => x !== t))
      throw Error(`${op} expects ${t.toLowerCase()} operands.`);
  };
  if (node.filter && checkType(node.filter, true) !== "BOOLEAN")
    throw Error("Aggregate filter must return boolean.");
  if (op === "CASE") {
    for (let i = 0; i < types.length - 1; i += 2)
      if (types[i] !== "BOOLEAN")
        throw Error("CASE conditions must be boolean.");
    const values = types.filter(
      (_, i) => i % 2 === 1 || i === types.length - 1,
    );
    if (new Set(values).size !== 1)
      throw Error("CASE results must have the same type.");
    return values[0];
  }
  if (["AND", "OR"].includes(op)) {
    need("BOOLEAN");
    return "BOOLEAN";
  }
  if (
    [
      "EQUALS",
      "NOT_EQUALS",
      "GREATER_THAN",
      "GREATER_THAN_OR_EQUALS",
      "LESS_THAN",
      "LESS_THAN_OR_EQUALS",
    ].includes(op)
  ) {
    if (types[0] !== types[1]) throw Error("Compare values of the same type.");
    return "BOOLEAN";
  }
  if (op === "COUNT") return "NUMBER";
  if (op === "COALESCE") {
    if (new Set(types).size !== 1)
      throw Error("COALESCE values must have the same type.");
    return types[0];
  }
  need("NUMBER");
  return "NUMBER";
}
function evaluate(node, inputs) {
  if (node.type === "CONSTANT") return node.constantValue;
  if (node.type !== "OPERATION") {
    const key =
      node.selectionAlias ||
      (node.type === "VARIABLE"
        ? "params." + node.variableAlias
        : node.sourceAlias + "." + node.sourceField);
    if (!(key in inputs))
      throw Error(
        `“${key}” needs an aggregate here; it represents multiple sample rows.`,
      );
    return inputs[key];
  }
  const op = node.operation,
    args = node.operands;
  if (["SUM", "AVERAGE", "COUNT"].includes(op)) {
    const values = rows
      .map((row) => ({
        "sales.amount": row.amount,
        "sales.status": row.status,
      }))
      .filter((row) => !node.filter || evaluate(node.filter, row) === true)
      .map((row) => evaluate(args[0], row))
      .filter((v) => v !== null);
    return op === "COUNT"
      ? values.length
      : !values.length
        ? null
        : values.reduce((a, b) => a + b, 0) /
          (op === "AVERAGE" ? values.length : 1);
  }
  if (op === "CASE") {
    for (let i = 0; i < args.length - 1; i += 2)
      if (evaluate(args[i], inputs) === true)
        return evaluate(args[i + 1], inputs);
    return evaluate(args.at(-1), inputs);
  }
  const values = args.map((n) => evaluate(n, inputs)),
    [a, b] = values;
  if (op === "COALESCE") return values.find((v) => v !== null) ?? null;
  if (op === "AND")
    return values.includes(false) ? false : values.includes(null) ? null : true;
  if (op === "OR")
    return values.includes(true) ? true : values.includes(null) ? null : false;
  if (op === "GREATEST" || op === "LEAST") {
    const nonnull = values.filter((v) => v !== null);
    return nonnull.length
      ? op === "GREATEST"
        ? Math.max(...nonnull)
        : Math.min(...nonnull)
      : null;
  }
  if (values.includes(null)) return null;
  switch (op) {
    case "ADD":
      return a + b;
    case "SUBTRACT":
      return a - b;
    case "MULTIPLY":
      return a * b;
    case "DIVIDE":
      return b === 0 ? null : a / b;
    case "EQUALS":
      return a === b;
    case "NOT_EQUALS":
      return a !== b;
    case "GREATER_THAN":
      return a > b;
    case "GREATER_THAN_OR_EQUALS":
      return a >= b;
    case "LESS_THAN":
      return a < b;
    case "LESS_THAN_OR_EQUALS":
      return a <= b;
  }
}
const option = (v, label, selected) =>
  `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(label ?? v)}</option>`;
function formulaEditor(side) {
  const refs = Object.keys(definitions[active].refs);
  const functions =
    active === 3
      ? [
          "SUM(sales.amount)",
          "AVERAGE(sales.amount)",
          'SUM_WHERE(sales.amount, sales.status = "Approved")',
          'AVERAGE_WHERE(sales.amount, sales.status = "Approved")',
          'COUNT_WHERE(sales.amount, sales.status = "Approved")',
        ]
      : active === 1
        ? ['emp.department = "Sales"', 'emp.status = "Active"']
        : [
            "LEAST(achievement, 100)",
            "COALESCE(net_sales, 0)",
            "CASE(achievement >= 100, 0.05, 0)",
          ];
  const valid = functions.filter(
    (f) =>
      !["achievement", "net_sales"].some(
        (r) => f.includes(r) && !refs.includes(r),
      ),
  );
  if (active === 0)
    valid.push("LEAST(net_sales / params.target_amount * 100, 100)");
  return `<label for="formula-${side}">Formula · ${active === 1 ? "boolean" : "number"}</label><textarea id="formula-${side}" spellcheck="false">${escapeHtml(states[active][side])}</textarea><div class="picker-row"><select aria-label="Insert reference in ${side.toUpperCase()}" data-insert="${side}">${option("", "Insert reference…")}${refs.map((r) => option(r, r)).join("")}</select><select aria-label="Insert function in ${side.toUpperCase()}" data-insert="${side}">${option("", "Insert function template…")}${valid.map((f) => option(f, f)).join("")}</select></div><p class="help">Select text to replace it, or place the cursor before inserting. Templates contain editable sample arguments. Preview updates as you type.</p>`;
}
function hybridEditor() {
  const s = states[active];
  if (active === 0) {
    const refs = Object.keys(definitions[0].refs);
    return `<p class="help">Build the percentage from parts. Each picker offers only values valid in this context.</p><div class="rule"><label>Value<select data-math="operandA">${refs.map((r) => option(r, r, s.operandA)).join("")}</select></label><label>Operator<select data-math="mathOp">${option("/", "÷ divide", s.mathOp)}${option("*", "× multiply", s.mathOp)}${option("+", "+ add", s.mathOp)}${option("-", "− subtract", s.mathOp)}</select></label><label>By<select data-math="operandB">${refs.map((r) => option(r, r, s.operandB)).join("")}</select></label></div><div class="two-fields"><label>Convert to percent (×)<input type="number" data-math="scale" value="${s.scale}"></label><label>Cap at % — blank means no cap<input type="number" data-math="cap" value="${s.cap ?? ""}"></label></div><p class="help">Compound arithmetic beyond one operation moves to the formula surface. This prototype keeps the parts simple to show the difference.</p>`;
  }
  if (active === 1)
    return `<label>Match<select id="group">${option("AND", "ALL conditions", s.group)}${option("OR", "ANY condition", s.group)}</select></label><div>${s.rules
      .map(
        (r, i) =>
          `<div class="rule"><label>Field<select data-rule="${i}" data-key="field">${Object.keys(
            definitions[1].refs,
          )
            .map((f) => option(f, f, r.field))
            .join(
              "",
            )}</select></label><label>Operator<select data-rule="${i}" data-key="operator">${option("=", "equals", r.operator)}${option("!=", "does not equal", r.operator)}${option("ANY_OF", "is one of", r.operator)}</select></label><label>Value<input data-rule="${i}" data-key="value" value="${escapeHtml(r.value)}"></label><button data-remove-rule="${i}" aria-label="Remove condition ${i + 1}">×</button></div>`,
      )
      .join(
        "",
      )}</div><button id="add-rule">+ Add condition</button><p class="help">For “is one of”, separate text values with commas. This prototype supports one ALL/ANY group with per-field lists; arbitrary nested groups would need additional controls.</p>`;
  if (active === 2)
    return `<p class="help">First matching condition wins. Reorder rows with ↑; the result is a single rate, not a marginal payout.</p>${s.rates.map((r, i) => `<div class="rate"><label>Achievement ≥<input type="number" data-rate="${i}" data-key="threshold" value="${r.threshold}"></label><label>Return rate (decimal)<input type="number" step="0.01" data-rate="${i}" data-key="rate" value="${r.rate}"></label><div><button data-up="${i}" aria-label="Move rate ${i + 1} up" ${i === 0 ? "disabled" : ""}>↑</button><button data-remove-rate="${i}" aria-label="Remove rate ${i + 1}">×</button></div></div>`).join("")}<label>Otherwise<input id="fallback" type="number" step="0.01" value="${s.fallback}"></label><button id="add-rate" style="margin-top:12px">+ Add condition / rate</button>`;
  return `<div class="two-fields"><label>Operation<select id="aggregate">${["SUM", "AVERAGE", "COUNT"].map((v) => option(v, v, s.aggregate)).join("")}</select></label><label>Value<select aria-label="Aggregation value"><option>sales.amount</option></select></label></div><h3 style="margin-top:22px">Filter included rows</h3><label>sales.status equals<select id="status">${["Approved", "Pending", "Rejected"].map((v) => option(v, v, s.status)).join("")}</select></label><p class="help">The filter belongs to the aggregate expression. Grouping, if needed, is configured on the surrounding transformation.</p>`;
}
function syncHybrid() {
  const s = states[active];
  if (active === 0) {
    const scale = Number(s.scale);
    const base = `${s.operandA} ${s.mathOp} ${s.operandB}`;
    const scaled =
      Number.isFinite(scale) && scale !== 1 ? `(${base}) * ${scale}` : base;
    s.c = s.cap === null ? scaled : `LEAST(${scaled}, ${s.cap})`;
  }
  if (active === 1)
    s.c = s.rules
      .map((r) =>
        r.operator === "ANY_OF"
          ? "(" +
            r.value
              .split(",")
              .map((v) => `${r.field} = ${JSON.stringify(v.trim())}`)
              .join(" OR ") +
            ")"
          : `${r.field} ${r.operator} ${JSON.stringify(r.value)}`,
      )
      .join(` ${s.group} `);
  if (active === 2)
    s.c = s.rates.length
      ? `CASE(${s.rates.map((r) => `achievement >= ${r.threshold}, ${r.rate}`).join(", ")}, ${s.fallback})`
      : String(s.fallback);
  if (active === 3)
    s.c = `${s.aggregate}_WHERE(sales.amount, sales.status = ${JSON.stringify(s.status)})`;
}
function result(side) {
  const output = $("#outcome-" + side);
  try {
    const s = states[active];
    const ir = compile(s[side]);
    const value = evaluate(ir, s.inputs);
    if (typeof value === "number" && !Number.isFinite(value))
      throw Error("Preview exceeds the supported number range.");
    const display =
      value === null
        ? "NULL"
        : typeof value === "boolean"
          ? value
            ? "Eligible"
            : "Not eligible"
          : active === 2
            ? `${Number((value * 100).toFixed(4))}%`
            : new Intl.NumberFormat("en-IN", {
                maximumFractionDigits: 4,
              }).format(value) + (active === 0 ? "%" : "");
    output.className = "outcome";
    output.innerHTML = `<small>BROWSER PREVIEW · ${active === 3 ? "4 sample rows" : "shared inputs"}</small><div class="value">${escapeHtml(display)}</div><small>${value === null ? "No value. Division by zero returns NULL." : active === 2 ? "Rate stored as " + value : "Valid within this demo’s supported subset."}</small>`;
    $("#json-" + side).textContent = JSON.stringify(ir, null, 2);
    return { value, ir };
  } catch (error) {
    output.className = "outcome error";
    output.innerHTML = `<strong>Fix this expression</strong><p>${escapeHtml(error.message)}</p>`;
    $("#json-" + side).textContent = "No valid expression to export.";
    return null;
  }
}
function refresh() {
  if ($("#hybrid-formula")) $("#hybrid-formula").textContent = states[active].c;
  const b = result("b"),
    c = result("c");
  $("#match").textContent =
    !b || !c
      ? "One editor has an invalid expression. Fix it to compare results."
      : JSON.stringify(b.ir) === JSON.stringify(c.ir)
        ? "Same expression JSON · same result"
        : b.value === c.value
          ? "Same sample result · different expressions. Matching one sample does not prove equivalence."
          : "Different results · your edits are independent. Compare the formulas and controls.";
}
function render() {
  const d = definitions[active],
    s = states[active];
  $("#scenarios").innerHTML = definitions
    .map(
      (d, i) =>
        `<button data-scenario="${i}" aria-pressed="${i === active}">${d.name}</button>`,
    )
    .join("");
  $("#scope").textContent = d.scope;
  $("#task").textContent = d.task;
  $("#challenge").textContent = d.challenge;
  $("#inputs").innerHTML =
    Object.entries(s.inputs)
      .map(
        ([key, value]) =>
          `<label>${escapeHtml(key)}<input data-input="${escapeHtml(key)}" type="${typeof d.inputs[key] === "number" ? "number" : "text"}" value="${escapeHtml(value)}"></label>`,
      )
      .join("") ||
    "<p>Fixed sales rows shown below. Change the status filter in either editor.</p>";
  $("#dataset").innerHTML =
    active === 3
      ? `<table class="data-table"><caption>Fictional sales input</caption><thead><tr><th>Row</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.amount.toLocaleString("en-IN")}</td><td>${r.status}</td></tr>`).join("")}</tbody></table>`
      : "";
  $("#workspace-b").innerHTML = formulaEditor("b");
  $("#workspace-c").innerHTML =
    hybridEditor() +
    '<div class="code-preview"><strong>Equivalent formula</strong><div id="hybrid-formula"></div></div>';
  refresh();
}
document.addEventListener("input", (event) => {
  const t = event.target,
    s = states[active];
  if (t.id.startsWith("formula-")) s[t.id.slice(-1)] = t.value;
  else if (t.dataset.input) {
    s.inputs[t.dataset.input] =
      t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value;
  } else if (t.dataset.rule !== undefined) {
    s.rules[+t.dataset.rule][t.dataset.key] = t.value;
    syncHybrid();
  } else if (t.dataset.rate !== undefined) {
    s.rates[+t.dataset.rate][t.dataset.key] =
      t.value === "" ? "" : Number(t.value);
    syncHybrid();
  } else if (t.dataset.math !== undefined) {
    if (t.dataset.math === "scale")
      s.scale = t.value === "" ? 1 : Number(t.value);
    else if (t.dataset.math === "cap")
      s.cap = t.value === "" ? null : Number(t.value);
    syncHybrid();
  } else if (t.id === "fallback") {
    s.fallback = t.value === "" ? "" : Number(t.value);
    syncHybrid();
  }
  refresh();
});
document.addEventListener("change", (event) => {
  const t = event.target,
    s = states[active];
  if (t.dataset.insert && t.value) {
    const textarea = $("#formula-" + t.dataset.insert);
    textarea.setRangeText(
      t.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      "end",
    );
    s[t.dataset.insert] = textarea.value;
    textarea.focus();
    t.value = "";
  }
  if (["group", "aggregate", "status"].includes(t.id)) {
    s[t.id] = t.value;
    syncHybrid();
  }
  if (t.dataset.rule !== undefined) {
    s.rules[+t.dataset.rule][t.dataset.key] = t.value;
    syncHybrid();
  }
  if (t.dataset.math !== undefined && t.tagName === "SELECT") {
    s[t.dataset.math] = t.value;
    syncHybrid();
  }
  refresh();
});
document.addEventListener("click", (event) => {
  const t = event.target.closest("button");
  if (!t) return;
  const s = states[active];
  if (t.dataset.scenario !== undefined) {
    active = +t.dataset.scenario;
    render();
    return;
  }
  if (t.id === "reset") {
    states[active] = defaults()[active];
    render();
    return;
  }
  if (t.id === "add-rule")
    s.rules.push({
      field: "emp.department",
      operator: "=",
      value: "Marketing",
    });
  else if (t.dataset.removeRule !== undefined)
    s.rules.splice(+t.dataset.removeRule, 1);
  else if (t.id === "add-rate") s.rates.push({ threshold: 60, rate: 0.01 });
  else if (t.dataset.removeRate !== undefined)
    s.rates.splice(+t.dataset.removeRate, 1);
  else if (t.dataset.up !== undefined) {
    const i = +t.dataset.up;
    if (i > 0) [s.rates[i - 1], s.rates[i]] = [s.rates[i], s.rates[i - 1]];
  } else return;
  syncHybrid();
  render();
});
$("#share").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.hash = encodeURIComponent(JSON.stringify({ version: 1, active, states }));
  history.replaceState(null, "", url);
  $("#toast").textContent = "Share link ready in the address bar. Copying…";
  $("#toast").classList.add("show-toast");
  try {
    await Promise.race([
      navigator.clipboard.writeText(url.href),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Clipboard unavailable")), 1500),
      ),
    ]);
    $("#toast").textContent =
      "Link copied, including current edits and inputs.";
  } catch {
    $("#toast").textContent =
      "Copy the URL from your address bar to share these edits.";
    location.hash = url.hash;
  }
  $("#toast").classList.add("show-toast");
  setTimeout(() => $("#toast").classList.remove("show-toast"), 4500);
});
render();
