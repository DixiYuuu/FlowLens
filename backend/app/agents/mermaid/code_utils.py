import re


def extract_mermaid(text: str) -> str:#利用正则表达式从 AI 的回答中精准提取出 mermaid ...  代码块。
    if not text:
        return ""

    fenced = re.findall(r"```(?:mermaid)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fenced:
        return fenced[0].strip()

    return text.strip()


#提取的是“给流程图生成前用的优化后文字描述”。
def extract_optimized_text(text: str) -> str:
    if not text:
        return ""

    marker_start = "【优化后规范描述】"
    marker_start_alt = "【优化后描述】"
    marker_code = "【Mermaid 流程图代码】"

    if marker_start in text and marker_code in text:
        return text.split(marker_start, 1)[1].split(marker_code, 1)[0].strip()

    if marker_start_alt in text and marker_code in text:
        return text.split(marker_start_alt, 1)[1].split(marker_code, 1)[0].strip()

    fenced_removed = re.sub(r"```(?:mermaid)?[\s\S]*?```", "", text, flags=re.IGNORECASE).strip()
    fenced_removed = fenced_removed.replace(marker_start, "").replace(marker_start_alt, "").strip()
    fenced_removed = fenced_removed.replace(marker_code, "").strip()
    return fenced_removed


def prune_complexity(code: str, mode: str) -> str:#复杂度修剪。为了防止流程图过于杂乱，它会限制代码的行数（如标准模式下保留前 12 行左右）。
    if mode == "standard":
        return code

    lines = [ln.rstrip() for ln in code.splitlines() if ln.strip()]
    if not lines:
        return code

    head = lines[0]
    body = lines[1:]

    max_lines = 12 if mode == "standard" else 11
    if len(body) > max_lines:
        body = body[:max_lines]

    return "\n".join([head] + body)


def apply_direction(code: str, direction: str) -> str:#强制转换流程图的方向。无论 AI 生成的是什么方向，它可以将其统一修改为用户要求的 TD（从上到下）或 LR（从左到右）。
    normalized = "LR" if str(direction).upper() == "LR" else "TD"
    if not code:
        return code

    lines = code.splitlines()
    if not lines:
        return code

    first_idx = None
    for idx, line in enumerate(lines):
        if line.strip():
            first_idx = idx
            break

    if first_idx is None:
        return code

    first_line = lines[first_idx].strip()
    if re.match(r"^(flowchart|graph)\s+(TD|LR|TB|BT|RL)\b", first_line, flags=re.IGNORECASE):
        lines[first_idx] = re.sub(
            r"^(flowchart|graph)\s+(TD|LR|TB|BT|RL)\b",
            rf"\1 {normalized}",
            lines[first_idx],
            flags=re.IGNORECASE,
        )
        return "\n".join(lines)

    if re.match(r"^(flowchart|graph)\b", first_line, flags=re.IGNORECASE):
        lines[first_idx] = re.sub(
            r"^(flowchart|graph)\b",
            rf"\1 {normalized}",
            lines[first_idx],
            flags=re.IGNORECASE,
        )
        return "\n".join(lines)

    return f"flowchart {normalized}\n{code}"
