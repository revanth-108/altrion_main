"""
Seed Database with Realistic Asset Data
Creates sample users with diverse portfolios across multiple platforms
"""
import asyncio
import sys
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy import text
from app.core.database import engine, AsyncSessionLocal
from app.models.user import User
from app.models.account import Account
from app.models.holding import Holding
from app.models.price import Price
from app.models.asset_mapping import AssetMapping
import uuid

# Realistic current crypto prices (as of example)
CURRENT_PRICES = {
    'BTC': Decimal('45234.56'),
    'ETH': Decimal('2456.78'),
    'SOL': Decimal('98.45'),
    'USDC': Decimal('1.00'),
    'USDT': Decimal('1.00'),
    'ADA': Decimal('0.52'),
    'DOT': Decimal('7.23'),
    'MATIC': Decimal('0.89'),
    'AVAX': Decimal('38.12'),
    'LINK': Decimal('15.67'),
}

async def clear_existing_data():
    """Clear existing test data (optional)"""
    print("🗑️  Clearing existing data...")
    async with AsyncSessionLocal() as session:
        try:
            # Delete in correct order (respect foreign keys)
            await session.execute(text("DELETE FROM holdings"))
            await session.execute(text("DELETE FROM accounts"))
            await session.execute(text("DELETE FROM users WHERE email LIKE '%@demo.com'"))
            await session.commit()
            print("✅ Existing demo data cleared")
        except Exception as e:
            print(f"⚠️  Clear data error (might be empty): {e}")
            await session.rollback()

async def seed_prices():
    """Seed current prices"""
    print("\n💰 Seeding price data...")
    async with AsyncSessionLocal() as session:
        try:
            for symbol, price in CURRENT_PRICES.items():
                # Check if exists
                result = await session.execute(
                    text("SELECT id FROM prices WHERE canonical_symbol = :symbol"),
                    {"symbol": symbol}
                )
                if result.fetchone():
                    # Update
                    await session.execute(
                        text("""
                            UPDATE prices 
                            SET usd_price = :price, last_updated = NOW()
                            WHERE canonical_symbol = :symbol
                        """),
                        {"symbol": symbol, "price": price}
                    )
                else:
                    # Insert
                    await session.execute(
                        text("""
                            INSERT INTO prices (id, canonical_symbol, usd_price, source, last_updated)
                            VALUES (:symbol, :symbol, :price, 'coinmarketcap', NOW())
                        """),
                        {"symbol": symbol, "price": price}
                    )
            
            await session.commit()
            print(f"✅ {len(CURRENT_PRICES)} prices seeded")
        except Exception as e:
            print(f"❌ Price seeding error: {e}")
            await session.rollback()
            raise

async def create_demo_user_1():
    """
    Demo User 1: Conservative Investor
    - Focus on stablecoins and blue-chip crypto
    - Multiple exchange accounts
    """
    print("\n👤 Creating Demo User 1: Conservative Investor...")
    
    async with AsyncSessionLocal() as session:
        try:
            # Create user
            user = User(
                id=uuid.uuid4(),
                supabase_user_id=f"demo_user_1_{uuid.uuid4().hex[:8]}",
                email="conservative.investor@demo.com",
                name="Alex Johnson"
            )
            session.add(user)
            await session.flush()
            
            # Account 1: Coinbase (Main holdings)
            coinbase_account = Account(
                id=uuid.uuid4(),
                user_id=user.id,
                provider="coinbase",
                provider_account_id=f"coinbase_{uuid.uuid4().hex[:12]}",
                name="Coinbase Pro",
                account_type="exchange",
                is_active=True,
                last_synced_at=datetime.utcnow()
            )
            session.add(coinbase_account)
            await session.flush()
            
            # Holdings in Coinbase
            holdings_coinbase = [
                ('BTC', Decimal('0.5'), 'crypto'),
                ('ETH', Decimal('5.0'), 'crypto'),
                ('USDC', Decimal('25000.00'), 'cash_equivalent'),
            ]
            
            for symbol, quantity, asset_class in holdings_coinbase:
                holding = Holding(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    account_id=coinbase_account.id,
                    canonical_symbol=symbol,
                    asset_class=asset_class,
                    quantity=quantity,
                    source='coinbase',
                    retrieved_at=datetime.utcnow()
                )
                session.add(holding)
            
            # Account 2: Hardware Wallet (Cold storage)
            wallet_account = Account(
                id=uuid.uuid4(),
                user_id=user.id,
                provider="wallet",
                provider_account_id=f"0x{uuid.uuid4().hex[:40]}",
                name="Ledger Hardware Wallet",
                account_type="wallet",
                is_active=True,
                last_synced_at=datetime.utcnow()
            )
            session.add(wallet_account)
            await session.flush()
            
            # Holdings in Wallet
            holdings_wallet = [
                ('BTC', Decimal('1.25'), 'crypto'),
                ('ETH', Decimal('10.0'), 'crypto'),
            ]
            
            for symbol, quantity, asset_class in holdings_wallet:
                holding = Holding(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    account_id=wallet_account.id,
                    canonical_symbol=symbol,
                    asset_class=asset_class,
                    quantity=quantity,
                    source='wallet',
                    retrieved_at=datetime.utcnow()
                )
                session.add(holding)
            
            await session.commit()
            
            # Calculate total value
            total_btc = Decimal('0.5') + Decimal('1.25')
            total_eth = Decimal('5.0') + Decimal('10.0')
            total_value = (total_btc * CURRENT_PRICES['BTC'] + 
                          total_eth * CURRENT_PRICES['ETH'] + 
                          Decimal('25000.00'))
            
            print(f"✅ Alex Johnson created")
            print(f"   📊 Total Portfolio Value: ${total_value:,.2f}")
            print(f"   🪙 BTC: {total_btc} (${total_btc * CURRENT_PRICES['BTC']:,.2f})")
            print(f"   🪙 ETH: {total_eth} (${total_eth * CURRENT_PRICES['ETH']:,.2f})")
            print(f"   💵 USDC: $25,000.00")
            
        except Exception as e:
            print(f"❌ Error creating demo user 1: {e}")
            await session.rollback()
            raise

