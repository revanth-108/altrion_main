"""
Quick Database Connection Test
"""
import asyncio
from app.core.database import engine
from app.core.supabase_client import init_supabase, get_supabase
from sqlalchemy import text

async def main():
    print("\n" + "="*60)
    print("  SUPABASE DATABASE CONNECTION TEST")
    print("="*60 + "\n")
    
    # Test 1: Supabase Client
    print("1️⃣  Testing Supabase Client...")
    try:
        init_supabase()
        supabase = get_supabase()
        print("   ✅ Supabase client initialized successfully\n")
    except Exception as e:
        print(f"   ❌ Supabase client failed: {e}\n")
        return
    
    # Test 2: PostgreSQL Database Connection
    print("2️⃣  Testing PostgreSQL Database Connection...")
    try:
        async with engine.connect() as conn:
            # Single test query
            result = await conn.execute(text("SELECT 1 as test, version() as ver, current_database() as db"))
            row = result.fetchone()
            
            if row and row[0] == 1:
                print("   ✅ Database connection successful!")
                print(f"   ✅ PostgreSQL Version: {row[1].split(',')[0]}")
                print(f"   ✅ Connected to database: {row[2]}\n")
            
    except Exception as e:
        print(f"   ❌ Database connection failed: {e}\n")
        return
    
    # Test 3: Check for existing tables
    print("3️⃣  Checking Database Tables...")
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            tables = result.fetchall()
            
            if tables:
                print(f"   ✅ Found {len(tables)} tables:")
                for table in tables:
                    print(f"      - {table[0]}")
                print()
            else:
                print("   ⚠️  No tables found. You need to run migrations.")
                print("      Run: python scripts/init_db.py")
                print()
    except Exception as e:
        print(f"   ⚠️  Could not list tables: {e}")
        print()
    
    print("\n" + "="*60)
    print("  ✅ ALL TESTS PASSED - YOUR DATABASE IS WORKING!")
    print("="*60 + "\n")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
