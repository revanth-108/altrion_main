"""
Platform connection schemas
"""
from pydantic import BaseModel
from typing import Optional, Literal


class PlatformResponse(BaseModel):
    """Platform response"""
    id: str
    name: str
    icon: str
    category: Literal["crypto", "bank", "broker"]


class ConnectionRequest(BaseModel):
    """Platform connection request"""
    credentials: Optional[dict] = None  # For username/password
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    oauth_code: Optional[str] = None  # For OAuth flow
    public_token: Optional[str] = None  # Plaid Link token


class ConnectionResponse(BaseModel):
    """Connection response"""
    platform_id: str
    status: Literal["pending", "connecting", "success", "error"]
    message: Optional[str] = None
    account_id: Optional[str] = None
