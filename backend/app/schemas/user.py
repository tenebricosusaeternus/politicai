from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.client


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole


class LoginIn(BaseModel):
    email: EmailStr
    password: str
