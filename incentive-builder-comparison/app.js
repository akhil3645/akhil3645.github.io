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
    formula: "net_sales / params.target_amount * 100",
    refs: [
      { key: "net_sales", type: "NUMBER", group: "Selections" },
      { key: "params.target_amount", type: "NUMBER", group: "Parameters" },
    ],
    functions: [
      {
        label: "COALESCE(number, number)",
        insert: "COALESCE(net_sales, 0)",
        hint: "First value that is not null",
      },
      {
        label: "LEAST(number, number)",
        insert: "LEAST(net_sales / params.target_amount * 100, 100)",
        hint: "Smallest value",
      },
      {
        label: "GREATEST(number, number)",
        insert: "GREATEST(net_sales, 0)",
        hint: "Largest value",
      },
      {
        label: "ABS(number)",
        insert: "ABS(net_sales - params.target_amount)",
        hint: "Absolute value",
      },
      {
        label: "CASE(condition, result, …, fallback)",
        insert: "CASE(net_sales >= params.target_amount, 1, 0)",
        hint: "First matching condition wins",
      },
    ],
    sample: [
      ["net_sales", 120000],
      ["params.target_amount", 100000],
    ],
  },
  {
    name: "Eligibility",
    formula: 'emp.department = "Sales" AND emp.status = "Active"',
    refs: [
      { key: "emp.department", type: "TEXT", group: "Employee" },
      { key: "emp.status", type: "TEXT", group: "Employee" },
    ],
    functions: [
      {
        label: "AND(condition, condition)",
        insert: 'AND(emp.department = "Sales", emp.status = "Active")',
        hint: "True when every condition is true",
      },
      {
        label: "OR(condition, condition)",
        insert: 'OR(emp.department = "Sales", emp.department = "Marketing")',
        hint: "True when any condition is true",
      },
      {
        label: "NOT(condition)",
        insert: 'NOT(emp.status = "Active")',
        hint: "Inverts a condition",
      },
    ],
    sample: [
      ["emp.department", "Sales"],
      ["emp.status", "Active"],
    ],
  },
  {
    name: "Conditional rate",
    formula:
      "CASE(achievement >= 120, 0.08,\n     achievement >= 100, 0.05,\n     achievement >= 80, 0.02, 0)",
    refs: [{ key: "achievement", type: "NUMBER", group: "Selections" }],
    functions: [
      {
        label: "CASE(condition, result, …, fallback)",
        insert:
          "CASE(achievement >= 120, 0.08, achievement >= 100, 0.05, achievement >= 80, 0.02, 0)",
        hint: "First matching condition wins",
      },
      {
        label: "COALESCE(number, number)",
        insert: "COALESCE(achievement, 0)",
        hint: "First value that is not null",
      },
      {
        label: "LEAST(number, number)",
        insert: "LEAST(achievement, 100)",
        hint: "Smallest value",
      },
      {
        label: "GREATEST(number, number)",
        insert: "GREATEST(achievement, 0)",
        hint: "Largest value",
      },
    ],
    sample: [["achievement", 125]],
  },
  {
    name: "Approved sales",
    formula: 'SUM_WHERE(sales.amount, sales.status = "Approved")',
    refs: [
      { key: "sales.amount", type: "NUMBER", group: "Source data" },
      { key: "sales.status", type: "TEXT", group: "Source data" },
    ],
    functions: [
      {
        label: "SUM(field)",
        insert: "SUM(sales.amount)",
        hint: "Totals the field over all rows",
      },
      {
        label: "AVERAGE(field)",
        insert: "AVERAGE(sales.amount)",
        hint: "Averages the field over all rows",
      },
      {
        label: "COUNT(field)",
        insert: "COUNT(sales.amount)",
        hint: "Counts rows where the field is not null",
      },
      {
        label: "SUM_WHERE(field, condition)",
        insert: 'SUM_WHERE(sales.amount, sales.status = "Approved")',
        hint: "Totals only rows that match the condition",
      },
      {
        label: "AVERAGE_WHERE(field, condition)",
        insert: 'AVERAGE_WHERE(sales.amount, sales.status = "Approved")',
        hint: "Averages only rows that match the condition",
      },
      {
        label: "COUNT_WHERE(field, condition)",
        insert: 'COUNT_WHERE(sales.amount, sales.status = "Approved")',
        hint: "Counts only rows that match the condition",
      },
    ],
    sample: [],
  },
];

