"""
Authentication schemas
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime


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
    data_storage_consent: Optional[bool] = None


class UpdateProfileRequest(BaseModel):
    """Profile update request — all fields optional"""
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    annual_income: Optional[float] = None
    income_source: Optional[str] = None  # 'employment'|'self_employed'|'investment'|'retirement'|'other'
    years_to_retirement: Optional[int] = None
    data_storage_consent: Optional[bool] = None


class ResendVerificationRequest(BaseModel):
    """Resend email verification request"""
    email: EmailStr


class OAuthCompleteRequest(BaseModel):
    """OAuth completion request from frontend callback"""
    access_token: str
    refresh_token: str


class ResetPasswordRequest(BaseModel):
    """Password reset completion after Supabase recovery callback"""
    access_token: str
    refresh_token: str
    password: str


class UserResponse(BaseModel):
    """User response"""
    id: str
    name: str
    nickname: Optional[str] = None
    email: str
    avatar: Optional[str] = None
    provider: str
    isEmailVerified: bool
    date_of_birth: Optional[date] = None
    annual_income: Optional[float] = None
    income_source: Optional[str] = None
    years_to_retirement: Optional[int] = None
    data_storage_consent: bool = False
    data_storage_consent_at: Optional[datetime] = None
    data_storage_consent_version: Optional[str] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    """Authentication response"""
    success: bool
    message: str
    data: dict

    class Config:
        from_attributes = True
