from fastapi import APIRouter
from app.api.v1.endpoints import auth, reports, events, admin, dashboard, intelligence, operations, llm

router = APIRouter(prefix="/api/v1")
router.include_router(auth.router)
router.include_router(reports.router)
router.include_router(events.router)
router.include_router(admin.router)
router.include_router(dashboard.router)
router.include_router(intelligence.router)
router.include_router(operations.router)
router.include_router(llm.router)
