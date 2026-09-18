import { useEffect, useMemo, useRef, useState } from "react";
import { buildPlan, streamAgentChat } from "./services/api";
import { renderMermaid } from "./services/mermaid";

const MODES = [
  { key: "inspire", label: "灵感探索", caption: "将一个想法扩展成完整结构" },
  { key: "standard", label: "规范生成", caption: "梳理需求并生成流程图" },
  { key: "plan", label: "线性计划", caption: "将步骤快速转换为流程" },
  { key: "code", label: "Mermaid", caption: "编辑并即时渲染代码" },
];
const FLOW_STEPS = [
  { key: "start", label: "任务启动" }, { key: "optimizing", label: "语义整理" },
  { key: "generating", label: "结构生成" }, { key: "creating", label: "图谱构建" },
  { key: "validating", label: "语法校验" },
];
const PLACEHOLDERS = {
  plan: "按行输入研究或工作步骤，例如：\n确定问题\n采集数据\n分析与建模\n形成结论",
  code: "flowchart TD\n  A[Research Question] --> B[Data Collection]\n  B --> C[Analysis]",
  standard: "描述你的需求、约束和目标。系统会先规范化表述，再生成清晰的流程结构。",
  inspire: "输入一个主题或初步灵感，例如：构建一个面向实验室的样本管理流程。",
};

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function applyDirection(code, direction) {
  const lines = (code || "").split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return "";
  const first = lines[index];
  if (/^(flowchart|graph)\s+(TD|LR|TB|BT|RL)\b/i.test(first.trim())) lines[index] = first.replace(/^(\s*)(flowchart|graph)\s+(TD|LR|TB|BT|RL)\b/i, `$1$2 ${direction}`);
  else if (/^(flowchart|graph)\b/i.test(first.trim())) lines[index] = first.replace(/^(\s*)(flowchart|graph)\b/i, `$1$2 ${direction}`);
  else lines.unshift(`flowchart ${direction}`);
  return lines.join("\n");
}
function FlowOverlay({ phase, message, onCancel }) {
  const current = Math.max(0, FLOW_STEPS.findIndex((step) => step.key === phase));
  return <div className="flow-overlay" role="status" aria-live="polite"><div className="flow-glow" /><div className="flow-card">
    <div className="flow-kicker"><span className="pulse-dot" />AUTOFLOW · LIVE PIPELINE</div><div className="flow-heading">正在构建图谱</div><p>{message || "正在准备生成任务"}</p>
    <ol className="flow-steps">{FLOW_STEPS.map((step, index) => <li key={step.key} className={index < current ? "complete" : index === current ? "current" : ""}><span>{index < current ? "✓" : String(index + 1).padStart(2, "0")}</span>{step.label}</li>)}</ol>
    <button className="cancel-run" onClick={onCancel}>取消本次生成</button>
  </div></div>;
}
function FlowLensMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M8 20h9m6-9v18m0-9h9" /><circle cx="7" cy="20" r="3" /><circle cx="21" cy="11" r="3" /><circle cx="21" cy="29" r="3" /><circle cx="33" cy="20" r="3" /></svg></span>;
}

