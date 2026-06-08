from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.api.v1.deps import require_admin
from app.models.user import User
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/toggle-active", response_model=UserOut)
def toggle_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user
