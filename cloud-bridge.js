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
    return String(prompt || "{{inputs.1}}").replace(/\{\{\s*input\s*\}\}/g, "{{inputs.1}}");
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
      if (type === "ai") {
        config.model_id = resolveModel(n, models);
        config.prompt = mapPrompt(n.prompt);
        config.max_tokens = 1024;
        config.response = {kind: n.output === "image" ? "image" : "text", delivery: "complete"};
      } else if (type === "tool") {
        config.tool = ({uppercase: "upper", lowercase: "lower"})[n.toolKind] || String(n.toolKind || "unsupported");
        config.input = "{{inputs.1}}";
      } else if (type === "compiler") {
        config.source = "{{inputs.1}}";
      } else if (type === "condition") {
        const branches = asArray(n.branches);
        config.ports = branches.map(b => String(b.id));
        config.default_port = branches.length ? String(branches[branches.length - 1].id) : "";
        config.value = "{{inputs.1}}";
        config.rules = branches.filter(b => b.op === "==").map(b => ({equals: String(b.value), port: String(b.id)}));
      } else if (type === "output") {
        config.collect = [...new Set(edges.filter(e => e.target === n.id).map(e => e.source))];
      }
      return {id: String(n.id), type, config};
    });
    return {
      schema_version: 1, workflow_id: id, title: String(flow.name || "Untitled workflow"),
      inputs: {mimo_ui: flow},
      outputs: {}, nodes, edges
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
      toolKind: n.config?.tool === "upper" ? "uppercase" : n.config?.tool === "lower" ? "lowercase" : n.config?.tool || "trim",
      branches: asArray(n.config?.ports).map(port => ({id:port,label:port,op:"==",value:""})),
      accept: ["text","document","image","chat"], output: "text"
    }));
    return {
      kind:"mimo/workflow", version:4, name:definition?.title || "Imported cloud workflow",
      nodes, edges:asArray(definition?.edges).map(e=>({from:e.source,to:e.target,...(e.source_port && e.source_port !== "out" ? {branchId:e.source_port} : {})})),
      initialInput:{format:"text",text:"",fileName:""}, workflowGoal:"", customBlocks:{}
    };
  }
  function runIssues(flow, models) {
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
    for (const n of nodes) {
      const type = backendType(n);
      if(type!=="input" && !edges.some(e=>e.to===n.id)){
        errors.push("Connect an upstream block to ‘"+n.name+"’.");
      }
      if(type==="output" && !reachable.has(n.id)){
        errors.push("Output ‘"+n.name+"’ cannot be reached from an Input block.");
      }
      if (type === "ai" && !asArray(models).some(m=>m.id === resolveModel(n, models) && m.enabled)) {
        errors.push("Configure an enabled backend model for ‘" + n.name + "’ before cloud execution.");
      }
      if (type === "ai" && /\{\{\s*(?!input\s*\}\}|inputs\.\d+\s*\}\}|workflow\.input\s*\}\})[^}]+\}\}/.test(n.prompt || "")) {
        errors.push("‘" + n.name + "’ uses prompt variables not yet supported by the backend.");
      }
      if (type === "tool" && !["uppercase","lowercase"].includes(n.toolKind)) {
        errors.push("Tool ‘" + n.name + "’ (" + (n.toolKind || "unknown") + ") is preview-only.");
      }
      if (type === "compiler") errors.push("TikZ compilation is not yet enabled for production cloud runs.");
      if (type === "condition") {
        if (n.conditionMode === "ai" || asArray(n.branches).some(b=>b.op !== "==" && b.op !== "else")) {
          errors.push("‘" + n.name + "’ uses conditional routing not yet supported by the backend.");
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
