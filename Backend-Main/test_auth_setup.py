"""
Quick Authentication Test Script
Tests if your database and Supabase are properly configured
"""
import asyncio
import sys
from sqlalchemy import text
from app.core.database import engine
from app.core.supabase_client import get_supabase

async def test_database_tables():
    """Check if all required tables exist"""
    print("\n" + "="*60)
    print("  TESTING DATABASE TABLES")
    print("="*60 + "\n")
    
    required_tables = ['users', 'accounts', 'holdings', 'asset_mappings', 'prices', 'provider_tokens']
    
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            tables = [row[0] for row in result.fetchall()]
            
            print(f"Found {len(tables)} tables:")
            for table in tables:
                status = "✅" if table in required_tables else "ℹ️"
                print(f"  {status} {table}")
            
            print()
            missing = set(required_tables) - set(tables)
            if missing:
                print(f"❌ MISSING TABLES: {', '.join(missing)}")
                print("   Run: complete_db_setup_safe.sql in Supabase SQL Editor")
                return False
            else:
                print("✅ All required tables exist!")
                return True
                
    except Exception as e:
        print(f"❌ Database error: {e}")
        return False

def test_supabase_client():
    """Test Supabase client connection"""
    print("\n" + "="*60)
    print("  TESTING SUPABASE CLIENT")
    print("="*60 + "\n")
    
    try:
        supabase = get_supabase()
        print("✅ Supabase client initialized successfully")
        print(f"   Using anon key (first 20 chars): {supabase.supabase_key[:20]}...")
        return True
    except Exception as e:
        print(f"❌ Supabase client error: {e}")
        return False

async def test_user_table():
    """Check users table structure"""
    print("\n" + "="*60)
    print("  TESTING USERS TABLE")
    print("="*60 + "\n")
    
    try:
        async with engine.connect() as conn:
            # Check table structure
            result = await conn.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'users'
                ORDER BY ordinal_position
            """))
            columns = result.fetchall()
            
            print("Users table columns:")
            for col_name, col_type in columns:
                print(f"  - {col_name}: {col_type}")
            
            # Count existing users
            result = await conn.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar()
            print(f"\n📊 Current users in database: {count}")
            
            return True
    except Exception as e:
        print(f"❌ Error checking users table: {e}")
        return False

async def test_auth_endpoint():
    """Test if auth endpoints are accessible"""
    print("\n" + "="*60)
    print("  TESTING AUTH ENDPOINTS")
    print("="*60 + "\n")
    
    import httpx
    
    try:
        async with httpx.AsyncClient() as client:
            # Test health endpoint
            response = await client.get("http://localhost:8000/")
            if response.status_code == 200:
                print("✅ Server is running")
                data = response.json()
                print(f"   Status: {data.get('status')}")
                print(f"   Environment: {data.get('environment')}")
            else:
                print(f"❌ Server returned status: {response.status_code}")
                return False
            
            # Test docs endpoint
            response = await client.get("http://localhost:8000/docs")
            if response.status_code == 200:
                print("✅ API docs available at: http://localhost:8000/docs")
            
            return True
    except Exception as e:
        print(f"❌ Server connection error: {e}")
        print("   Is the server running? Start with: python run.py")
        return False

async def main():
    """Run all tests"""
    print("\n" + "🔍 " + "="*58)
    print("  AUTHENTICATION SETUP VERIFICATION")
    print("="*60 + "\n")
    
    results = {
        "Database Tables": await test_database_tables(),
        "Supabase Client": test_supabase_client(),
        "Users Table": await test_user_table(),
        "Auth Endpoints": await test_auth_endpoint(),
    }
    
    await engine.dispose()
    
    # Summary
    print("\n" + "="*60)
    print("  TEST SUMMARY")
    print("="*60 + "\n")
    
    all_passed = True
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("\n" + "="*60)
    
    if all_passed:
        print("✅ ALL TESTS PASSED - Ready for authentication!")
        print("\nNext steps:")
        print("1. Fix Supabase Auth settings (see AUTH_TROUBLESHOOTING.md)")
        print("2. Disable email confirmation for development")
        print("3. Test signup/signin from frontend or curl")
    else:
        print("❌ SOME TESTS FAILED - Check errors above")
        print("\nCommon fixes:")
        print("1. Run: complete_db_setup_safe.sql in Supabase SQL Editor")
        print("2. Check .env file has correct credentials")
        print("3. Start server with: python run.py")
    
    print()
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
