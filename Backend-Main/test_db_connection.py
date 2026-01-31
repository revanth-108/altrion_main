"""
Test Supabase Database Connection
This script tests both the Supabase client and PostgreSQL database connection
"""
import asyncio
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from supabase import create_client

# Color codes for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_header(message):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{message.center(60)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

def print_success(message):
    print(f"{Colors.GREEN}✓ {message}{Colors.END}")

def print_error(message):
    print(f"{Colors.RED}✗ {message}{Colors.END}")

def print_info(message):
    print(f"{Colors.YELLOW}ℹ {message}{Colors.END}")

async def test_database_connection():
    """Test PostgreSQL database connection via SQLAlchemy"""
    print_header("Testing PostgreSQL Database Connection")
    
    try:
        # Load environment variables
        from dotenv import load_dotenv
        import os
        
        load_dotenv()
        
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print_error("DATABASE_URL not found in environment variables")
            return False
        
        print_info(f"Database URL found: {database_url[:50]}...")
        
        # Convert to async URL
        async_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
        
        # Create engine with proper configuration for Supabase
        from sqlalchemy.pool import NullPool
        
        engine = create_async_engine(
            async_url,
            echo=False,
            future=True,
            poolclass=NullPool,
            connect_args={
                "statement_cache_size": 0,
                "prepared_statement_cache_size": 0,
                "ssl": "require",
            },
            execution_options={
                "postgresql_prepared_statements": False
            },
        )
        
        print_info("Attempting to connect to database...")
        
        # Test connection
        async with engine.connect() as conn:
            # Test basic query
            result = await conn.execute(text("SELECT 1 as test"))
            row = result.fetchone()
            
            if row and row[0] == 1:
                print_success("Database connection successful!")
            
            # Get PostgreSQL version
            result = await conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print_success(f"PostgreSQL Version: {version.split(',')[0]}")
            
            # Check current database
            result = await conn.execute(text("SELECT current_database()"))
            db_name = result.fetchone()[0]
            print_success(f"Connected to database: {db_name}")
            
            # List tables
            result = await conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            tables = result.fetchall()
            
            if tables:
                print_success(f"Found {len(tables)} tables in public schema:")
                for table in tables:
                    print(f"  - {table[0]}")
            else:
                print_info("No tables found in public schema (you may need to run migrations)")
        
        await engine.dispose()
        return True
        
    except Exception as e:
        print_error(f"Database connection failed: {str(e)}")
        print_info(f"Error type: {type(e).__name__}")
        return False

def test_supabase_client():
    """Test Supabase client connection"""
    print_header("Testing Supabase Client Connection")
    
    try:
        from dotenv import load_dotenv
        import os
        
        load_dotenv()
        
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url:
            print_error("SUPABASE_URL not found in environment variables")
            return False
        
        if not supabase_key:
            print_error("SUPABASE_KEY not found in environment variables")
            return False
        
        print_info(f"Supabase URL: {supabase_url}")
        
        # Test anon key client
        print_info("Testing Supabase client with anon key...")
        supabase_client = create_client(supabase_url, supabase_key)
        print_success("Supabase client (anon key) initialized successfully")
        
        # Test service role key client
        if supabase_service_key:
            print_info("Testing Supabase client with service role key...")
            supabase_admin = create_client(supabase_url, supabase_service_key)
            print_success("Supabase admin client (service role key) initialized successfully")
        else:
            print_info("SUPABASE_SERVICE_ROLE_KEY not found (optional)")
        
        return True
        
    except Exception as e:
        print_error(f"Supabase client initialization failed: {str(e)}")
        print_info(f"Error type: {type(e).__name__}")
        return False

def test_environment_variables():
    """Test if all required environment variables are set"""
    print_header("Checking Environment Variables")
    
    try:
        from dotenv import load_dotenv
        import os
        
        load_dotenv()
        
        required_vars = {
            "SUPABASE_URL": "Supabase project URL",
            "SUPABASE_KEY": "Supabase anon/public key",
            "SUPABASE_SERVICE_ROLE_KEY": "Supabase service role key",
            "SUPABASE_JWT_SECRET": "Supabase JWT secret",
            "DATABASE_URL": "PostgreSQL database URL",
        }
        
        optional_vars = {
            "REDIS_URL": "Redis connection URL",
            "PLAID_CLIENT_ID": "Plaid client ID",
            "COINBASE_CLIENT_ID": "Coinbase client ID",
        }
        
        all_present = True
        
        print_info("Required variables:")
        for var, description in required_vars.items():
            value = os.getenv(var)
            if value:
                # Mask sensitive values
                masked_value = value[:20] + "..." if len(value) > 20 else value
                print_success(f"{var}: {masked_value}")
            else:
                print_error(f"{var}: NOT SET ({description})")
                all_present = False
        
        print_info("\nOptional variables:")
        for var, description in optional_vars.items():
            value = os.getenv(var)
            if value and not value.startswith("your-"):
                masked_value = value[:20] + "..." if len(value) > 20 else value
                print_success(f"{var}: {masked_value}")
            else:
                print_info(f"{var}: Not configured ({description})")
        
        return all_present
        
    except Exception as e:
        print_error(f"Failed to check environment variables: {str(e)}")
        return False

async def test_app_startup():
    """Test if the FastAPI app can start and initialize services"""
    print_header("Testing FastAPI Application Startup")
    
    try:
        print_info("Initializing FastAPI app components...")
        
        # Import app components
        from app.core.config import settings
        print_success("Settings loaded successfully")
        
        from app.core.supabase_client import init_supabase
        print_info("Initializing Supabase clients...")
        init_supabase()
        print_success("Supabase clients initialized")
        
        # Test database engine creation
        from app.core.database import engine
        print_info("Testing database engine...")
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        print_success("Database engine working")
        
        return True
        
    except Exception as e:
        print_error(f"App startup test failed: {str(e)}")
        print_info(f"Error type: {type(e).__name__}")
        import traceback
        print_info(f"Traceback:\n{traceback.format_exc()}")
        return False

async def main():
    """Run all tests"""
    print(f"\n{Colors.BOLD}Supabase Database Connection Test Suite{Colors.END}")
    print(f"{Colors.BOLD}{'='*60}{Colors.END}\n")
    
    results = {
        "Environment Variables": test_environment_variables(),
        "Supabase Client": test_supabase_client(),
        "PostgreSQL Database": await test_database_connection(),
        "FastAPI App Startup": await test_app_startup(),
    }
    
    # Summary
    print_header("Test Summary")
    
    all_passed = True
    for test_name, passed in results.items():
        if passed:
            print_success(f"{test_name}: PASSED")
        else:
            print_error(f"{test_name}: FAILED")
            all_passed = False
    
    print(f"\n{Colors.BOLD}{'='*60}{Colors.END}")
    if all_passed:
        print(f"{Colors.GREEN}{Colors.BOLD}✓ All tests passed! Your database is ready to use.{Colors.END}\n")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}✗ Some tests failed. Please check the errors above.{Colors.END}\n")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
