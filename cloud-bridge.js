/* Mimo Workflow Studio ↔ FastAPI v1 adapter. No credentials live here. */
(function (root) {
  "use strict";
  const asArray = value => Array.isArray(value) ? value : [];
  const backendType = node => {
    if (node.type === "input" || node.type === "output") return node.type;
    const execution = node.execution || (node.type === "condition" ? "condition" : ["tool", "tikz"].includes(node.type) ? "tool" : "ai");
    if (execution === "condition") return "condition";
    if (execution === "tool") return node.toolKind === "tikz" || node.type === "tikz" ? "compiler" : "tool";
    return "ai";
  };
  function resolveModel(node, models) {
    const match = asArray(models).find(m => m.enabled && (
      m.id === node.model || (m.remote_model_id === node.model &&
      (!node.provider || m.display_name.toLowerCase().includes(String(node.provider).toLowerCase()) ||
       m.provider.toLowerCase() === String(node.provider).toLowerCase()))
    ));
    return match ? match.id : String(node.model || "");
  }
  function mapPrompt(prompt) {
    // In v3.3 {{input}} refers to the current node's incoming text.
    return String(prompt || "{{input}}");
  }
  function guideFor(flow,node) {
    const lines = [
      "WORKFLOW: " + String(flow.name || "Untitled"),
      "OVERALL GOAL: " + String(flow.workflowGoal || "Not specified"),
      "BLOCKS:"
    ];
    for (const step of flow.nodes) {
      lines.push(String(step.id) + " — " + String(step.name || step.type) +
        " [" + String(backendType(step)) + "]: " + String(step.prompt || "").slice(0,3000));
    }
    lines.push("CONNECTIONS:");
    for (const edge of flow.edges) {
      lines.push(String(edge.from) + " -> " + String(edge.to));
    }
    return lines.join("\n").slice(0,32000) + "\n" +
      "Use this guide for context only; perform just your assigned block task.\n";
  }
  function toBackend(flow, workflowId, models) {
    if (!flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) throw Error("Invalid Mimo canvas");
    const id = String(workflowId || "draft").slice(0, 64);
    const edges = flow.edges.map(e => ({
      source: String(e.from), target: String(e.to),
      source_port: String(e.branchId || "out"), target_port: "in"
    }));
    const nodes = flow.nodes.map(n => {
      const type = backendType(n), config = {};
      if(type !== "input" && type !== "output") {
        config.input_source = n.source || "connected";
        config.input_combine = n.combine || "all";
        config.manual_input = n.manualInput || "";
      }
      if (type === "ai") {
        config.model_id = resolveModel(n, models);
        config.prompt = (n.includeWorkflowGuide ? guideFor(flow,n)+"\nASSIGNED TASK:\n" : "") + mapPrompt(n.prompt);
        // Each AI node controls its own completion budget; reasoning tokens count.
        // Existing workflows without the setting retain the previous 1024 cap.
        const budget = Number(n.maxTokens ?? 1024);
        config.max_tokens = Number.isInteger(budget) && budget >= 64 && budget <= 16384 ? budget : 1024;
        config.response = {kind: ["image","json","code","chat"].includes(n.output)?n.output:"text", delivery:"complete"};
        if (n.output==="image") {
          config.response.size = n.imageSize||"1024x1024";
          config.response.n = Number(n.imageCount||1);
        }
      } else if (type === "tool") {
        config.tool = ({uppercase: "upper", lowercase: "lower", trim: "trim", replace: "replace", "json-field": "json_field"})[n.toolKind] || String(n.toolKind || "unsupported");
        config.input = "{{inputs.1}}";
        if (n.toolKind === "replace") {config.find = n.toolFind || ""; config.replacement = n.toolReplacement || "";}
        if (n.toolKind === "json-field") config.field = n.toolField || "";
      } else if (type === "compiler") {
        config.source = "{{inputs.1}}";
        config.target = n.compilerTarget === "png" ? "png" : "pdf";
      } else if (type === "condition") {
        const branches = asArray(n.branches);
        config.ports = branches.map(b => String(b.id));
        config.default_port = branches.length ? String(branches[branches.length - 1].id) : "";
        config.value = "{{inputs.1}}";
        config.mode = "numeric";
        config.field = String(n.conditionField || "");
        config.rules = branches.filter(b => b.op !== "else").map(b => ({op: String(b.op), threshold: String(b.value), port: String(b.id)}));
      } else if (type === "output") {
        config.collect = [...new Set(edges.filter(e => e.target === n.id).map(e => e.source))];
      }
      return {id: String(n.id), type, config};
    });
    return {
      schema_version: 1, workflow_id: id, title: String(flow.name || "Untitled workflow"),
      inputs: {mimo_ui: flow},
      outputs: flow.outputContract === "quizer.problems.v1"
        ? {contract:"quizer.problems.v1",source_node:String(flow.outputSource||"")}
        : {}, nodes, edges
    };
  }
  function fromBackend(definition) {
    const embedded = definition?.inputs?.mimo_ui;
    if (embedded?.kind === "mimo/workflow" && Array.isArray(embedded.nodes) && Array.isArray(embedded.edges)) {
      return JSON.parse(JSON.stringify(embedded));
    }
    const nodes = asArray(definition?.nodes).map((n, i) => ({
      id: String(n.id), type: n.type === "ai" ? "spark" : n.type === "compiler" ? "tikz" : n.type,
      name: String(n.config?.name || n.type), x: 60 + (i % 4) * 320, y: 130 + Math.floor(i / 4) * 240,
      execution: n.type === "tool" || n.type === "compiler" ? "tool" : n.type === "condition" ? "condition" : "ai",
      prompt: n.config?.prompt || "", model: n.config?.model_id || "",
      maxTokens: n.config?.max_tokens || 1024,
      toolKind: n.config?.tool === "upper" ? "uppercase" : n.config?.tool === "lower" ? "lowercase" : n.config?.tool || "trim",
      branches: asArray(n.config?.ports).map(port => ({id:port,label:port,op:"==",value:""})),
      accept: ["text","document","image","chat"], output: n.config?.response?.kind || "text"
    }));
    return {
      kind:"mimo/workflow", version:4, name:definition?.title || "Imported cloud workflow",
      nodes, edges:asArray(definition?.edges).map(e=>({from:e.source,to:e.target,...(e.source_port && e.source_port !== "out" ? {branchId:e.source_port} : {})})),
      initialInput:{format:"text",text:"",fileName:""}, workflowGoal:"", customBlocks:{},
      ...(definition?.outputs?.contract === "quizer.problems.v1" ? {
        outputContract:"quizer.problems.v1",outputSource:definition.outputs.source_node
      } : {})
    };
  }
  function runIssues(flow, models, capabilities = {}) {
    const errors = [];
    const nodes = asArray(flow?.nodes), edges = asArray(flow?.edges);
    if (!nodes.some(n=>n.type==="input") || !nodes.some(n=>n.type==="output")) errors.push("A cloud run needs an Input and Output block.");
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const reachable=new Set(nodes.filter(n=>n.type==="input").map(n=>n.id));
    let changed=true;
    while(changed) {
      changed=false;
      for(const edge of edges) {
        if(reachable.has(edge.from)&&!reachable.has(edge.to)) {
          reachable.add(edge.to);changed=true;
        }
      }
    }
    for(const edge of edges){
      if(!byId.has(edge.from)||!byId.has(edge.to)){
        errors.push("A connection references a block that no longer exists.");
      }
    }
    if (flow?.outputContract === "quizer.problems.v1") {
      const source = nodes.find(n => n.id === flow.outputSource);
      if (!source || backendType(source) !== "ai" || source.output !== "json")
        errors.push("Quizer output contract requires a JSON AI source block.");
      if (!edges.some(e => e.from === flow.outputSource && nodes.some(n => n.id === e.to && backendType(n) === "output")))
        errors.push("Connect the Quizer JSON source block directly to an Output block.");
    }
    for (const n of nodes) {
      const type = backendType(n);
      if(type!=="input" && !edges.some(e=>e.to===n.id)){
        errors.push("Connect an upstream block to ‘"+n.name+"’.");
      }
      if(type==="output" && !reachable.has(n.id)){
        errors.push("Output ‘"+n.name+"’ cannot be reached from an Input block.");
      }
      if (type !== "input" && type !== "output") {
        if (n.source && !["connected","workflow","manual"].includes(n.source))
          errors.push("Unknown input source for " + n.name + ".");
        if (n.combine && !["all","first","latest"].includes(n.combine))
          errors.push("Unknown input combination for " + n.name + ".");
        if (n.source === "manual" && !String(n.manualInput||"").trim())
          errors.push("Manual input is empty for " + n.name + ".");
      }
      if (type === "ai" && !asArray(models).some(m=>m.id === resolveModel(n, models) && m.enabled)) {
        errors.push("Configure an enabled backend model for ‘" + n.name + "’ before cloud execution.");
      }
      if(type === "ai" && n.maxTokens !== undefined &&
         (!Number.isInteger(Number(n.maxTokens)) || Number(n.maxTokens)<64 || Number(n.maxTokens)>16384)) {
        errors.push("Output-token budget for ‘" + n.name + "’ must be a whole number from 64 to 16384.");
      }
      if (type === "ai") {
        for (const match of String(n.prompt||"").matchAll(/\{\{\s*([^}]+)\s*\}\}/g)) {
          const token=match[1].trim();
          if(!/^(input|workflow\.input(?:\.[A-Za-z0-9_-]+)*|inputs\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/.test(token))
            errors.push("Unsupported prompt variable in "+n.name+": "+token);
        }
      }
      if (type === "tool" && !["uppercase","lowercase","trim","replace","json-field"].includes(n.toolKind)) {
        errors.push("Tool ‘" + n.name + "’ (" + (n.toolKind || "unknown") + ") is preview-only.");
      }
      if (type === "tool" && n.toolKind === "replace" && !n.toolFind) errors.push("Replace tool needs a search string.");
      if (type === "tool" && n.toolKind === "json-field" && !n.toolField) errors.push("JSON field tool needs a property path.");
      if (type === "compiler") {
        if (!capabilities?.compiler?.enabled)
          errors.push("TikZ compiler service is not enabled. Deploy the private compiler and configure COMPILER_URL.");
        if (n.toolEngine && n.toolEngine !== "pdflatex")
          errors.push("TikZ cloud compilation currently supports pdflatex only.");
        if (n.compilerTarget && !["pdf", "png"].includes(n.compilerTarget))
          errors.push("TikZ cloud compilation currently returns PDF or PNG only.");
      }
      if (type === "condition") {
        if (n.conditionMode === "ai") errors.push("AI-based routing is not supported in cloud yet.");
        for (const branch of asArray(n.branches)) {
          if (branch.op !== "else" && (!["<","<=",">",">=","==","!="].includes(branch.op) || !Number.isFinite(Number(branch.value)) || String(branch.value).trim() === "")) errors.push("Invalid numeric condition in " + n.name + ": " + branch.label);
        }
        for (const branch of asArray(n.branches)) {
          if (!edges.some(e=>e.from === n.id && e.branchId === branch.id)) {
            errors.push("‘" + n.name + "’ needs a connection for branch " + branch.label + ".");
          }
        }
      }
      if (type === "output" && !edges.some(e=>e.to===n.id)) errors.push("Output ‘" + n.name + "’ has no incoming connection.");
    }
    return [...new Set(errors)];
  }
  const API = {toBackend, fromBackend, runIssues, backendType, resolveModel};
  root.MimoBridge = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
