"""
Authentication middleware and utilities
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.core.config import settings
from app.core.supabase_client import get_supabase
import structlog

logger = structlog.get_logger()

security = HTTPBearer()


async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Verify Supabase JWT token and return user info
    
    Returns:
        dict with user_id and email
    """
    token = credentials.credentials
    
    try:
        jwt_secret = getattr(settings, "SUPABASE_JWT_SECRET", None)
        if jwt_secret:
            # Verify JWT with Supabase secret when available
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=[settings.JWT_ALGORITHM],
            )
            
            user_id: str = payload.get("sub")
            email: str = payload.get("email")
            
            if user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                )
            
            return {
                "user_id": user_id,
                "email": email,
                "token": token,
            }

        # Fallback: validate with Supabase if JWT secret isn't configured
        try:
            supabase = get_supabase()
            response = supabase.auth.get_user(token)
            user = getattr(response, "user", None) or response
            user_id = getattr(user, "id", None)
            email = getattr(user, "email", None)

            if user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                )

            return {
                "user_id": user_id,
                "email": email,
                "token": token,
            }
        except Exception as e:
            # Dev-only fallback to read token claims without signature verification
            if settings.ENVIRONMENT == "development":
                try:
                    payload = jwt.get_unverified_claims(token)
                    user_id = payload.get("sub")
                    email = payload.get("email")

                    if user_id is None:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid authentication credentials",
                        )

                    logger.warning("Using unverified JWT claims in development", error=str(e))
                    return {
                        "user_id": user_id,
                        "email": email,
                        "token": token,
                    }
                except Exception as dev_error:
                    logger.error("Unverified JWT fallback failed", error=str(dev_error))
            raise
    except JWTError as e:
        logger.error("JWT verification failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    except Exception as e:
        logger.error("Token verification failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )


async def get_current_user(token_data: dict = Depends(verify_token)) -> dict:
    """Get current authenticated user"""
    return token_data
