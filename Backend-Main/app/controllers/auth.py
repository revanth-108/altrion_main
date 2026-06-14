"""
Authentication endpoints
"""
import asyncio
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from app.core.database import get_db, AsyncSessionLocal
from app.core.supabase_client import get_supabase, get_encrypted_token
from app.core.auth import get_current_user as get_authenticated_user
from app.core.redis_client import store_raw_data
from app.core.config import settings
from app.core.logging import get_logger, timing_log
from app.schemas.auth import (
    SignupRequest,
    SigninRequest,
    NicknameRequest,
    UpdateProfileRequest,
    ResendVerificationRequest,
    OAuthCompleteRequest,
    ResetPasswordRequest,
    AuthResponse,
    UserResponse,
)
from app.models.user import User
from app.models.account import Account
from app.services.data_consent import apply_data_storage_consent, purge_stored_plaid_data
from app.services.subscription_service import subscription_service
from app.services.normalization import NormalizationService
from app.services.providers.coinbase import CoinbaseAdapter
from app.services.providers.plaid import PlaidAdapter
from app.services.providers.wallet import WalletAdapter

logger = get_logger()

router = APIRouter()


_ENCRYPTED_NAME_RE = re.compile(r'^[A-Za-z0-9+/]{20,}={0,2}$')


def _readable_name(name: str | None, email: str) -> str:
    """Return a display name, falling back to email prefix when name is pgsodium ciphertext."""
    if not name or _ENCRYPTED_NAME_RE.match(name.strip()):
        prefix = (email or '').split('@')[0]
        return prefix.replace('.', ' ').replace('_', ' ').title() or 'User'
    return name


def _is_email_verified(supabase_user) -> bool:
    """Best-effort verification check across Supabase payload variants."""
    if not supabase_user:
        return False

    for field in ("email_confirmed_at", "confirmed_at"):
        value = getattr(supabase_user, field, None)
        if value:
            return True

    if isinstance(supabase_user, dict):
        if supabase_user.get("email_confirmed_at") or supabase_user.get("confirmed_at"):
            return True

    return False


def _build_frontend_oauth_callback_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback"


def _build_frontend_login_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/login"


def _build_oauth_success_redirect(access_token: str, refresh_token: str) -> str:
    hash_params = urlencode(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }
    )
    return f"{_build_frontend_oauth_callback_url()}#{hash_params}"


def _build_oauth_error_redirect(message: str) -> str:
    return f"{_build_frontend_login_url()}?error={quote(message, safe='')}"


def _is_duplicate_email_error(error: Exception) -> bool:
    """Detect duplicate email constraint violations from asyncpg/sqlalchemy wrappers."""
    message = str(getattr(error, "orig", error)).lower()
    return (
        "users_email_key" in message
        or ("duplicate key value" in message and "(email)=" in message)
    )


# #region agent log
def _agent_debug_log(hypothesis_id: str, message: str, data: dict, run_id: str = "signin") -> None:
    payload = {
        "sessionId": "154473",
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": "app/controllers/auth.py:signin",
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    log_path = Path("/tmp/debug-154473.log")
    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(payload, default=str) + "\n")
# #endregion


async def _supabase_email_is_confirmed(db: AsyncSession, email: str) -> bool | None:
    """Return whether Supabase has confirmed the email; None if unknown."""
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user or not user.supabase_user_id:
        return None

    try:
        supabase = get_supabase()
        admin_user = supabase.auth.admin.get_user_by_id(str(user.supabase_user_id))
        auth_user = getattr(admin_user, "user", admin_user)
        return _is_email_verified(auth_user)
    except Exception:
        return None


