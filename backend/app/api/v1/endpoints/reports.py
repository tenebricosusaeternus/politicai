from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import List, Optional
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.report import Report
from app.schemas.report import ReportOut, ReportDetail

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/today", response_model=ReportDetail)
def get_today_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    report = db.query(Report).filter(Report.report_date == today).order_by(Report.created_at.desc()).first()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório do dia ainda não gerado")
    return report


@router.get("/", response_model=List[ReportOut])
def list_reports(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Report).order_by(Report.report_date.desc())
    if date_from:
        query = query.filter(Report.report_date >= date_from)
    if date_to:
        query = query.filter(Report.report_date <= date_to)
    return query.limit(90).all()


@router.get("/{report_date}", response_model=ReportDetail)
def get_report_by_date(
    report_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.query(Report).filter(Report.report_date == report_date).order_by(Report.created_at.desc()).first()
    if not report:
        raise HTTPException(status_code=404, detail=f"Sem relatório para {report_date}")
    return report


@router.get("/crisis-history/", response_model=List[dict])
def crisis_history(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Série temporal do índice de crise — alimenta o gráfico de linha do dashboard."""
    query = db.query(Report.report_date, Report.crisis_score, Report.sentiment_score).order_by(Report.report_date)
    if date_from:
        query = query.filter(Report.report_date >= date_from)
    if date_to:
        query = query.filter(Report.report_date <= date_to)
    rows = query.all()
    return [{"date": str(r.report_date), "crisis_score": r.crisis_score, "sentiment_score": r.sentiment_score} for r in rows]