async def create_demo_user_2():
    """
    Demo User 2: Active Trader
    - Diverse portfolio with altcoins
    - Multiple accounts and wallets
    """
    print("\n👤 Creating Demo User 2: Active Trader...")
    
    async with AsyncSessionLocal() as session:
        try:
            user = User(
                id=uuid.uuid4(),
                supabase_user_id=f"demo_user_2_{uuid.uuid4().hex[:8]}",
                email="active.trader@demo.com",
                name="Sarah Chen"
            )
            session.add(user)
            await session.flush()
            
            # Account 1: Coinbase (Trading account)
            coinbase_account = Account(
                id=uuid.uuid4(),
                user_id=user.id,
                provider="coinbase",
                provider_account_id=f"coinbase_{uuid.uuid4().hex[:12]}",
                name="Coinbase Trading",
                account_type="exchange",
                is_active=True,
                last_synced_at=datetime.utcnow()
            )
            session.add(coinbase_account)
            await session.flush()
            
            holdings_coinbase = [
                ('ETH', Decimal('20.5'), 'crypto'),
                ('SOL', Decimal('100.0'), 'crypto'),
                ('ADA', Decimal('5000.0'), 'crypto'),
                ('MATIC', Decimal('3000.0'), 'crypto'),
                ('USDT', Decimal('15000.00'), 'cash_equivalent'),
            ]
            
            for symbol, quantity, asset_class in holdings_coinbase:
                holding = Holding(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    account_id=coinbase_account.id,
                    canonical_symbol=symbol,
                    asset_class=asset_class,
                    quantity=quantity,
                    source='coinbase',
                    retrieved_at=datetime.utcnow()
                )
                session.add(holding)
            
            # Account 2: MetaMask Wallet (DeFi)
            wallet_account = Account(
                id=uuid.uuid4(),
                user_id=user.id,
                provider="wallet",
                provider_account_id=f"0x{uuid.uuid4().hex[:40]}",
                name="MetaMask - DeFi Portfolio",
                account_type="wallet",
                is_active=True,
                last_synced_at=datetime.utcnow()
            )
            session.add(wallet_account)
            await session.flush()
            
            holdings_wallet = [
                ('ETH', Decimal('12.75'), 'crypto'),
                ('LINK', Decimal('500.0'), 'crypto'),
                ('AVAX', Decimal('80.0'), 'crypto'),
                ('USDC', Decimal('8000.00'), 'cash_equivalent'),
            ]
            
            for symbol, quantity, asset_class in holdings_wallet:
                holding = Holding(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    account_id=wallet_account.id,
                    canonical_symbol=symbol,
                    asset_class=asset_class,
                    quantity=quantity,
                    source='wallet',
                    retrieved_at=datetime.utcnow()
                )
                session.add(holding)
            
            await session.commit()
            
            # Calculate total value
            total_value = (
                Decimal('33.25') * CURRENT_PRICES['ETH'] +
                Decimal('100.0') * CURRENT_PRICES['SOL'] +
                Decimal('5000.0') * CURRENT_PRICES['ADA'] +
                Decimal('3000.0') * CURRENT_PRICES['MATIC'] +
                Decimal('500.0') * CURRENT_PRICES['LINK'] +
                Decimal('80.0') * CURRENT_PRICES['AVAX'] +
                Decimal('23000.00')  # Stablecoins
            )
            
            print(f"✅ Sarah Chen created")
            print(f"   📊 Total Portfolio Value: ${total_value:,.2f}")
            print(f"   🪙 ETH: 33.25 (2 sources)")
            print(f"   🪙 Altcoins: SOL, ADA, MATIC, LINK, AVAX")
            print(f"   💵 Stablecoins: $23,000.00")
            
        except Exception as e:
            print(f"❌ Error creating demo user 2: {e}")
            await session.rollback()
            raise