export default function App() {
  const [mode, setMode] = useState("plan"); const [direction, setDirection] = useState("TD");
  const [input, setInput] = useState(""); const [chatInput, setChatInput] = useState("");
  const [mermaidCode, setMermaidCode] = useState("flowchart TD\n  A[FlowLens] --> B[Ready]");
  const [svg, setSvg] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [flowStatus, setFlowStatus] = useState({ phase: "start", message: "等待任务开始" });
  const [chatMap, setChatMap] = useState({ standard: [], inspire: [] }); const [zoom, setZoom] = useState(1);
  const previewRef = useRef(null); const abortRef = useRef(null); const dragRef = useRef({ active: false });
  const isChatMode = mode === "standard" || mode === "inspire";
  const previewCode = useMemo(() => applyDirection(mermaidCode, direction), [mermaidCode, direction]);
  const activeMode = MODES.find((item) => item.key === mode); const currentChat = chatMap[mode] || [];
  const canGenerate = (isChatMode ? chatInput : mode === "code" ? mermaidCode : input).trim().length > 0;

  useEffect(() => { let cancelled = false; async function draw() { if (!previewCode.trim()) return setSvg(""); try { const result = await renderMermaid(previewCode); if (!cancelled) { setSvg(result.svg); setError(""); } } catch (renderError) { if (!cancelled) setError(`流程图渲染失败：${renderError.message}`); } } draw(); return () => { cancelled = true; }; }, [previewCode]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const appendChat = (target, message) => setChatMap((previous) => ({ ...previous, [target]: [...(previous[target] || []), message] }));
  const clampZoom = (value) => Math.min(2.5, Math.max(0.35, value));
  const fitToView = () => { const container = previewRef.current; const element = container?.querySelector("svg"); if (!container || !element) return; const viewBox = element.viewBox.baseVal; const width = viewBox.width || element.clientWidth; const height = viewBox.height || element.clientHeight; if (width && height) setZoom(clampZoom(Math.min((container.clientWidth - 64) / width, (container.clientHeight - 64) / height))); };
  const runAgent = async () => {
    const prompt = chatInput.trim(); const modeKey = mode; appendChat(modeKey, { role: "user", content: prompt }); setChatInput("");
    const controller = new AbortController(); abortRef.current = controller; let settled = false;
    await streamAgentChat({ mode: modeKey, prompt, direction }, ({ data }) => {
      if (data.type === "status") setFlowStatus({ phase: data.phase, message: data.message });
      if (data.type === "result") { settled = true; setMermaidCode(data.mermaid_code || ""); setZoom(1); setFlowStatus({ phase: "validating", message: data.valid ? "流程图已通过校验" : "已生成，建议检查图表结构" }); if (modeKey === "standard" && data.optimized_text) appendChat(modeKey, { role: "assistant", title: "规范化描述", content: data.optimized_text }); appendChat(modeKey, { role: "assistant", title: "Mermaid 图谱", content: data.mermaid_code || "", code: true }); }
      if (data.type === "error") { settled = true; setError(data.message || "生成失败，请重试。"); }
    }, controller.signal);
    if (!settled) throw new Error("服务响应中断，请重试。");
  };
  const generate = async () => { setError(""); setLoading(true); setFlowStatus({ phase: "start", message: mode === "plan" ? "正在建立线性流程" : "正在准备生成任务" }); try { if (mode === "plan") { const data = await buildPlan(input, direction); setMermaidCode(data.mermaid_code || ""); setZoom(1); } else if (mode === "code") { setMermaidCode((value) => value); } else await runAgent(); } catch (requestError) { if (requestError.name !== "AbortError") setError(requestError.message || "请求失败，请重试。"); } finally { abortRef.current = null; setLoading(false); } };
  const beginDrag = (event) => { if (!svg || !previewRef.current) return; dragRef.current = { active: true, x: event.clientX, y: event.clientY, left: previewRef.current.scrollLeft, top: previewRef.current.scrollTop }; };
  const drag = (event) => { if (!dragRef.current.active || !previewRef.current) return; previewRef.current.scrollLeft = dragRef.current.left - (event.clientX - dragRef.current.x); previewRef.current.scrollTop = dragRef.current.top - (event.clientY - dragRef.current.y); };
  return <div className="app-shell"><header className="app-header"><div className="brand"><FlowLensMark /><div><h1>FlowLens</h1><p>STRUCTURE TO DIAGRAM</p></div></div><div className="header-status"><span className="status-light" />SYSTEM READY</div></header>
    <main className="workbench"><aside className="composer-panel"><div className="panel-eyebrow">01 / INPUT LAB</div><div className="mode-grid">{MODES.map((item) => <button key={item.key} className={`mode-card ${mode === item.key ? "selected" : ""}`} onClick={() => setMode(item.key)}><strong>{item.label}</strong><span>{item.caption}</span></button>)}</div><div className="input-head"><div><h2>{activeMode.label}</h2><p>{activeMode.caption}</p></div><span className="direction-badge">{direction}</span></div>
      {isChatMode ? <div className="chat-area"><div className="chat-history">{currentChat.length ? currentChat.map((message, index) => <article key={index} className={`message ${message.role}`}><span>{message.role === "user" ? "YOU" : "AI"}</span>{message.title && <h3>{message.title}</h3>}{message.code ? <pre>{message.content}</pre> : <p>{message.content}</p>}</article>) : <div className="empty-state">从一个研究主题或清晰需求开始，FlowLens 将把它组织为可验证的流程结构。</div>}</div><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={PLACEHOLDERS[mode]} rows="5" /></div> : <textarea className="editor" value={mode === "code" ? mermaidCode : input} onChange={(event) => mode === "code" ? setMermaidCode(event.target.value) : setInput(event.target.value)} placeholder={PLACEHOLDERS[mode]} />}
      <div className="generate-row"><span>{isChatMode ? "⌘ / Ctrl + Enter 发送" : "生成后可在右侧调整方向与视图"}</span><button className="generate-button" disabled={!canGenerate || loading} onClick={generate}>{loading ? "正在生成" : "生成图谱"}<b>→</b></button></div>{error && <div className="error-banner">{error}</div>}</aside>
      <section className="canvas-panel"><div className="canvas-toolbar"><div><div className="panel-eyebrow">02 / VISUAL CANVAS</div><h2>流程图预览</h2></div><div className="toolbar-actions"><div className="segmented"><button className={direction === "TD" ? "active" : ""} onClick={() => setDirection("TD")}>纵向</button><button className={direction === "LR" ? "active" : ""} onClick={() => setDirection("LR")}>横向</button></div><button onClick={() => setZoom(clampZoom(zoom - 0.1))}>−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom(clampZoom(zoom + 0.1))}>+</button><button onClick={fitToView}>适应</button><button onClick={() => downloadText("autoflow.mmd", previewCode)}>MMD</button><button onClick={() => downloadText("autoflow.svg", svg)} disabled={!svg}>SVG</button></div></div><div className={`diagram-canvas ${svg ? "" : "is-empty"}`} ref={previewRef} onMouseDown={beginDrag} onMouseMove={drag} onMouseUp={() => { dragRef.current.active = false; }} onMouseLeave={() => { dragRef.current.active = false; }}><div className="canvas-orbit orbit-one" /><div className="canvas-orbit orbit-two" />{svg ? <div className="diagram-scale" style={{ transform: `scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="canvas-empty"><span>◇</span><p>等待流程输入</p></div>}</div></section></main>{loading && <FlowOverlay phase={flowStatus.phase} message={flowStatus.message} onCancel={() => abortRef.current?.abort()} />}</div>;
}
