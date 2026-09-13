from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import shutil
from dotenv import load_dotenv

load_dotenv()


def _resolve_database_url() -> str:
    """Return the effective DATABASE_URL.

    On Vercel the deployed filesystem (/var/task) is read-only, so SQLite
    cannot be opened for writing there.  We copy the bundled seed database to
    /tmp (the only writable location) on first cold-start.
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    if os.getenv("VERCEL"):
        tmp_db = "/tmp/recoverflow.db"
        if not os.path.exists(tmp_db):
            # recoverflow.db sits one directory above this file (backend/)
            bundled = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "recoverflow.db")
            )
            if os.path.exists(bundled):
                shutil.copy2(bundled, tmp_db)
                print(f"[db] Copied bundled DB → {tmp_db}")
            else:
                print("[db] WARNING: bundled DB not found, starting with empty DB")
        return f"sqlite:///{tmp_db}"

    return "sqlite:///./recoverflow.db"


DATABASE_URL = _resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
