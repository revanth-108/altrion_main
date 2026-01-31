"""
Authentication endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.supabase_client import get_supabase
from app.core.auth import get_current_user as get_authenticated_user
from app.schemas.auth import SignupRequest, SigninRequest, NicknameRequest, AuthResponse, UserResponse
from app.models.user import User
from app.models.account import Account
from sqlalchemy import select
import structlog

logger = structlog.get_logger()

router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    supabase = get_supabase()
    
    try:
        # Create user in Supabase Auth
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "name": request.name,
                }
            }
        })
        
        if response.user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user",
            )
        
        # Create user record in our database
        user = User(
            supabase_user_id=response.user.id,
            email=request.email,
            name=request.name,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        # Get session tokens
        session = response.session
        if not session:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create session",
            )
        
        return AuthResponse(
            success=True,
            message="User created successfully",
            data={
                "user": {
                    "id": str(user.id),
                    "name": user.name,
                    "nickname": user.nickname,
                    "email": user.email,
                    "avatar": None,
                    "provider": "email",
                    "isEmailVerified": response.user.email_confirmed_at is not None,
                },
                "accessToken": session.access_token,
                "refreshToken": session.refresh_token,
            },
        )
    except Exception as e:
        logger.error("Signup failed", error=str(e), email=request.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/signin", response_model=AuthResponse)
async def signin(request: SigninRequest, db: AsyncSession = Depends(get_db)):
    """Login user"""
    supabase = get_supabase()
    
    try:
        # Authenticate with Supabase
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })
        
        if response.user is None or response.session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        
        # Get user from our database
        stmt = select(User).where(User.supabase_user_id == response.user.id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            # Create user record if it doesn't exist (for existing Supabase users)
            user = User(
                supabase_user_id=response.user.id,
                email=response.user.email,
                name=response.user.user_metadata.get("name", ""),
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # Trigger portfolio refresh on login (non-blocking)
        try:
            from app.services.aggregation import AggregationService
            from app.services.normalization import NormalizationService
            from app.core.supabase_client import get_encrypted_token
            from app.core.redis_client import store_raw_data
            from app.services.providers.coinbase import CoinbaseAdapter
            from app.services.providers.plaid import PlaidAdapter
            from app.services.providers.wallet import WalletAdapter
            from app.core.config import settings
            from datetime import datetime
            
            # Get all active accounts
            account_stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
            account_result = await db.execute(account_stmt)
            accounts = account_result.scalars().all()
            
            if accounts:
                normalization_service = NormalizationService(db)
                
                for account in accounts:
                    try:
                        # Get encrypted token
                        token_data = await get_encrypted_token(str(user.id), account.provider)
                        if not token_data:
                            continue
                        
                        # Get adapter
                        adapter = None
                        if account.provider == "coinbase":
                            adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
                        elif account.provider == "plaid":
                            adapter = PlaidAdapter()
                        elif account.provider == "wallet":
                            adapter = WalletAdapter()
                        
                        if adapter:
                            # Fetch holdings
                            raw_data = await adapter.fetch_holdings(account.provider_account_id, token_data)
                            
                            # Store raw data in Redis
                            await store_raw_data(f"{account.id}:{account.provider}", raw_data)
                            
                            # Normalize data
                            await normalization_service.normalize_provider_data(
                                user_id=str(user.id),
                                account_id=str(account.id),
                                provider=account.provider,
                                raw_data=raw_data,
                                adapter=adapter,
                            )
                            
                            # Update account sync time
                            account.last_synced_at = datetime.utcnow()
                            account.error_message = None
                            await db.commit()
                    except Exception as e:
                        logger.error("Account refresh on login failed", error=str(e), account_id=account.id)
                        account.error_message = str(e)
                        await db.commit()
        except Exception as e:
            # Don't fail login if refresh fails
            logger.error("Portfolio refresh on login failed", error=str(e))
        
        return AuthResponse(
            success=True,
            message="Login successful",
            data={
                "user": {
                    "id": str(user.id),
                    "name": user.name,
                    "nickname": user.nickname,
                    "email": user.email,
                    "avatar": None,
                    "provider": "email",
                    "isEmailVerified": response.user.email_confirmed_at is not None,
                },
                "accessToken": response.session.access_token,
                "refreshToken": response.session.refresh_token,
            },
        )
    except Exception as e:
        logger.error("Signin failed", error=str(e), email=request.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )


@router.get("/me", response_model=dict)
async def get_me(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user profile"""
    user_id = current_user["user_id"]
    
    # Get user from database
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    return {
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "name": user.name,
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "provider": "email",
                "isEmailVerified": True,  # TODO: Get from Supabase
            },
        },
    }


@router.post("/logout")
async def logout(current_user: dict = Depends(get_authenticated_user)):
    """Logout user"""
    supabase = get_supabase()
    
    try:
        # Sign out from Supabase (invalidates refresh token)
        supabase.auth.sign_out()
        logger.info("User logged out", user_id=current_user.get("user_id"))
    except Exception as e:
        # Log error but don't fail - client will clear local state anyway
        logger.warning("Supabase sign out failed", error=str(e))
    
    return {
        "success": True,
        "message": "Logged out successfully",
    }


@router.post("/nickname", response_model=dict)
async def update_nickname(
    request: NicknameRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user nickname"""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.nickname = request.nickname.strip()
    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "name": user.name,
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "provider": "email",
                "isEmailVerified": True,
            },
        },
    }