const operators = [
  [" + ", "+ add"],
  [" - ", "− subtract"],
  [" * ", "× multiply"],
  [" / ", "÷ divide"],
  [" = ", "= equals"],
  [" != ", "≠ does not equal"],
  [" < ", "< less than"],
  [" <= ", "≤ less than or equal"],
  [" > ", "> greater than"],
  [" >= ", "≥ greater than or equal"],
  [" AND ", "AND"],
  [" OR ", "OR"],
];

const rows = [
  { amount: 60000, status: "Approved" },
  { amount: 40000, status: "Approved" },
  { amount: 15000, status: "Pending" },
  { amount: 5000, status: "Rejected" },
];

const defaults = () =>
  definitions.map((d) => ({
    b: d.formula,
    c: d.formula,
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
      saved.version === 2 &&
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

const definition = () => definitions[active];
const refByKey = () =>
  Object.fromEntries(definition().refs.map((r) => [r.key, r]));
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
const formulaError = (message, start, end) => {
  const error = new Error(message);
  error.start = start;
  error.end = end ?? start;
  return error;
};

function reference(name, token) {
  if (!(name in refByKey()))
    throw formulaError(
      `Unknown reference “${name}”. Choose one from References.`,
      token ? token.start : 0,
      token ? token.start + token.text.length : undefined,
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
    throw formulaError("Keep formulas under 5,000 characters.", 0, text.length);
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
      throw formulaError(
        `Unexpected character “${text[offset]}”. Use double quotes for text.`,
        offset,
        offset + 1,
      );
    tokens.push({ text: match[0], start: offset });
    offset += match[0].length;
  }
  let cursor = 0,
    depth = 0;
  const at = () => tokens[cursor];
  const errorAt = (message, token) =>
    formulaError(
      message,
      token ? token.start : text.length,
      token ? token.start + token.text.length : text.length,
    );
  function expression(min = 0) {
    if (++depth > 60) throw errorAt("Formula is too deeply nested.");
    let left;
    const token = at();
    cursor++;
    if (!token) throw errorAt("Expected a value or reference.");
    if (token.text === "(") {
      left = expression();
      if (at()?.text !== ")")
        throw errorAt("Missing closing parenthesis.", at());
      cursor++;
    } else if (token.text === "-")
      left = operation("SUBTRACT", constant(0), expression(6));
    else if (/^\d/.test(token.text)) left = constant(Number(token.text));
    else if (token.text[0] === '"') {
      try {
        left = constant(JSON.parse(token.text));
      } catch {
        throw errorAt("Invalid quoted text.", token);
      }
    } else if (/^(TRUE|FALSE)$/i.test(token.text))
      left = constant(token.text.toUpperCase() === "TRUE");
    else if (at()?.text === "(") {
      cursor++;
      const args = [];
      if (at()?.text !== ")") {
        do {
          args.push(expression());
          if (at()?.text !== ",") break;
          cursor++;
        } while (true);
      }
      const close = at();
      if (close?.text !== ")")
        throw errorAt("Expected a comma or closing parenthesis.", close);
      cursor++;
      const fn = token.text.toUpperCase();
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
        AND: [2, 99],
        OR: [2, 99],
        NOT: [1, 1],
        ABS: [1, 1],
      };
      if (!signatures[fn])
        throw errorAt(
          `Unsupported function ${token.text}. Pick one from Functions.`,
          token,
        );
      const [min, max] = signatures[fn];
      if (
        args.length < min ||
        args.length > max ||
        (fn === "CASE" && args.length % 2 !== 1)
      )
        throw errorAt(
          `${fn}: check the number of arguments${fn === "CASE" ? " (condition/result pairs, then fallback)" : ""}.`,
          token,
        );
      left = fn.endsWith("_WHERE")
        ? { ...operation(fn.replace("_WHERE", ""), args[0]), filter: args[1] }
        : operation(fn, ...args);
    } else left = reference(token.text, token);
    while (cursor < tokens.length) {
      const spec = binary[at().text.toUpperCase()];
      if (!spec || spec[0] < min) break;
      cursor++;
      left = operation(spec[1], left, expression(spec[0] + 1));
    }
    depth--;
    return left;
  }
  const result = expression();
  if (cursor !== tokens.length)
    throw errorAt(
      `Unexpected “${at().text}”. Add an operator between values.`,
      at(),
    );
  const type = checkType(result);
  const expected = active === 1 ? "BOOLEAN" : "NUMBER";
  if (type !== expected)
    throw formulaError(
      `This context needs ${expected.toLowerCase()}, but the expression returns ${type.toLowerCase()}.`,
      0,
      text.length,
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
    return refByKey()[key].type;
  }
  const op = node.operation;
  const aggregate = ["SUM", "AVERAGE", "COUNT"].includes(op);
  if (aggregate && (active !== 3 || insideAggregate))
    throw new Error(
      "Aggregates are only available in Approved sales and cannot be nested.",
    );
  const types = node.operands.map((n) =>
    checkType(n, insideAggregate || aggregate),
  );
  const need = (t) => {
    if (types.some((x) => x !== t))
      throw new Error(`${op} expects ${t.toLowerCase()} operands.`);
  };
  if (node.filter && checkType(node.filter, true) !== "BOOLEAN")
    throw new Error("Aggregate filter must return boolean.");
  if (op === "CASE") {
    for (let i = 0; i < types.length - 1; i += 2)
      if (types[i] !== "BOOLEAN")
        throw new Error("CASE conditions must be boolean.");
    const values = types.filter(
      (_, i) => i % 2 === 1 || i === types.length - 1,
    );
    if (new Set(values).size !== 1)
      throw new Error("CASE results must have the same type.");
    return values[0];
  }
  if (["AND", "OR"].includes(op)) {
    need("BOOLEAN");
    return "BOOLEAN";
  }
  if (op === "NOT") {
    need("BOOLEAN");
    return "BOOLEAN";
  }
  if (op === "ABS") {
    need("NUMBER");
    return "NUMBER";
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
    if (types[0] !== types[1])
      throw new Error("Compare values of the same type.");
    return "BOOLEAN";
  }
  if (op === "COUNT") return "NUMBER";
  if (op === "COALESCE") {
    if (new Set(types).size !== 1)
      throw new Error("COALESCE values must have the same type.");
    return types[0];
  }
  need("NUMBER");
  return "NUMBER";
}

function evaluate(node, sample) {
  if (node.type === "CONSTANT") return node.constantValue;
  if (node.type !== "OPERATION") {
    const key =
      node.selectionAlias ||
      (node.type === "VARIABLE"
        ? "params." + node.variableAlias
        : node.sourceAlias + "." + node.sourceField);
    if (!(key in sample)) throw new Error(`“${key}” needs an aggregate here.`);
    return sample[key];
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
      if (evaluate(args[i], sample) === true)
        return evaluate(args[i + 1], sample);
    return evaluate(args.at(-1), sample);
  }
  const values = args.map((n) => evaluate(n, sample)),
    [a, b] = values;
  if (op === "COALESCE") return values.find((v) => v !== null) ?? null;
  if (op === "AND")
    return values.includes(false) ? false : values.includes(null) ? null : true;
  if (op === "OR")
    return values.includes(true) ? true : values.includes(null) ? null : false;
  if (op === "NOT") return values[0] === null ? null : !values[0];
  if (op === "ABS") return Math.abs(a);
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

const option = (value, label, selected) =>
  `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label ?? value)}</option>`;

function referenceOptions() {
  const groups = new Map();
  definition().refs.forEach((r) => {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group).push(r);
  });
  return `<option value="">Insert reference…</option>${[...groups]
    .map(
      ([label, refs]) =>
        `<optgroup label="${escapeHtml(label)}">${refs
          .map((r) => option(r.key, `${r.key} · ${r.type.toLowerCase()}`))
          .join("")}</optgroup>`,
    )
    .join("")}`;
}
function operatorOptions() {
  return `<option value="">Insert operator…</option>${operators
    .map(([insert, label]) => option(insert, label))
    .join("")}`;
}
function functionOptions() {
  return `<option value="">Functions…</option>${definition()
    .functions.map(
      (f) =>
        `<option value="${escapeHtml(f.insert)}" title="${escapeHtml(f.hint)}">${escapeHtml(f.label)}</option>`,
    )
    .join("")}`;
}

function highlightFormula(text) {
  const parts = [];
  let last = 0,
    match;
  const pattern =
    /(?:"(?:[^"\\]|\\.)*"|\b(?:AND|OR|NOT|TRUE|FALSE|NULL)\b|[A-Za-z_][\w.]*|\d+(?:\.\d+)?|>=|<=|!=|[(),+\-*/%<>=!])/g;
  while ((match = pattern.exec(text))) {
    if (match.index > last)
      parts.push(escapeHtml(text.slice(last, match.index)));
    const t = match[0];
    let cls = "tok-op";
    if (t[0] === '"') cls = "tok-string";
    else if (/^(AND|OR|NOT|TRUE|FALSE|NULL)$/i.test(t)) cls = "tok-key";
    else if (/^\d/.test(t)) cls = "tok-num";
    else if (/^[A-Za-z_]/.test(t))
      cls = /^\s*\(/.test(text.slice(match.index + t.length))
        ? "tok-fn"
        : "tok-ref";
    parts.push(`<span class="${cls}">${escapeHtml(t)}</span>`);
    last = match.index + t.length;
  }
  if (last < text.length) parts.push(escapeHtml(text.slice(last)));
  return parts.join("") + "\n";
}

function syncHighlight() {
  $("#highlight-b").innerHTML = highlightFormula(states[active].b);
  $("#highlight-b").scrollTop = $("#formula-b").scrollTop;
}

function selectFirstArgument(textarea, insertedAt) {
  const text = textarea.value;
  const open = text.indexOf("(", insertedAt);
  if (open < 0) return;
  let depth = 0,
    end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    } else if (text[i] === "," && depth === 1) {
      end = i;
      break;
    }
  }
  if (end > open) textarea.setSelectionRange(open + 1, end);
}

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(value);

