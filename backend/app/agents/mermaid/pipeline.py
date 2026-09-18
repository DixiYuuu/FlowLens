from typing import Any, Dict

from app.config import settings
from app.prompts.standard_prompt import STANDARD_PROMPT
from app.services.llm_service import LLMService
from app.tools.mermaid_validator_tool import MermaidValidatorTool

from .agent_factory import build_agent
from .code_utils import extract_mermaid, extract_optimized_text


class MermaidPipeline:
    def __init__(self, validator: MermaidValidatorTool):
        self.validator = validator

    def generate_once(self, mode: str, prompt: str) -> str:
        agent = build_agent(mode, self.validator)
        agent.clear_history()
        result_text = agent.run(prompt)
        return extract_mermaid(result_text)

    def generate_standard(self, prompt: str) -> Dict[str, str]:
#第一步：文本优化
        optimize_messages = [
            {
                "role": "system",
                "content": (
                    STANDARD_PROMPT
                    + "\n补充要求：你现在只执行【第一步：文本优化】。"
                      "只输出优化后的完整文本，不要输出标题，不要输出Mermaid代码，不要代码块。"
                ),
            },
            {"role": "user", "content": prompt},
        ]
        optimized_resp = LLMService.create_llm().invoke(optimize_messages)
        optimized_text = extract_optimized_text(optimized_resp.content)#尝试从 AI 回复中精准抓取优化后的部分。
        source_text = optimized_text.strip() or (optimized_resp.content or "").strip()#这一行是一个保底逻辑：如果正则提取失败，就直接使用 AI 回复的全部原始内容作为下一步的输入。
#第二步：生成Mermaid代码
        code_agent = build_agent("standard-code", self.validator)
        code_agent.clear_history()
        raw_code_text = code_agent.run(source_text)#将第一阶段优化好的文本交给代码 Agent

        return {
            "optimized_text": source_text,
            "mermaid_code": extract_mermaid(raw_code_text),
            "generated_from_optimized": bool(source_text),
        }#optimized_text：返回中间环节优化后的文本，方便前端展示给用户看“AI 是如何理解你的意图的”。mermaid_code：通过 extract_mermaid 提取出的最终可运行代码。generated_from_optimized：一个布尔值，标识是否成功经历了优化阶段。

    def repair_once(self, bad_code: str, reason: str) -> str:
        messages = [
            {"role": "system", "content": "你是 Mermaid 修复器，只输出修复后的 Mermaid 代码。"},
            {
                "role": "user",
                "content": (
                    "请修复以下 Mermaid 代码并确保可渲染。"
                    f"\n错误信息: {reason}\n\n代码:\n{bad_code}"
                ),
            },
        ]
        response = LLMService.create_llm().invoke(messages)
        return extract_mermaid(response.content)


#自愈机制。生成的代码如果不符合 Mermaid 语法，它会捕获错误并自动调用 AI 进行修复（repair_once），直到代码合法或达到重试上限。
    def post_validate(self, code: str) -> Dict[str, Any]:
        current = code
        attempts = 0
        repair_limit = min(settings.validator_max_retries, 1)

        while attempts <= repair_limit:
            attempts += 1
            result = self.validator.run({"code": current})
            valid = bool(result.data.get("valid"))
            fixed_code = result.data.get("fixed_code", current)

            if valid:
                return {
                    "valid": True,
                    "attempts": attempts,
                    "mermaid_code": fixed_code,
                    "message": "validated",
                }

            if attempts > repair_limit:
                return {
                    "valid": False,
                    "attempts": attempts,
                    "mermaid_code": fixed_code,
                    "message": "; ".join(result.data.get("errors", [])) or "validate failed",
                }

            reason = "; ".join(result.data.get("errors", [])) or "unknown syntax issue"
            current = self.repair_once(fixed_code, reason)

        return {
            "valid": False,
            "attempts": attempts,
            "mermaid_code": current,
            "message": "validate failed",
        }
