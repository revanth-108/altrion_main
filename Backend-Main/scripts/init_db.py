"""
Initialize database - create tables
"""
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from app.core.database import engine, Base
# Import all models individually to ensure they're registered with Base
# Import in dependency order: User first, then Account, then Holding
from app.models.user import User
from app.models.account import Account
from app.models.holding import Holding
from app.models.asset_mapping import AssetMapping
from app.models.price import Price

# Import init_db after all models are loaded
from app.core.database import init_db

async def main():
    """Initialize database"""
    print("Initializing database...")
    await init_db()
    print("Database initialized successfully")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
