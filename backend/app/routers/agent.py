import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agents.mermaid_agent_service import MermaidAgentService
from app.models.schemas import AgentChatRequest


router = APIRouter(prefix="/api", tags=["agent"])
agent_service = MermaidAgentService()


@router.post("/agent/chat/stream")
async def stream_agent_chat(payload: AgentChatRequest):
    async def event_generator():#这个内部函数是一个 异步生成器。它的职责不是一次性 return 一个结果，而是不断 yield 一段一段的数据。
        try:
            async for event in agent_service.stream_chat(payload.mode, payload.prompt, payload.direction):
                yield f"event: {event.get('type', 'message')}\n"
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception:
            error_event = {"type": "error", "message": "流式服务暂时不可用，请稍后重试。"}
            yield "event: error\n"
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
            yield "event: done\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
