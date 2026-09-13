from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.api.health import router as health_router
from app.api.checkouts import router as checkouts_router
from app.api.recovery import router as recovery_router
from app.database import Base, engine, SessionLocal
import app.models  # trigger import of all models
from app.models.checkout import CheckoutEvent
from app.services.synthetic import generate_checkouts


def _seed_if_empty():
    """Insert synthetic data on first boot (Vercel has an ephemeral filesystem)."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        count = db.query(CheckoutEvent).count()
        if count == 0:
            print("[startup] Database is empty — seeding 5000 synthetic checkouts…")
            items = generate_checkouts(n=5000, seed=42)
            db.bulk_save_objects(items)
            db.commit()
            print(f"[startup] Seeded {len(items)} rows.")
        else:
            print(f"[startup] Database already has {count} rows — skipping seed.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_if_empty()
    yield


app = FastAPI(title="RecoverFlow AI Backend", lifespan=lifespan)

app.include_router(health_router, prefix="/api")
app.include_router(checkouts_router, prefix="/api")
app.include_router(recovery_router, prefix="/api")


@app.get("/", include_in_schema=False)
def root():
    return {"message": "RecoverFlow AI backend. See /api/health and /api/checkouts."}
