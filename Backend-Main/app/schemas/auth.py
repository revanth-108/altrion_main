"""
Authentication schemas
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class SignupRequest(BaseModel):
    """Signup request"""
    email: EmailStr
    password: str
    name: str


class SigninRequest(BaseModel):
    """Signin request"""
    email: EmailStr
    password: str


class NicknameRequest(BaseModel):
    """Nickname update request"""
    nickname: str


class UserResponse(BaseModel):
    """User response"""
    id: str
    name: str
    nickname: Optional[str] = None
    email: str
    avatar: Optional[str] = None
    provider: str
    isEmailVerified: bool
    
    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Authentication response"""
    success: bool
    message: str
    data: dict
    
    class Config:
        from_attributes = True