function sampleSummary() {
  const d = definition();
  if (!d.sample.length)
    return `4 sample rows · status = ${states[active].status}`;
  return d.sample
    .map(
      ([key, value]) =>
        `${key} ${typeof value === "number" ? formatNumber(value) : value}`,
    )
    .join(" · ");
}

function outcomeHtml(value) {
  const display =
    value === null
      ? "NULL"
      : typeof value === "boolean"
        ? value
          ? "Eligible"
          : "Not eligible"
        : active === 2
          ? `${Number((value * 100).toFixed(4))}%`
          : formatNumber(value) + (active === 0 ? "%" : "");
  return `<small>BROWSER PREVIEW · ${escapeHtml(sampleSummary())}</small><div class="value">${escapeHtml(display)}</div>`;
}

function panelResult(side) {
  const output = $("#outcome-" + side);
  try {
    const ir = compile(states[active][side]);
    const value = evaluate(ir, Object.fromEntries(definition().sample));
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Preview exceeds the supported number range.");
    output.className = "outcome";
    output.innerHTML = outcomeHtml(value);
    $("#json-" + side).textContent = JSON.stringify(ir, null, 2);
    return { value, ir };
  } catch (error) {
    output.className = "outcome error";
    output.innerHTML = `<small>FIX THIS EXPRESSION</small><p>${escapeHtml(error.message)}</p>`;
    $("#json-" + side).textContent = "No valid expression to export.";
    return { error };
  }
}

