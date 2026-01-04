from fastapi import FastAPI
from apps.api.app.db import engine
from apps.api.app.models import Base
from apps.api.app.routes.health import router as health_router
from apps.api.app.routes.config import router as config_router
from apps.api.app.routes.reviews import router as reviews_router
from apps.api.app.routes.enriched_reviews import router as enriched_reviews_router
from apps.api.app.routes.metrics import router as metrics_router
from apps.api.app.routes.metrics_trend import router as metrics_trend_router
from apps.api.app.routes.metrics_aspects import router as metrics_aspects_router

app = FastAPI(title="Customer Review AIOps API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"name": "Customer Review AIOps API", "status": "ok", "docs": "/docs"}


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

app.include_router(health_router)
app.include_router(config_router)
app.include_router(reviews_router)
app.include_router(enriched_reviews_router)
app.include_router(metrics_router)
app.include_router(metrics_trend_router)
app.include_router(metrics_aspects_router)