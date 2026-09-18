from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.plan import router as plan_router
from app.routers.agent import router as agent_router


app = FastAPI(title=settings.app_name)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
if not origins:
    origins = ["*"]

origin_regex = None
app_env = (settings.app_env or "").strip().lower()
if app_env not in {"prod", "production"}:
    # 非生产环境放宽到 localhost/127.0.0.1 任意端口，避免端口/主机名切换触发预检 400
    origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
#注册路由
app.include_router(plan_router)#普通接口
app.include_router(agent_router)#流式Agent接口


@app.get("/health")
def health_check():
    return {"status": "ok", "service": settings.app_name}
