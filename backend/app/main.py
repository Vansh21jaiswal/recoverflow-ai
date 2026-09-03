from fastapi import FastAPI
from app.api.health import router as health_router
from app.api.checkouts import router as checkouts_router
from app.api.recovery import router as recovery_router
from app.database import Base, engine
import app.models  # trigger import of all models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="RecoverFlow AI Backend")

app.include_router(health_router)
app.include_router(checkouts_router)
app.include_router(recovery_router)


@app.get("/", include_in_schema=False)
def root():
    return {"message": "RecoverFlow AI backend. See /health and /checkouts."}
