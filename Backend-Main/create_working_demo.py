"""
Create Working Demo User with Confirmed Email
This creates a demo user that can login immediately
"""
import asyncio
import sys
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.supabase_client import get_supabase
import uuid

async def create_working_demo_user():
    """Create a fully working demo user"""
    print("="*60)
    print("  CREATING WORKING DEMO USER")
    print("="*60)
    
    # Use a simple, working email and password
    email = "demo@altrion.com"
    password = "Demo123456!"
    name = "Demo User"
    
    print(f"\n📧 Email: {email}")
    print(f"🔑 Password: {password}")
    print(f"👤 Name: {name}\n")
    
    supabase = get_supabase()
    
    async with AsyncSessionLocal() as session:
        try:
            # Step 1: Check if user already exists in database
            print("1️⃣  Checking database...")
            result = await session.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": email}
            )
            existing_user = result.fetchone()
            
            if existing_user:
                print(f"⚠️  User already exists in database")
                user_id = existing_user[0]
            else:
                print(f"✅ Email available in database")
                user_id = None
            
            # Step 2: Try to sign up in Supabase
            print("\n2️⃣  Creating Supabase Auth account...")
            try:
                auth_response = supabase.auth.sign_up({
                    "email": email,
                    "password": password,
                    "options": {
                        "data": {"name": name},
                        "email_redirect_to": None  # Don't send confirmation email
                    }
                })
                
                if auth_response.user:
                    supabase_user_id = auth_response.user.id
                    print(f"✅ Supabase Auth user created")
                    print(f"   User ID: {supabase_user_id}")
                    print(f"   Email confirmed: {auth_response.user.email_confirmed_at is not None}")
                    
                    # If email not confirmed, that's the issue
                    if not auth_response.user.email_confirmed_at:
                        print(f"\n⚠️  Email NOT confirmed - this prevents login!")
                        print(f"   Solution: Disable email confirmation in Supabase")
                    
                    # Step 3: Create/update database record
                    if user_id:
                        # Update existing
                        await session.execute(
                            text("UPDATE users SET supabase_user_id = :supabase_id WHERE email = :email"),
                            {"supabase_id": supabase_user_id, "email": email}
                        )
                        print(f"✅ Database record updated")
                    else:
                        # Create new
                        await session.execute(
                            text("""
                                INSERT INTO users (id, supabase_user_id, email, name)
                                VALUES (:id, :supabase_id, :email, :name)
                            """),
                            {
                                "id": str(uuid.uuid4()),
                                "supabase_id": supabase_user_id,
                                "email": email,
                                "name": name
                            }
                        )
                        print(f"✅ Database record created")
                    
                    await session.commit()
                    
            except Exception as auth_error:
                error_msg = str(auth_error)
                
                if "already been registered" in error_msg or "User already registered" in error_msg:
                    print(f"⚠️  User already exists in Supabase Auth")
                    print(f"   Trying to get user info...")
                    
                    # Try signing in to get user details
                    try:
                        signin_response = supabase.auth.sign_in_with_password({
                            "email": email,
                            "password": password
                        })
                        
                        if signin_response.user:
                            print(f"✅ Can sign in successfully!")
                            print(f"   User ID: {signin_response.user.id}")
                            supabase_user_id = signin_response.user.id
                            
                            # Update database link
                            if user_id:
                                await session.execute(
                                    text("UPDATE users SET supabase_user_id = :supabase_id WHERE email = :email"),
                                    {"supabase_id": supabase_user_id, "email": email}
                                )
                            else:
                                await session.execute(
                                    text("""
                                        INSERT INTO users (id, supabase_user_id, email, name)
                                        VALUES (:id, :supabase_id, :email, :name)
                                    """),
                                    {
                                        "id": str(uuid.uuid4()),
                                        "supabase_id": supabase_user_id,
                                        "email": email,
                                        "name": name
                                    }
                                )
                            await session.commit()
                            print(f"✅ Database linked")
                            
                    except Exception as signin_error:
                        signin_msg = str(signin_error)
                        if "Email not confirmed" in signin_msg:
                            print(f"\n❌ EMAIL CONFIRMATION REQUIRED")
                            print(f"   This is preventing login!")
                            print(f"\n🔧 FIX: Go to Supabase Dashboard")
                            print(f"   1. Authentication → Providers → Email")
                            print(f"   2. Set 'Confirm email' to OFF")
                            print(f"   3. Save")
                            print(f"\n   OR manually confirm email in:")
                            print(f"   Authentication → Users → Find user → Confirm email")
                            return False
                        else:
                            print(f"❌ Cannot sign in: {signin_msg}")
                            return False
                else:
                    print(f"❌ Signup error: {error_msg}")
                    raise
            
            # Step 4: Test login
            print(f"\n3️⃣  Testing login...")
            try:
                test_signin = supabase.auth.sign_in_with_password({
                    "email": email,
                    "password": password
                })
                
                if test_signin.user and test_signin.session:
                    print(f"✅ LOGIN WORKS!")
                    print(f"   Access token: {test_signin.session.access_token[:50]}...")
                    print(f"\n✅ SUCCESS! You can now login with:")
                    print(f"   Email: {email}")
                    print(f"   Password: {password}")
                    return True
                else:
                    print(f"❌ Login failed - no session returned")
                    return False
                    
            except Exception as login_error:
                error_msg = str(login_error)
                if "Email not confirmed" in error_msg or "not confirmed" in error_msg.lower():
                    print(f"❌ LOGIN BLOCKED: Email not confirmed")
                    print(f"\n🔧 SOLUTION:")
                    print(f"   Go to Supabase Dashboard:")
                    print(f"   https://sxnuebvmnfposadbslfw.supabase.co")
                    print(f"   ")
                    print(f"   Option 1: Disable email confirmation globally")
                    print(f"   - Authentication → Providers → Email")
                    print(f"   - Set 'Confirm email' to OFF")
                    print(f"   - Save")
                    print(f"   ")
                    print(f"   Option 2: Manually confirm this user")
                    print(f"   - Authentication → Users")
                    print(f"   - Find: {email}")
                    print(f"   - Click the user")
                    print(f"   - Look for 'Confirm email' button and click it")
                    print(f"   ")
                    return False
                else:
                    print(f"❌ Login error: {error_msg}")
                    return False
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            await session.rollback()
            return False

async def main():
    """Main function"""
    success = await create_working_demo_user()
    
    if success:
        print("\n" + "="*60)
        print("  ✅ DEMO USER READY!")
        print("="*60)
        print("\nTest in your frontend:")
        print("  1. Go to login page")
        print("  2. Email: demo@altrion.com")
        print("  3. Password: Demo123456!")
        print("  4. Should login successfully")
        print()
        return 0
    else:
        print("\n" + "="*60)
        print("  ❌ USER CREATION BLOCKED")
        print("="*60)
        print("\nMost common issue: Email confirmation required")
        print("Follow the instructions above to fix it.")
        print()
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