async def _upsert_oauth_user(db: AsyncSession, auth_user, provider: str = "oauth") -> User:
    email = (getattr(auth_user, "email", "") or "").strip().lower()
    metadata = getattr(auth_user, "user_metadata", None) or {}
    name = metadata.get("name") or metadata.get("full_name") or email.split("@")[0]

    stmt = select(User).where(
        or_(
            User.supabase_user_id == auth_user.id,
            User.email == email,
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        user.supabase_user_id = auth_user.id
        user.email = email
        if not user.name:
            user.name = name
    else:
        user = User(
            supabase_user_id=auth_user.id,
            email=email,
            name=name,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    logger.info("OAuth user synced", email=email, provider=provider, user_id=str(user.id))
    return user


async def _refresh_account(user_id: str, account_id: str, provider: str, provider_account_id: str):
    """Refresh a single account's holdings in the background."""
    async with AsyncSessionLocal() as db:
        try:
            token_data = await get_encrypted_token(user_id, provider)
            if not token_data:
                return

            adapter = None
            if provider == "coinbase":
                adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
            elif provider == "plaid":
                adapter = PlaidAdapter()
            elif provider == "wallet":
                adapter = WalletAdapter()

            if not adapter:
                return

            raw_data = await adapter.fetch_holdings(provider_account_id, token_data)
            await store_raw_data(f"{account_id}:{provider}", raw_data)

            normalization_service = NormalizationService(db)
            await normalization_service.normalize_provider_data(
                user_id=user_id,
                account_id=account_id,
                provider=provider,
                raw_data=raw_data,
                adapter=adapter,
            )

            stmt = select(Account).where(Account.id == account_id)
            result = await db.execute(stmt)
            account = result.scalar_one_or_none()
            if account:
                account.last_synced_at = datetime.utcnow()
                account.error_message = None
                await db.commit()

            logger.info("Background account refresh done", account_id=account_id, provider=provider)
        except Exception as e:
            logger.error("Background account refresh failed", error=str(e), account_id=account_id, provider=provider)
            try:
                stmt = select(Account).where(Account.id == account_id)
                result = await db.execute(stmt)
                account = result.scalar_one_or_none()
                if account:
                    account.error_message = (
                        "Plaid sync failed: access token missing or token_data could not be parsed"
                        if provider == "plaid" and "object has no attribute 'get'" in str(e)
                        else str(e)
                    )
                    await db.commit()
            except Exception:
                pass


async def _refresh_all_accounts(user_id: str, accounts: list):
    """Refresh all accounts concurrently in the background."""
    tasks = [
        _refresh_account(
            user_id=user_id,
            account_id=str(account.id),
            provider=account.provider,
            provider_account_id=account.provider_account_id,
        )
        for account in accounts
    ]
    await asyncio.gather(*tasks, return_exceptions=True)


@router.post("/signup", response_model=AuthResponse)
async def signup(request: SignupRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    signup_start = time.time()
    supabase = get_supabase()
    normalized_email = request.email.strip().lower()
    normalized_name = request.name.strip()

    try:
        timing_log(endpoint="SIGNUP", step="started", duration_ms=0, module="auth.py", user_email=normalized_email, detail=f"Name: {normalized_name}")

        # Step 1: Create user in Supabase Auth
        t1 = time.time()
        response = supabase.auth.sign_up({
            "email": normalized_email,
            "password": request.password,
            "options": {
                "data": {
                    "name": normalized_name,
                },
                "email_redirect_to": _build_frontend_oauth_callback_url(),
            }
        })
        timing_log(endpoint="SIGNUP", step="supabase_account_created", duration_ms=round((time.time() - t1) * 1000), module="auth.py", user_email=normalized_email, step_number=1, detail=f"Supabase ID: {response.user.id if response.user else 'FAILED'}")

        if response.user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user",
            )

        # Step 2: Upsert user record in our database
        t2 = time.time()
        stmt = select(User).where(
            or_(
                User.supabase_user_id == response.user.id,
                User.email == normalized_email,
            )
        )
        existing_result = await db.execute(stmt)
        user = existing_result.scalar_one_or_none()

        if user:
            user.supabase_user_id = response.user.id
            user.email = normalized_email
            user.name = normalized_name
            user.updated_at = datetime.utcnow()
        else:
            user = User(
                supabase_user_id=response.user.id,
                email=normalized_email,
                name=normalized_name,
            )
            db.add(user)

        await db.commit()
        await db.refresh(user)
        timing_log(endpoint="SIGNUP", step="user_saved_to_db", duration_ms=round((time.time() - t2) * 1000), module="auth.py", user_email=user.email, step_number=2, user_id=str(user.id), detail=f"Name: {user.name}")

        # TODO: Trial subscription creation temporarily disabled
        # Reason: async session conflict between user creation commit and
        # subscription creation — needs dedicated DB session
        # Will be re-enabled after signup flow is stabilized
        logger.info("Skipping trial subscription creation for now",
                    user_id=str(user.id))


        # Step 3: Handle verification-required signup vs immediate session
        t3 = time.time()
        session = response.session
        email_verified = _is_email_verified(response.user)
        requires_email_verification = session is None and not email_verified

        if requires_email_verification:
            timing_log(
                endpoint="SIGNUP",
                step="verification_email_sent",
                duration_ms=round((time.time() - t3) * 1000),
                module="auth.py",
                step_number=3,
                detail="Email verification required before first login",
            )
        else:
            timing_log(
                endpoint="SIGNUP",
                step="session_tokens_generated",
                duration_ms=round((time.time() - t3) * 1000),
                module="auth.py",
                step_number=3,
                detail="Access token and refresh token ready",
            )

        total_ms = round((time.time() - signup_start) * 1000)
        timing_log(endpoint="SIGNUP", step="complete", duration_ms=total_ms, module="auth.py", user_email=user.email, is_complete=True, detail=f"User: {user.name}")

        return AuthResponse(
            success=True,
            message="Verification email sent. Please confirm your email before signing in." if requires_email_verification else "User created successfully",
            data={
                "user": {
                    "id": str(user.id),
                    "name": _readable_name(user.name, user.email),
                    "nickname": user.nickname,
                    "email": user.email,
                    "avatar": None,
                    "role": user.role,
                    "provider": "email",
                    "isEmailVerified": email_verified,
                },
                "accessToken": session.access_token if session else None,
                "refreshToken": session.refresh_token if session else None,
                "requiresEmailVerification": requires_email_verification,
            },
        )
    except HTTPException:
        raise
    except IntegrityError as e:
        await db.rollback()
        logger.warning("Signup duplicate email", email=normalized_email, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Please sign in instead.",
        )
    except Exception as e:
        await db.rollback()
        if _is_duplicate_email_error(e):
            logger.warning("Signup duplicate email (wrapped)", email=normalized_email, error=str(e))
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please sign in instead.",
            )
        logger.error("Signup failed", error=str(e), email=normalized_email)
        if "confirmation email" in str(e).lower() or "sending confirmation" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Supabase could not send the signup confirmation email. "
                    "Check Supabase Auth email/SMTP settings, or disable email confirmations for local testing."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create account. Please try again or use a different email.",
        )


@router.post("/signin", response_model=AuthResponse)
async def signin(request: SigninRequest, db: AsyncSession = Depends(get_db)):
    """Login user"""
    signin_start = time.time()
    supabase = get_supabase()
    normalized_email = request.email.strip().lower()

    try:
        timing_log(endpoint="SIGNIN", step="started", duration_ms=0, module="auth.py", user_email=normalized_email)

        # Step 1: Authenticate with Supabase
        t1 = time.time()
        response = supabase.auth.sign_in_with_password({
            "email": normalized_email,
            "password": request.password,
        })
        timing_log(endpoint="SIGNIN", step="supabase_auth", duration_ms=round((time.time() - t1) * 1000), module="auth.py", user_email=normalized_email, step_number=1)

        if response.user is None or response.session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        # Step 2: Get user from our database
        t2 = time.time()
        stmt = select(User).where(User.supabase_user_id == response.user.id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        t2_ms = round((time.time() - t2) * 1000)

        if not user:
            # Fallback: existing DB user may already exist by email from an earlier flow.
            # Link that row to the Supabase user ID instead of inserting a duplicate email.
            email_stmt = select(User).where(User.email == normalized_email)
            email_result = await db.execute(email_stmt)
            user_by_email = email_result.scalar_one_or_none()

            if user_by_email:
                user_by_email.supabase_user_id = response.user.id
                if not user_by_email.name:
                    user_by_email.name = response.user.user_metadata.get("name", "") if response.user.user_metadata else ""
                await db.commit()
                await db.refresh(user_by_email)
                user = user_by_email
                timing_log(
                    endpoint="SIGNIN",
                    step="db_user_linked_by_email",
                    duration_ms=t2_ms,
                    module="auth.py",
                    user_email=user.email,
                    step_number=2,
                    user_id=str(user.id),
                    detail=f"Linked existing user: {user.name}",
                )
            else:
                # Create user record if it doesn't exist by supabase_user_id or email
                user = User(
                    supabase_user_id=response.user.id,
                    email=normalized_email,
                    name=response.user.user_metadata.get("name", "") if response.user.user_metadata else "",
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
                timing_log(endpoint="SIGNIN", step="db_user_created", duration_ms=t2_ms, module="auth.py", user_email=user.email, step_number=2, user_id=str(user.id), detail=f"New user: {user.name}")
        else:
            timing_log(endpoint="SIGNIN", step="db_user_lookup", duration_ms=t2_ms, module="auth.py", user_email=user.email, step_number=2, user_id=str(user.id), detail=f"Name: {user.name}")

        # Step 3: Fire portfolio refresh as a background task (non-blocking)
        try:
            t3 = time.time()
            account_stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
            account_result = await db.execute(account_stmt)
            accounts = account_result.scalars().all()
            t3_ms = round((time.time() - t3) * 1000)
            timing_log(endpoint="SIGNIN", step="load_accounts", duration_ms=t3_ms, module="auth.py", step_number=3, account_count=len(accounts))
            for acc in accounts:
                logger.debug("signin_account_detail", account_name=acc.name, provider=acc.provider, last_synced=str(acc.last_synced_at or "Never"))

            if accounts:
                asyncio.create_task(_refresh_all_accounts(str(user.id), accounts))
                timing_log(endpoint="SIGNIN", step="background_refresh_started", duration_ms=0, module="auth.py", step_number=4, account_count=len(accounts))
        except Exception as e:
            logger.error("[SIGNIN] Failed to start background refresh", error=str(e))

        total_ms = round((time.time() - signin_start) * 1000)
        timing_log(endpoint="SIGNIN", step="complete", duration_ms=total_ms, module="auth.py", user_email=user.email, is_complete=True, detail=f"User: {user.name}")

        return AuthResponse(
            success=True,
            message="Login successful",
            data={
                "user": {
                    "id": str(user.id),
                    "name": _readable_name(user.name, user.email),
                    "nickname": user.nickname,
                    "email": user.email,
                    "avatar": None,
                    "role": user.role,
                    "provider": "email",
                    "isEmailVerified": _is_email_verified(response.user),
                },
                "accessToken": response.session.access_token,
                "refreshToken": response.session.refresh_token,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        error_text = str(e).lower()
        if "email not confirmed" in error_text or "email_not_confirmed" in error_text:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. Please check your inbox and confirm your email before signing in.",
            )

        email_confirmed = await _supabase_email_is_confirmed(db, normalized_email)
        # #region agent log
        _agent_debug_log(
            "B",
            "signin_supabase_auth_failed",
            {
                "email": normalized_email,
                "error_type": type(e).__name__,
                "error": str(e),
                "email_confirmed": email_confirmed,
                "password_length": len(request.password or ""),
            },
        )
        # #endregion

        if "invalid login credentials" in error_text:
            if email_confirmed is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email not verified. Please check your inbox and confirm your email before signing in.",
                )
            if email_confirmed is True:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password. Use the same password you chose at sign-up, or use Forgot password to reset it.",
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        logger.error("Signin failed", error=str(e), error_type=type(e).__name__, email=normalized_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )


@router.post("/forgot-password")
async def forgot_password(request: ResendVerificationRequest):
    """Send a Supabase password reset email."""
    supabase = get_supabase()
    normalized_email = request.email.strip().lower()
    try:
        supabase.auth.reset_password_for_email(
            normalized_email,
            {"redirect_to": _build_frontend_oauth_callback_url()},
        )
        return {
            "success": True,
            "message": "If an account exists for that email, password reset instructions were sent.",
        }
    except Exception as e:
        logger.error("Forgot password failed", error=str(e), email=normalized_email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to send password reset email. Please try again.",
        )


@router.post("/resend-verification")
async def resend_verification_email(request: ResendVerificationRequest):
    """Resend verification email for signup confirmation"""
    supabase = get_supabase()

    try:
        supabase.auth.resend({
            "type": "signup",
            "email": request.email,
            "options": {
                "email_redirect_to": _build_frontend_oauth_callback_url(),
            },
        })
        return {
            "success": True,
            "message": "Verification email sent. Please check your inbox.",
        }
    except Exception as e:
        logger.error("Resend verification failed", error=str(e), email=request.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to resend verification email: {str(e)}",
        )


@router.get("/google")
async def google_oauth_start():
    """Start Google OAuth login flow via Supabase"""
    supabase = get_supabase()
    oauth_response = supabase.auth.sign_in_with_oauth(
        {
            "provider": "google",
            "options": {
                "redirect_to": "https://api.altrion.ai/api/auth/callback",
            },
        }
    )
    redirect_url = getattr(oauth_response, "url", None)
    if redirect_url is None and isinstance(oauth_response, dict):
        redirect_url = oauth_response.get("url")
    if not redirect_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize Google OAuth flow",
        )
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.get("/callback")
async def google_oauth_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Supabase OAuth callback and redirect the frontend with session tokens."""
    error = request.query_params.get("error_description") or request.query_params.get("error")
    if error:
        return RedirectResponse(
            url=_build_oauth_error_redirect(error),
            status_code=status.HTTP_302_FOUND,
        )

    auth_code = request.query_params.get("code")

    if not auth_code:
        return RedirectResponse(
            url=_build_oauth_error_redirect("Missing OAuth authorization code."),
            status_code=status.HTTP_302_FOUND,
        )

    supabase = get_supabase()

    try:
        exchange = supabase.auth.exchange_code_for_session({"auth_code": auth_code})
        if exchange.user is None or exchange.session is None:
            raise ValueError("Supabase did not return a user session")
        await _upsert_oauth_user(db, exchange.user, provider="google")
    except Exception as e:
        logger.error("Google OAuth callback failed", error=str(e))
        return RedirectResponse(
            url=_build_oauth_error_redirect("Google login failed. Please try again."),
            status_code=status.HTTP_302_FOUND,
        )

    return RedirectResponse(
        url=_build_oauth_success_redirect(
            exchange.session.access_token,
            exchange.session.refresh_token,
        ),
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/reset-password", response_model=AuthResponse)
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Complete a Supabase recovery callback by setting a new password."""
    supabase = get_supabase()

    try:
        session_response = supabase.auth.set_session(
            request.access_token,
            request.refresh_token,
        )
        update_response = supabase.auth.update_user({"password": request.password})
        auth_user = getattr(update_response, "user", None) or getattr(session_response, "user", None)
        if auth_user is None:
            raise ValueError("Supabase did not return a user after password reset")

        user = await _upsert_oauth_user(db, auth_user, provider="email")
        session = getattr(session_response, "session", None)
        access_token = getattr(session, "access_token", None) or request.access_token
        refresh_token = getattr(session, "refresh_token", None) or request.refresh_token

        # #region agent log
        _agent_debug_log(
            "C",
            "password_reset_completed",
            {"email": user.email, "user_id": str(user.id)},
            run_id="post-fix",
        )
        # #endregion

        return AuthResponse(
            success=True,
            message="Password updated successfully",
            data={
                "user": {
                    "id": str(user.id),
                    "name": user.name,
                    "nickname": user.nickname,
                    "email": user.email,
                    "avatar": None,
                    "role": user.role,
                    "provider": "email",
                    "isEmailVerified": _is_email_verified(auth_user),
                },
                "accessToken": access_token,
                "refreshToken": refresh_token,
            },
        )
    except Exception as e:
        logger.error("Password reset failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to reset password. Request a new reset link and try again.",
        )


@router.post("/oauth/complete", response_model=AuthResponse)
async def oauth_complete(request: OAuthCompleteRequest, db: AsyncSession = Depends(get_db)):
    """
    Complete OAuth login after frontend receives Supabase callback tokens.
    """
    supabase = get_supabase()

    try:
        try:
            user_response = supabase.auth.get_user(request.access_token)
        except TypeError:
            user_response = supabase.auth.get_user(jwt=request.access_token)
    except Exception as e:
        logger.error("OAuth get_user failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OAuth session",
        )

    auth_user = getattr(user_response, "user", None)
    if auth_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth user not found",
        )

    user = await _upsert_oauth_user(db, auth_user)

    return AuthResponse(
        success=True,
        message="OAuth login successful",
        data={
            "user": {
                "id": str(user.id),
                "name": _readable_name(user.name, user.email),
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "role": user.role,
                "provider": "oauth",
                "isEmailVerified": _is_email_verified(auth_user),
            },
            "accessToken": request.access_token,
            "refreshToken": request.refresh_token,
        },
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
                "name": _readable_name(user.name, user.email),
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "role": user.role,
                "provider": "email",
                "isEmailVerified": True,  # TODO: Get from Supabase
                "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
                "annual_income": float(user.annual_income) if user.annual_income is not None else None,
                "income_source": user.income_source,
                "years_to_retirement": user.years_to_retirement,
                "data_storage_consent": user.data_storage_consent,
                "data_storage_consent_at": user.data_storage_consent_at.isoformat() if user.data_storage_consent_at else None,
                "data_storage_consent_version": user.data_storage_consent_version,
            },
        },
    }