async def create_demo_user_3():
    """
    Demo User 3: HODLer
    - Long-term holder with simple portfolio
    - Just BTC and ETH
    """
    print("\n👤 Creating Demo User 3: Long-term HODLer...")
    
    async with AsyncSessionLocal() as session:
        try:
            user = User(
                id=uuid.uuid4(),
                supabase_user_id=f"demo_user_3_{uuid.uuid4().hex[:8]}",
                email="bitcoin.hodler@demo.com",
                name="Michael Peterson"
            )
            session.add(user)
            await session.flush()
            
            # Single hardware wallet account
            wallet_account = Account(
                id=uuid.uuid4(),
                user_id=user.id,
                provider="wallet",
                provider_account_id=f"0x{uuid.uuid4().hex[:40]}",
                name="Trezor Cold Storage",
                account_type="wallet",
                is_active=True,
                last_synced_at=datetime.utcnow()
            )
            session.add(wallet_account)
            await session.flush()
            
            holdings = [
                ('BTC', Decimal('3.5'), 'crypto'),
                ('ETH', Decimal('50.0'), 'crypto'),
            ]
            
            for symbol, quantity, asset_class in holdings:
                holding = Holding(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    account_id=wallet_account.id,
                    canonical_symbol=symbol,
                    asset_class=asset_class,
                    quantity=quantity,
                    source='wallet',
                    retrieved_at=datetime.utcnow()
                )
                session.add(holding)
            
            await session.commit()
            
            total_value = (
                Decimal('3.5') * CURRENT_PRICES['BTC'] +
                Decimal('50.0') * CURRENT_PRICES['ETH']
            )
            
            print(f"✅ Michael Peterson created")
            print(f"   📊 Total Portfolio Value: ${total_value:,.2f}")
            print(f"   🪙 BTC: 3.5 (${Decimal('3.5') * CURRENT_PRICES['BTC']:,.2f})")
            print(f"   🪙 ETH: 50.0 (${Decimal('50.0') * CURRENT_PRICES['ETH']:,.2f})")
            
        except Exception as e:
            print(f"❌ Error creating demo user 3: {e}")
            await session.rollback()
            raise

async def verify_data():
    """Verify seeded data"""
    print("\n🔍 Verifying seeded data...")
    
    async with AsyncSessionLocal() as session:
        try:
            # Count users
            result = await session.execute(text("SELECT COUNT(*) FROM users WHERE email LIKE '%@demo.com'"))
            user_count = result.scalar()
            
            # Count accounts
            result = await session.execute(text("SELECT COUNT(*) FROM accounts"))
            account_count = result.scalar()
            
            # Count holdings
            result = await session.execute(text("SELECT COUNT(*) FROM holdings"))
            holding_count = result.scalar()
            
            # Total portfolio value
            result = await session.execute(text("""
                SELECT SUM(h.quantity * p.usd_price)
                FROM holdings h
                JOIN prices p ON h.canonical_symbol = p.canonical_symbol
            """))
            total_value = result.scalar()
            
            print(f"\n📊 Database Summary:")
            print(f"   Users: {user_count}")
            print(f"   Accounts: {account_count}")
            print(f"   Holdings: {holding_count}")
            print(f"   Total Portfolio Value: ${total_value:,.2f}")
            
        except Exception as e:
            print(f"❌ Verification error: {e}")

async def main():
    """Main seeding function"""
    print("="*60)
    print("  SEEDING DATABASE WITH REALISTIC ASSET DATA")
    print("="*60)
    
    try:
        # Step 1: Clear existing demo data
        await clear_existing_data()
        
        # Step 2: Seed prices
        await seed_prices()
        
        # Step 3: Create demo users
        await create_demo_user_1()
        await create_demo_user_2()
        await create_demo_user_3()
        
        # Step 4: Verify
        await verify_data()
        
        print("\n" + "="*60)
        print("✅ DATABASE SEEDED SUCCESSFULLY!")
        print("="*60)
        print("\n📝 Demo User Credentials:")
        print("   1. conservative.investor@demo.com - Conservative portfolio")
        print("   2. active.trader@demo.com - Active trading portfolio")
        print("   3. bitcoin.hodler@demo.com - Simple BTC/ETH portfolio")
        print("\n💡 To test:")
        print("   1. Signin with any demo email")
        print("   2. View portfolio aggregation")
        print("   3. See multi-source holdings")
        print()
        
        return 0
        
    except Exception as e:
        print(f"\n❌ SEEDING FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        await engine.dispose()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