function updateStatus() {
  const status = $("#status-b");
  try {
    compile(states[active].b);
    status.textContent = "No issues";
    status.className = "text-xs text-hybrid";
  } catch (error) {
    status.textContent = error.message;
    status.className = "text-xs text-red-700";
  }
}

function updateB() {
  syncHighlight();
  updateStatus();
  return panelResult("b");
}

function updateC() {
  const s = states[active];
  $("#hybrid-formula").textContent = s.c;
  return panelResult("c");
}

function updateMatch(b, c) {
  $("#match").textContent =
    !b || !c || b.error || c.error
      ? "Fix the highlighted expression to compare results."
      : JSON.stringify(b.ir) === JSON.stringify(c.ir)
        ? "Same expression JSON · same result"
        : b.value === c.value
          ? "Same result · different expressions"
          : "Different results · your edits are independent";
}

function refresh() {
  const b = updateB(),
    c = updateC();
  updateMatch(b, c);
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

function hybridControls() {
  const s = states[active];
  if (active === 0) {
    const refs = definition().refs;
    return `<div class="rule"><label>Value<select data-math="operandA">${refs
      .map((r) => option(r.key, r.key, s.operandA))
      .join(
        "",
      )}</select></label><label>Operator<select data-math="mathOp">${option("/", "÷ divide", s.mathOp)}${option("*", "× multiply", s.mathOp)}${option("+", "+ add", s.mathOp)}${option("-", "− subtract", s.mathOp)}</select></label><label>By<select data-math="operandB">${refs
      .map((r) => option(r.key, r.key, s.operandB))
      .join(
        "",
      )}</select></label></div><div class="two-fields"><label>Convert to percent (×)<input type="number" data-math="scale" value="${s.scale}"></label><label>Cap at % — blank means no cap<input type="number" data-math="cap" value="${s.cap ?? ""}"></label></div>`;
  }
  if (active === 1)
    return `<label>Match<select id="group">${option("AND", "ALL conditions", s.group)}${option("OR", "ANY condition", s.group)}</select></label><div>${s.rules
      .map(
        (r, i) =>
          `<div class="rule"><label>Field<select data-rule="${i}" data-key="field">${definition()
            .refs.map((f) => option(f.key, f.key, r.field))
            .join(
              "",
            )}</select></label><label>Operator<select data-rule="${i}" data-key="operator">${option("=", "equals", r.operator)}${option("!=", "does not equal", r.operator)}${option("ANY_OF", "is one of", r.operator)}</select></label><label>Value<input data-rule="${i}" data-key="value" value="${escapeHtml(r.value)}"></label><button data-remove-rule="${i}" aria-label="Remove condition ${i + 1}">×</button></div>`,
      )
      .join("")}</div><button id="add-rule">+ Add condition</button>`;
  if (active === 2)
    return `${s.rates
      .map(
        (r, i) =>
          `<div class="rate"><label>Achievement ≥<input type="number" data-rate="${i}" data-key="threshold" value="${r.threshold}"></label><label>Return rate (decimal)<input type="number" step="0.01" data-rate="${i}" data-key="rate" value="${r.rate}"></label><div><button data-up="${i}" aria-label="Move rate ${i + 1} up" ${i === 0 ? "disabled" : ""}>↑</button><button data-remove-rate="${i}" aria-label="Remove rate ${i + 1}">×</button></div></div>`,
      )
      .join(
        "",
      )}<label>Otherwise<input id="fallback" type="number" step="0.01" value="${s.fallback}"></label><button id="add-rate" style="margin-top:12px">+ Add condition / rate</button><p class="help">First match wins · applies to the full amount.</p>`;
  return `<div class="two-fields"><label>Operation<select id="aggregate">${["SUM", "AVERAGE", "COUNT"].map((v) => option(v, v, s.aggregate)).join("")}</select></label><label>Value<select aria-label="Aggregation value"><option>sales.amount</option></select></label></div><h3 class="mt-4 mb-1 text-sm font-bold">Filter included rows</h3><label>sales.status equals<select id="status">${["Approved", "Pending", "Rejected"].map((v) => option(v, v, s.status)).join("")}</select></label><table class="data-table mt-3"><thead><tr><th>Amount</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.amount.toLocaleString("en-IN")}</td><td>${r.status}</td></tr>`).join("")}</tbody></table>`;
}

function render() {
  $("#scenarios").innerHTML = definitions
    .map(
      (d, i) =>
        `<button data-scenario="${i}" aria-pressed="${i === active}">${d.name}</button>`,
    )
    .join("");
  $("#refs-b").innerHTML = referenceOptions();
  $("#ops-b").innerHTML = operatorOptions();
  $("#fns-b").innerHTML = functionOptions();
  const textarea = $("#formula-b");
  textarea.value = states[active].b;
  $("#workspace-c").innerHTML =
    hybridControls() +
    '<div class="code-preview"><strong>Generated expression</strong><div id="hybrid-formula"></div></div>';
  refresh();
}

document.addEventListener("input", (event) => {
  const t = event.target,
    s = states[active];
  if (t.id === "formula-b") s.b = t.value;
  else if (t.dataset.rule !== undefined) {
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
  if (t.id === "refs-b" || t.id === "ops-b" || t.id === "fns-b") {
    if (!t.value) return;
    const textarea = $("#formula-b");
    const start = textarea.selectionStart;
    textarea.setRangeText(t.value, start, textarea.selectionEnd, "end");
    if (t.id === "fns-b") selectFirstArgument(textarea, start);
    s.b = textarea.value;
    textarea.focus();
    t.value = "";
    refresh();
    return;
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
  if (t.dataset.reset !== undefined) {
    const fresh = defaults()[active];
    if (t.dataset.reset === "b") s.b = fresh.b;
    else Object.assign(s, fresh, { b: s.b });
    render();
    return;
  }
  if (t.id === "check-b") {
    try {
      compile(s.b);
      $("#status-b").textContent = "No issues found";
      $("#status-b").className = "text-xs text-hybrid";
    } catch (error) {
      const textarea = $("#formula-b");
      textarea.focus();
      textarea.setSelectionRange(error.start, error.end);
      $("#status-b").textContent = error.message;
      $("#status-b").className = "text-xs text-red-700";
    }
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

$("#formula-b").addEventListener("scroll", () => {
  $("#highlight-b").scrollTop = $("#formula-b").scrollTop;
  $("#highlight-b").scrollLeft = $("#formula-b").scrollLeft;
});

$("#share").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.hash = encodeURIComponent(JSON.stringify({ version: 2, active, states }));
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
    $("#toast").textContent = "Link copied, including current edits.";
  } catch {
    $("#toast").textContent = "Copy the URL from your address bar to share.";
  }
  setTimeout(() => $("#toast").classList.remove("show-toast"), 4500);
});

render();