@router.patch("/profile", response_model=dict)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile fields (name, date_of_birth, annual_income, etc.)"""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if request.name is not None:
        user.name = request.name.strip()
    if request.date_of_birth is not None:
        user.date_of_birth = request.date_of_birth
    if request.annual_income is not None:
        user.annual_income = request.annual_income
    if request.income_source is not None:
        valid_sources = {"employment", "self_employed", "investment", "retirement", "other"}
        if request.income_source not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"income_source must be one of: {', '.join(sorted(valid_sources))}",
            )
        user.income_source = request.income_source
    if request.years_to_retirement is not None:
        user.years_to_retirement = request.years_to_retirement
    if request.data_storage_consent is not None:
        apply_data_storage_consent(user, request.data_storage_consent)
        if not request.data_storage_consent:
            await purge_stored_plaid_data(db, user.id)

    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "name": _readable_name(user.name, user.email),
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "role": user.role,
                "provider": "email",
                "isEmailVerified": True,
                "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
                "annual_income": float(user.annual_income) if user.annual_income is not None else None,
                "income_source": user.income_source,
                "years_to_retirement": user.years_to_retirement,
                "data_storage_consent": user.data_storage_consent,
                "data_storage_consent_at": user.data_storage_consent_at.isoformat() if user.data_storage_consent_at else None,
                "data_storage_consent_version": user.data_storage_consent_version,
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
    if request.data_storage_consent is not None:
        apply_data_storage_consent(user, request.data_storage_consent)
        if not request.data_storage_consent:
            await purge_stored_plaid_data(db, user.id)

    await db.commit()
    await db.refresh(user)

    return {
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "name": _readable_name(user.name, user.email),
                "nickname": user.nickname,
                "email": user.email,
                "avatar": None,
                "provider": "email",
                "isEmailVerified": True,
                "data_storage_consent": user.data_storage_consent,
                "data_storage_consent_at": user.data_storage_consent_at.isoformat() if user.data_storage_consent_at else None,
                "data_storage_consent_version": user.data_storage_consent_version,
            },
        },
    }
