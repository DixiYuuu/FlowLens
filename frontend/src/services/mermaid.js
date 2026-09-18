import mermaid from "mermaid";

let initialized = false;

export function initMermaid() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "strict",
    flowchart: {
      curve: "basis",
      htmlLabels: true,
      useMaxWidth: false,
    },
    themeVariables: {
      primaryColor: "#e7f0ff",
      primaryBorderColor: "#5d7fa8",
      secondaryColor: "#edf4f3",
      tertiaryColor: "#f7f9fc",
      lineColor: "#7b8da3",
      fontFamily: "Inter, PingFang SC, Microsoft YaHei, sans-serif",
      textColor: "#172033",
    },
  });
  initialized = true;
}

export async function renderMermaid(code) {
  initMermaid();
  const id = `m-${Date.now()}`;
  return mermaid.render(id, code);
}
