import logging
import logging.config
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
import os
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from apscheduler.schedulers.background import BackgroundScheduler
from app.api.v1.router import router
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.services.ai.llm_router import configured_models
import app.models  # garante que os models são registrados antes do create_all

# Diretório de uploads (imagens dos relatórios)
UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)


# ─── jobs agendados ──────────────────────────────────────────────────────────

def job_sync():
    """Sync V-Tracker → banco local (roda a cada 30 min)."""
    from app.services.sync import sincronizar_recente
    from app.services.official_insights import sync_official_insights_recente
    db = SessionLocal()
    try:
        result = sincronizar_recente(db, dias=7)
        try:
            result["insights"] = sync_official_insights_recente(db, dias=7)
        except Exception as e:
            logger.warning("job_sync insights falhou: %s", e)
            result["insights"] = {"erro": str(e)}
        logger.info("job_sync: %s", result)
    except Exception as e:
        logger.error("job_sync falhou: %s", e)
    finally:
        db.close()


def job_classificar():
    """Rede de segurança: classifica qualquer pendência que sobrar do sync."""
    from app.services.sync import classificar_todos_pendentes, total_pendentes
    db = SessionLocal()
    try:
        pendentes = total_pendentes(db)
        if pendentes == 0:
            return
        n = classificar_todos_pendentes(db, max_total=240)
        logger.info("job_classificar: %d classificadas (restam %d)", n, pendentes - n)
    except Exception as e:
        logger.error("job_classificar falhou: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler(timezone="America/Belem")
    scheduler.add_job(job_sync, "interval", minutes=30, id="sync", replace_existing=True)
    scheduler.add_job(job_classificar, "interval", minutes=5, id="classificar", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler iniciado")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Scheduler encerrado")


# ─── app ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="PoliticAI", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Serve as imagens enviadas para os relatórios
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    checks = {"database": False, "llm": False, "llm_models": configured_models()}

    db = SessionLocal()
    try:
        db.execute(text("select 1"))
        checks["database"] = True
    except Exception as e:
        checks["database_error"] = str(e)
    finally:
        db.close()

    try:
        with httpx.Client(timeout=2) as client:
            resp = client.get(f"{settings.LLM_BASE_URL}/models")
            checks["llm"] = resp.status_code < 500
    except Exception as e:
        checks["llm_error"] = str(e)

    status = "ok" if checks["database"] else "degraded"
    return {"status": status, "checks": checks}
