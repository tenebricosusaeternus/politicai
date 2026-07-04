from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, TokenOut, LoginIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user = User(
        name=data.name,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=UserRole.client,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenOut(access_token=token, role=user.role)
