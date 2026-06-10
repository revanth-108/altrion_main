"""
Plaid provider adapter for bank accounts
"""
import asyncio
from typing import List, Dict, Any
from plaid.api import plaid_api
from plaid import Environment
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.accounts_get_request_options import AccountsGetRequestOptions
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.configuration import Configuration
from plaid.api_client import ApiClient
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.transactions_sync_request_options import TransactionsSyncRequestOptions
from plaid.model.transactions_recurring_get_request import TransactionsRecurringGetRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest

from app.services.providers.base import BaseProviderAdapter
from app.core.config import settings
from app.core.logging import get_logger
from app.services.plaid_safe import ensure_dict, parse_token_data, normalize_plaid_list, normalize_plaid_value, value_type
from app.services.plaid_utils import plaid_error_context

logger = get_logger()


class PlaidAdapter(BaseProviderAdapter):
    """Plaid adapter for bank/brokerage accounts"""

    def __init__(self):
        env = settings.PLAID_ENVIRONMENT.lower()
        host = Environment.Sandbox
        if env == "development":
            host = Environment.Development
        elif env == "production":
            host = Environment.Production

        configuration = Configuration(
            host=host,
            api_key={
                "clientId": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
            },
        )
        self.api_client = ApiClient(configuration)
        self.plaid_client = plaid_api.PlaidApi(self.api_client)

    async def authenticate(self, credentials: dict) -> Dict[str, Any]:
        """
        Exchange Plaid public token for access token

        Args:
            credentials: Should contain 'public_token' from Plaid Link

        Returns:
            Token data (access_token, item_id)
        """
        credentials = ensure_dict(credentials)
        public_token = credentials.get("public_token") or credentials.get("oauth_code")

        if not public_token:
            raise ValueError("public_token required for Plaid authentication")

        try:
            request = ItemPublicTokenExchangeRequest(public_token=public_token)
            # FIX: Plaid SDK is synchronous — run in thread to avoid blocking event loop
            response = await asyncio.to_thread(
                self.plaid_client.item_public_token_exchange, request
            )
            return {
                # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
                "access_token": response.access_token,
                # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
                "item_id": response.item_id,
            }
        except Exception as e:
            logger.error("Failed to exchange Plaid token", error=str(e))
            raise

    async def exchange_public_token(self, public_token: str) -> dict:
        """
        Exchange a public_token from Plaid Link for a permanent access_token.

        Called after user completes the Plaid Link UI flow.
        The public_token is one-time use and expires in 30 minutes.

        Returns:
            dict with access_token (permanent) and item_id (stable bank identifier)
        """
        try:
            request = ItemPublicTokenExchangeRequest(public_token=public_token)
            # Plaid SDK is synchronous — run in thread to avoid blocking event loop
            response = await asyncio.to_thread(
                self.plaid_client.item_public_token_exchange, request
            )
            return {
                "access_token": response.access_token,
                "item_id": response.item_id,
            }
        except Exception as e:
            logger.error("Failed to exchange Plaid public token", error=str(e))
            raise

    async def get_item_metadata(self, access_token: str) -> dict:
        """
        Fetch metadata for a Plaid Item (bank connection).

        Used after token exchange to get institution id so we can store
        it on the account record without making extra API calls later.

        Returns:
            dict with institution_id
        """
        status = await self.get_item_status(access_token)
        return {"institution_id": status["institution_id"]}

    async def get_item_status(self, access_token: str) -> dict:
        """
        Fetch full status for a Plaid Item.

        Returns item health, error state, available products,
        consent expiration, and webhook config.

        Returns:
            dict with item_id, institution_id, error, available_products,
            billed_products, consent_expiration_time, update_type, webhook
        """
        try:
            from plaid.model.item_get_request import ItemGetRequest
            request = ItemGetRequest(access_token=access_token)
            response = await asyncio.to_thread(
                self.plaid_client.item_get, request
            )
            item = response.item

            error = None
            if item.error:
                error = {
                    "error_type": str(item.error.error_type),
                    "error_code": str(item.error.error_code),
                    "error_message": str(item.error.error_message),
                }

            return {
                "item_id": item.item_id,
                "institution_id": item.institution_id,
                "available_products": [str(p) for p in (item.available_products or [])],
                "billed_products": [str(p) for p in (item.billed_products or [])],
                "consent_expiration_time": str(item.consent_expiration_time) if item.consent_expiration_time else None,
                "update_type": item.update_type,
                "webhook": item.webhook,
                "error": error,
            }
        except Exception as e:
            logger.error("Failed to get Plaid item status", error=str(e))
            raise

    async def remove_item(self, access_token: str) -> bool:
        """
        Remove a Plaid Item (disconnect a bank).

        Revokes the access_token on Plaid's side.
        Caller must also delete the token and deactivate accounts in DB.

        Returns:
            True on success
        """
        try:
            from plaid.model.item_remove_request import ItemRemoveRequest
            request = ItemRemoveRequest(access_token=access_token)
            await asyncio.to_thread(
                self.plaid_client.item_remove, request
            )
            return True
        except Exception as e:
            logger.error("Failed to remove Plaid item", error=str(e))
            raise

    async def create_link_token(self, user_id: str, client_name: str = "Altrion") -> str:
        """Create Plaid Link token"""
        try:
            # Only pass redirect_uri if it is set AND begins with https://.
            # Plaid rejects non-HTTPS redirect URIs; omitting the kwarg entirely
            # (rather than passing None) avoids an SDK validation error.
            redirect_uri = (
                settings.PLAID_REDIRECT_URI
                if settings.PLAID_REDIRECT_URI and settings.PLAID_REDIRECT_URI.startswith("https://")
                else None
            )

            link_token_kwargs = dict(
                user=LinkTokenCreateRequestUser(client_user_id=user_id),
                client_name=client_name,
                # Products determine which Plaid APIs are accessible after Link completes.
                # auth: account/routing numbers
                # transactions: transaction history and sync
                # investments: holdings, investment transactions
                # liabilities: credit cards, mortgages, student loans
                # identity: account holder name, address, email
                # Request the same products the backend sync layer expects to use.
                products=[
                    # Products("auth"),        # Requires Plaid production approval — exposes account/routing numbers via ACH
                    Products("transactions"),
                    Products("investments"),
                ],
                country_codes=[CountryCode("US")],
                language="en",
            )
            if redirect_uri is not None:
                link_token_kwargs["redirect_uri"] = redirect_uri

            request = LinkTokenCreateRequest(**link_token_kwargs)
            # FIX: Plaid SDK is synchronous — run in thread to avoid blocking event loop
            response = await asyncio.to_thread(self.plaid_client.link_token_create, request)
            # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
            return response.link_token
        except Exception as e:
            logger.error("Failed to create Plaid link token", error=str(e))
            raise


    async def fetch_accounts(self, token_data: dict) -> List[Dict[str, Any]]:
        """Fetch Plaid accounts"""
        token_data = parse_token_data(token_data)
        access_token = token_data.get("access_token")

        try:
            request = AccountsGetRequest(access_token=access_token)
            # FIX: Plaid SDK is synchronous — run in thread to avoid blocking event loop
            response = await asyncio.to_thread(self.plaid_client.accounts_get, request)

            accounts = []
            # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
            for account in response.accounts:
                accounts.append({
                    # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
                    "id": account.account_id,
                    # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
                    "name": account.name,
                    # account.type is a Plaid AccountType object — convert to string
                    "type": str(account.type.value) if hasattr(account.type, "value") else str(account.type),
                    # subtype e.g. checking, savings, credit card, 401k
                    "subtype": str(account.subtype.value) if hasattr(account.subtype, "value") else str(account.subtype),
                    # last 4 digits of account number — safe to display
                    "mask": account.mask,
                })

            return accounts
        except Exception as e:
            logger.error("Failed to fetch Plaid accounts", error=str(e))
            raise

    async def fetch_holdings(self, account_id: str, token_data: dict) -> Dict[str, Any]:
        """Fetch holdings for a Plaid account"""
        token_data = parse_token_data(token_data)
        access_token = token_data.get("access_token")

        try:
            request = AccountsGetRequest(
                access_token=access_token,
                options=AccountsGetRequestOptions(account_ids=[account_id]),
            )
            # FIX: Plaid SDK is synchronous — run in thread to avoid blocking event loop
            response = await asyncio.to_thread(self.plaid_client.accounts_get, request)

            # FIX: Plaid SDK v9+ returns typed objects, not dicts — use attribute access
            account = next((acc for acc in response.accounts if acc.account_id == account_id), None)
            if not account:
                raise ValueError(f"Account {account_id} not found")

            balances = account.balances
            return {
                "account_id": account_id,
                "name": account.name,
                "type": str(account.type.value) if hasattr(account.type, "value") else str(account.type),
                "subtype": str(account.subtype.value) if hasattr(account.subtype, "value") else str(account.subtype),
                "mask": account.mask,
                "balances": {
                    "available": getattr(balances, "available", None),
                    "current": getattr(balances, "current", None),
                    "limit": getattr(balances, "limit", None),
                    "currency": getattr(balances, "iso_currency_code", "USD"),
                },
            }
        except Exception as e:
            logger.error("Failed to fetch Plaid holdings", error=str(e), account_id=account_id)
            raise

    async def get_balances(self, access_token: str, account_ids: list = None) -> List[Dict[str, Any]]:
        """
        Fetch real-time account balances from Plaid.

        Unlike fetch_accounts() which returns cached data,
        this triggers a live refresh from the bank.
        Use sparingly — higher latency, counts against rate limits.

        Args:
            access_token: Plaid access token for this item
            account_ids: Optional list of account IDs to filter.
                         If None, returns all accounts for the item.

        Returns:
            List of account dicts with fresh balance data.
        """
        try:
            from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
            from plaid.model.accounts_balance_get_request_options import AccountsBalanceGetRequestOptions

            options = None
            if account_ids:
                options = AccountsBalanceGetRequestOptions(account_ids=account_ids)

            # Plaid SDK rejects options=None — only pass options when account_ids provided
            if options:
                request = AccountsBalanceGetRequest(
                    access_token=access_token,
                    options=options,
                )
            else:
                request = AccountsBalanceGetRequest(
                    access_token=access_token,
                )
            response = await asyncio.to_thread(
                self.plaid_client.accounts_balance_get, request
            )

            accounts = []
            for account in response.accounts:
                account_dict = normalize_plaid_value(account)
                balances = getattr(account, "balances", None) or account_dict.get("balances")
                balances_dict = normalize_plaid_value(balances)

                def field(model_obj, model_dict: dict, key: str, default=None):
                    value = model_dict.get(key) if model_dict else None
                    if value is None and model_obj is not None:
                        value = getattr(model_obj, key, None)
                    if hasattr(value, "value"):
                        value = value.value
                    if isinstance(value, dict) and "value" in value:
                        value = value["value"]
                    return default if value is None else value

                account_type = field(account, account_dict, "type")
                account_subtype = field(account, account_dict, "subtype")
                accounts.append({
                    "account_id": field(account, account_dict, "account_id"),
                    "name": field(account, account_dict, "name"),
                    "type": str(account_type) if account_type is not None else None,
                    "subtype": str(account_subtype) if account_subtype is not None else None,
                    "mask": field(account, account_dict, "mask"),
                    "balances": balances_dict,
                    # available: spendable balance (null for investment/loan)
                    "available": field(balances, balances_dict, "available"),
                    # current: posted balance (outstanding balance for credit)
                    "current": field(balances, balances_dict, "current"),
                    # limit: credit limit (only for credit accounts)
                    "limit": field(balances, balances_dict, "limit"),
                    "currency": (
                        field(balances, balances_dict, "iso_currency_code")
                        or field(balances, balances_dict, "unofficial_currency_code")
                        or "USD"
                    ),
                })

            return accounts

        except Exception as e:
            context = plaid_error_context(e)
            display_message = (context.get("plaid_display_message") or "").lower()
            if context.get("plaid_error_code") == "INVALID_PRODUCT" and "balance" in display_message:
                logger.info(
                    "Plaid balance product unavailable; falling back to accounts/get",
                    error=context.get("error"),
                    plaid_error_code=context.get("plaid_error_code"),
                    plaid_display_message=context.get("plaid_display_message"),
                )
                return await self._get_balances_from_accounts(access_token, account_ids)

            logger.error("Failed to fetch Plaid balances", error=str(e))
            raise

    async def _get_balances_from_accounts(
        self,
        access_token: str,
        account_ids: list = None,
    ) -> List[Dict[str, Any]]:
        """Fallback balance source when accounts/balance/get is unavailable."""
        options = None
        if account_ids:
            options = AccountsGetRequestOptions(account_ids=account_ids)

        if options:
            request = AccountsGetRequest(access_token=access_token, options=options)
        else:
            request = AccountsGetRequest(access_token=access_token)

        response = await asyncio.to_thread(self.plaid_client.accounts_get, request)

        accounts = []
        for account in response.accounts:
            account_dict = normalize_plaid_value(account)
            balances = getattr(account, "balances", None) or account_dict.get("balances")
            balances_dict = normalize_plaid_value(balances)

            def field(model_obj, model_dict: dict, key: str, default=None):
                value = model_dict.get(key) if model_dict else None
                if value is None and model_obj is not None:
                    value = getattr(model_obj, key, None)
                if hasattr(value, "value"):
                    value = value.value
                if isinstance(value, dict) and "value" in value:
                    value = value["value"]
                return default if value is None else value

            account_type = field(account, account_dict, "type")
            account_subtype = field(account, account_dict, "subtype")
            accounts.append({
                "account_id": field(account, account_dict, "account_id"),
                "name": field(account, account_dict, "name"),
                "type": str(account_type) if account_type is not None else None,
                "subtype": str(account_subtype) if account_subtype is not None else None,
                "mask": field(account, account_dict, "mask"),
                "balances": balances_dict,
                "available": field(balances, balances_dict, "available"),
                "current": field(balances, balances_dict, "current"),
                "limit": field(balances, balances_dict, "limit"),
                "currency": (
                    field(balances, balances_dict, "iso_currency_code")
                    or field(balances, balances_dict, "unofficial_currency_code")
                    or "USD"
                ),
            })

        return accounts

    async def sync_transactions(
        self,
        access_token: str,
        cursor: str = None,
        count: int = 500,
        log_context: dict | None = None,
    ) -> dict:
        """
        Fetch transactions incrementally using cursor-based pagination.

        This is the recommended way to fetch transactions from Plaid.
        On first call, omit cursor — Plaid returns full transaction history.
        On subsequent calls, pass the next_cursor from the previous response
        to get only new, modified, or removed transactions since last sync.

        The cursor must be stored in provider_tokens.cursor after each call
        and passed on the next call to avoid re-fetching all transactions.

        Args:
            access_token: Plaid access token for this item
            cursor: Pass None for first sync, next_cursor for incremental
            count: Max transactions per page (default 100, max 500)

        Returns:
            dict with added, modified, removed, next_cursor, has_more
        """
        try:
            options = TransactionsSyncRequestOptions(
                include_personal_finance_category=True,
            )

            # Parse transaction objects into plain dicts
            def parse_transaction(txn) -> dict:
                """Convert Plaid transaction SDK object to plain dict"""
                category = getattr(txn, "personal_finance_category", None)
                return {
                    "transaction_id": txn.transaction_id,
                    "account_id": txn.account_id,
                    # Positive = debit/outflow, Negative = credit/inflow
                    "amount": txn.amount,
                    "date": str(txn.date),
                    "authorized_date": str(txn.authorized_date) if getattr(txn, "authorized_date", None) else None,
                    # Raw bank description
                    "name": txn.name,
                    # Cleaned merchant name e.g. "Uber" not "UBER 072515 SF**POOL**"
                    "merchant_name": getattr(txn, "merchant_name", None),
                    "pending": txn.pending,
                    # in store, online, or other
                    "payment_channel": getattr(txn, "payment_channel", None),
                    # Enriched category data
                    "category_primary": getattr(category, "primary", None) if category else None,
                    "category_detailed": getattr(category, "detailed", None) if category else None,
                    "category_confidence": getattr(category, "confidence_level", None) if category else None,
                    "logo_url": getattr(txn, "logo_url", None),
                    "website": getattr(txn, "website", None),
                }

            added = []
            modified = []
            removed = []
            next_cursor = cursor
            has_more = True
            loop_count = 0

            while has_more:
                loop_count += 1
                # Cursor must be omitted entirely on first call — passing None
                # causes a Plaid SDK validation error.
                if next_cursor:
                    request = TransactionsSyncRequest(
                        access_token=access_token,
                        cursor=next_cursor,
                        count=count,
                        options=options,
                    )
                else:
                    request = TransactionsSyncRequest(
                        access_token=access_token,
                        count=count,
                        options=options,
                    )

                response = await asyncio.to_thread(
                    self.plaid_client.transactions_sync, request
                )

                page_added = [parse_transaction(t) for t in response.added]
                page_modified = [parse_transaction(t) for t in response.modified]
                page_removed = [r.transaction_id for r in response.removed]
                added.extend(page_added)
                modified.extend(page_modified)
                removed.extend(page_removed)
                next_cursor = response.next_cursor
                has_more = bool(response.has_more)
                logger.info(
                    "transactions_sync_page",
                    endpoint="transactions/sync",
                    page=loop_count,
                    added_count=len(page_added),
                    modified_count=len(page_modified),
                    removed_count=len(page_removed),
                    has_more=has_more,
                    **(log_context or {}),
                )

            return {
                "added": added,
                "modified": modified,
                "removed": removed,
                "next_cursor": next_cursor,
                "has_more": False,
                "loop_count": loop_count,
            }

        except Exception as e:
            logger.error("Failed to sync Plaid transactions", error=str(e))
            raise

    async def get_recurring_transactions(
        self,
        access_token: str,
        account_ids: list,
    ) -> dict:
        """
        Detect recurring transactions — subscriptions, bills, income.

        Uses raw httpx instead of the Plaid SDK because the SDK's response
        deserializer rejects null category_id values that Plaid sandbox
        returns for some inflow streams (known sandbox behavior).

        Args:
            access_token: Plaid access token
            account_ids: Required — must pass at least one account_id

        Returns:
            dict with inflow_streams and outflow_streams lists
        """
        try:
            import httpx

            # Build base URL from environment
            env = settings.PLAID_ENVIRONMENT.lower()
            if env == "production":
                base_url = "https://production.plaid.com"
            elif env == "development":
                base_url = "https://development.plaid.com"
            else:
                base_url = "https://sandbox.plaid.com"

            payload = {
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": access_token,
                "account_ids": account_ids,
                "options": {
                    "include_personal_finance_category": True,
                }
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/transactions/recurring/get",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
            data = normalize_plaid_value(response.json())

            def parse_stream(stream: dict) -> dict:
                """Parse recurring stream from raw JSON response"""
                stream = normalize_plaid_value(stream)
                avg = normalize_plaid_value(stream.get("average_amount"))
                last = normalize_plaid_value(stream.get("last_amount"))
                return {
                    "stream_id": stream.get("stream_id"),
                    "account_id": stream.get("account_id"),
                    "description": stream.get("description"),
                    "merchant_name": stream.get("merchant_name"),
                    "frequency": stream.get("frequency"),
                    "average_amount": avg.get("amount"),
                    "last_amount": last.get("amount"),
                    "first_date": stream.get("first_date"),
                    "last_date": stream.get("last_date"),
                    "predicted_next_date": stream.get("predicted_next_date"),
                    "status": stream.get("status"),
                    "is_active": stream.get("is_active"),
                }

            return {
                "inflow_streams": [parse_stream(s) for s in normalize_plaid_list(data.get("inflow_streams", []))],
                "outflow_streams": [parse_stream(s) for s in normalize_plaid_list(data.get("outflow_streams", []))],
            }

        except Exception as e:
            logger.error("Failed to get recurring transactions", error=str(e))
            raise

    async def get_holdings(self, access_token: str) -> dict:
        """
        Fetch investment portfolio holdings from Plaid.

        Returns current holdings (stocks, ETFs, crypto, mutual funds)
        along with security details (ticker, name, type, price).

        Each holding references a security via security_id.
        The securities list contains full details for each unique security.

        Uses raw httpx instead of SDK to avoid typed object validation
        issues with nullable fields (same pattern as get_recurring_transactions).

        Args:
            access_token: Plaid access token for this item

        Returns:
            dict with holdings list and securities list
        """
        try:
            import httpx

            env = settings.PLAID_ENVIRONMENT.lower()
            if env == "production":
                base_url = "https://production.plaid.com"
            elif env == "development":
                base_url = "https://development.plaid.com"
            else:
                base_url = "https://sandbox.plaid.com"

            payload = {
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": access_token,
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/investments/holdings/get",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = normalize_plaid_value(response.json())

            def parse_holding(h: dict) -> dict:
                h = normalize_plaid_value(h)
                return {
                    "account_id": h.get("account_id"),
                    "security_id": h.get("security_id"),
                    "quantity": h.get("quantity"),
                    # Current price per share as reported by institution
                    "institution_price": h.get("institution_price"),
                    # Total current value (quantity x institution_price)
                    "institution_value": h.get("institution_value"),
                    # Original purchase price per share — for gain/loss calc
                    "cost_basis": h.get("cost_basis"),
                    "currency": h.get("iso_currency_code", "USD"),
                }

            def parse_security(s: dict) -> dict:
                s = normalize_plaid_value(s)
                return {
                    "security_id": s.get("security_id"),
                    "name": s.get("name"),
                    # Exchange ticker e.g. AAPL, BTC — may be null
                    "ticker_symbol": s.get("ticker_symbol"),
                    # equity, etf, mutual fund, cryptocurrency, cash, other
                    "type": s.get("type"),
                    "is_cash_equivalent": s.get("is_cash_equivalent", False),
                    "close_price": s.get("close_price"),
                    "currency": s.get("iso_currency_code", "USD"),
                }

            return {
                "holdings": [parse_holding(h) for h in normalize_plaid_list(data.get("holdings", []))],
                "securities": [parse_security(s) for s in normalize_plaid_list(data.get("securities", []))],
            }

        except Exception as e:
            logger.error("Failed to fetch Plaid holdings", error=str(e), error_type=value_type(e))
            raise

    async def get_investment_transactions(
        self,
        access_token: str,
        start_date: str,
        end_date: str,
        account_ids: list = None,
    ) -> dict:
        """
        Fetch investment transaction history — buys, sells, dividends.

        Requires explicit date range unlike transactions/sync.
        Returns investment activity for the specified period.

        Args:
            access_token: Plaid access token
            start_date: Start date string YYYY-MM-DD
            end_date: End date string YYYY-MM-DD
            account_ids: Optional list to filter to specific accounts

        Returns:
            dict with investment_transactions and securities lists
        """
        try:
            import httpx

            env = settings.PLAID_ENVIRONMENT.lower()
            if env == "production":
                base_url = "https://production.plaid.com"
            elif env == "development":
                base_url = "https://development.plaid.com"
            else:
                base_url = "https://sandbox.plaid.com"

            payload = {
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": access_token,
                "start_date": start_date,
                "end_date": end_date,
            }

            if account_ids:
                payload["options"] = {"account_ids": account_ids}

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/investments/transactions/get",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = normalize_plaid_value(response.json())

            def parse_investment_txn(t: dict) -> dict:
                t = normalize_plaid_value(t)
                return {
                    "investment_transaction_id": t.get("investment_transaction_id"),
                    "account_id": t.get("account_id"),
                    "security_id": t.get("security_id"),
                    "date": t.get("date"),
                    "name": t.get("name"),
                    "quantity": t.get("quantity"),
                    "amount": t.get("amount"),
                    "price": t.get("price"),
                    "fees": t.get("fees"),
                    # buy, sell, dividend, cash, transfer, other
                    "type": t.get("type"),
                    "subtype": t.get("subtype"),
                    "currency": t.get("iso_currency_code", "USD"),
                }

            def parse_security(s: dict) -> dict:
                s = normalize_plaid_value(s)
                return {
                    "security_id": s.get("security_id"),
                    "name": s.get("name"),
                    "ticker_symbol": s.get("ticker_symbol"),
                    "type": s.get("type"),
                    "is_cash_equivalent": s.get("is_cash_equivalent", False),
                    "close_price": s.get("close_price"),
                }

            return {
                "investment_transactions": [parse_investment_txn(t) for t in normalize_plaid_list(data.get("investment_transactions", []))],
                "securities": [parse_security(s) for s in normalize_plaid_list(data.get("securities", []))],
                "total_investment_transactions": data.get("total_investment_transactions", 0),
            }

        except Exception as e:
            logger.error("Failed to fetch investment transactions", error=str(e))
            raise

    async def get_liabilities(self, access_token: str) -> dict:
        """
        Fetch debt account details from Plaid.

        Returns detailed information about:
        - Credit cards: APR, minimum payment, due date, statement balance
        - Mortgages: interest rate, maturity date, monthly payment, escrow
        - Student loans: repayment plan, servicer, PSLF eligibility

        Uses raw httpx to avoid SDK typed object validation issues.

        Args:
            access_token: Plaid access token for this item

        Returns:
            dict with credit, mortgage, and student lists
        """
        try:
            import httpx

            env = settings.PLAID_ENVIRONMENT.lower()
            if env == "production":
                base_url = "https://production.plaid.com"
            elif env == "development":
                base_url = "https://development.plaid.com"
            else:
                base_url = "https://sandbox.plaid.com"

            payload = {
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": access_token,
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/liabilities/get",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

            liabilities = normalize_plaid_value(data.get("liabilities"))

            def parse_credit(c: dict) -> dict:
                c = normalize_plaid_value(c)
                return {
                    "account_id": c.get("account_id"),
                    "aprs": c.get("aprs", []),
                    "is_overdue": c.get("is_overdue"),
                    "last_payment_amount": c.get("last_payment_amount"),
                    "last_payment_date": c.get("last_payment_date"),
                    "last_statement_balance": c.get("last_statement_balance"),
                    "last_statement_issue_date": c.get("last_statement_issue_date"),
                    "minimum_payment_amount": c.get("minimum_payment_amount"),
                    "next_payment_due_date": c.get("next_payment_due_date"),
                }

            def parse_mortgage(m: dict) -> dict:
                m = normalize_plaid_value(m)
                rate = normalize_plaid_value(m.get("interest_rate"))
                address = normalize_plaid_value(m.get("property_address"))
                return {
                    "account_id": m.get("account_id"),
                    "interest_rate_percentage": rate.get("percentage"),
                    # fixed or variable
                    "interest_rate_type": rate.get("type"),
                    "maturity_date": m.get("maturity_date"),
                    "origination_date": m.get("origination_date"),
                    "origination_principal": m.get("origination_principal_amount"),
                    "next_monthly_payment": m.get("next_monthly_payment"),
                    "next_payment_due_date": m.get("next_payment_due_date"),
                    "escrow_balance": m.get("escrow_balance"),
                    "has_pmi": m.get("has_pmi"),
                    "ytd_interest_paid": m.get("ytd_interest_paid"),
                    "ytd_principal_paid": m.get("ytd_principal_paid"),
                    "property_address": {
                        "street": address.get("street"),
                        "city": address.get("city"),
                        "region": address.get("region"),
                        "postal_code": address.get("postal_code"),
                        "country": address.get("country"),
                    },
                }

            def parse_student(s: dict) -> dict:
                s = normalize_plaid_value(s)
                plan = normalize_plaid_value(s.get("repayment_plan"))
                pslf = normalize_plaid_value(s.get("pslf_status"))
                return {
                    "account_id": s.get("account_id"),
                    "interest_rate_percentage": s.get("interest_rate_percentage"),
                    "outstanding_interest_amount": s.get("outstanding_interest_amount"),
                    "next_payment_due_date": s.get("next_payment_due_date"),
                    "minimum_payment_amount": s.get("minimum_payment_amount"),
                    "repayment_plan_type": plan.get("type"),
                    "repayment_plan_description": plan.get("description"),
                    "pslf_estimated_eligibility_date": pslf.get("estimated_eligibility_date"),
                    "loan_name": s.get("loan_name"),
                    "sequence_number": s.get("sequence_number"),
                }

            return {
                "credit": [parse_credit(c) for c in normalize_plaid_list(liabilities.get("credit", []))],
                "mortgage": [parse_mortgage(m) for m in normalize_plaid_list(liabilities.get("mortgage", []))],
                "student": [parse_student(s) for s in normalize_plaid_list(liabilities.get("student", []))],
            }

        except Exception as e:
            logger.error("Failed to fetch Plaid liabilities", error=str(e), error_type=value_type(e))
            raise

    async def get_identity(self, access_token: str) -> list:
        """
        Fetch account holder identity information from Plaid.

        Returns identity data as reported by the bank including:
        - Full legal name(s) on the account
        - Physical addresses (primary and secondary)
        - Email addresses
        - Phone numbers

        Requires identity product to be enabled on the item.
        Already included in our link token products list.

        Uses raw httpx to avoid SDK typed object validation issues.

        Args:
            access_token: Plaid access token for this item

        Returns:
            list of accounts each with owners[] containing identity data
        """
        try:
            import httpx

            env = settings.PLAID_ENVIRONMENT.lower()
            if env == "production":
                base_url = "https://production.plaid.com"
            elif env == "development":
                base_url = "https://development.plaid.com"
            else:
                base_url = "https://sandbox.plaid.com"

            payload = {
                "client_id": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
                "access_token": access_token,
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/identity/get",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

            def parse_owner(owner: dict) -> dict:
                return {
                    "names": owner.get("names", []),
                    "addresses": [
                        {
                            "street": a.get("data", {}).get("street"),
                            "city": a.get("data", {}).get("city"),
                            "region": a.get("data", {}).get("region"),
                            "postal_code": a.get("data", {}).get("postal_code"),
                            "country": a.get("data", {}).get("country"),
                            "primary": a.get("primary", False),
                        }
                        for a in owner.get("addresses", [])
                    ],
                    "emails": [
                        {
                            "email": e.get("data"),
                            "primary": e.get("primary", False),
                            "type": e.get("type"),
                        }
                        for e in owner.get("emails", [])
                    ],
                    "phone_numbers": [
                        {
                            "number": p.get("data"),
                            "primary": p.get("primary", False),
                            "type": p.get("type"),
                        }
                        for p in owner.get("phone_numbers", [])
                    ],
                }

            return [
                {
                    "account_id": account.get("account_id"),
                    "name": account.get("name"),
                    "owners": [parse_owner(o) for o in account.get("owners", [])],
                }
                for account in data.get("accounts", [])
            ]

        except Exception as e:
            logger.error("Failed to fetch Plaid identity", error=str(e))
            raise

    async def extract_holdings(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw_data = normalize_plaid_value(raw_data)
        holdings = []

        account = raw_data.get("account")
        if account:
            account_type = str(account.type.value) if hasattr(account.type, "value") else str(account.type)
        else:
            account_type = raw_data.get("type")

        if not account_type:
            return holdings

        if account_type == "depository":
            balances = raw_data.get("balances")
            if balances:
                balances_dict = normalize_plaid_value(balances)
                if balances_dict:
                    available = balances_dict.get("available")
                    current = balances_dict.get("current")
                    subtype = str(raw_data.get("subtype") or "").strip().lower()
                else:
                    available = getattr(balances, "available", None)
                    current = getattr(balances, "current", None)
                    subtype = str(getattr(account, "subtype", "") if account else raw_data.get("subtype") or "").strip().lower()
                if subtype and subtype not in {"checking", "savings", "cash management", "money market", "cd"}:
                    return holdings
                amount = available if available is not None else current
                if amount and amount > 0:
                    holdings.append({"symbol": "USD", "quantity": str(amount)})

        return holdings

    async def get_transactions(
        self,
        access_token: str,
        start_date,
        end_date,
        account_ids: list = None,
        count: int = 100,
        offset: int = 0,
    ) -> dict:
        """
        Fetch transactions for a date range via Plaid /transactions/get.

        Args:
            access_token: Plaid access token
            start_date: Start date (datetime.date)
            end_date: End date (datetime.date)
            account_ids: Optional list of Plaid account IDs to filter
            count: Number of transactions per page (max 500)
            offset: Pagination offset

        Returns:
            dict with transactions list and total_transactions count
        """
        from plaid.model.transactions_get_request import TransactionsGetRequest
        from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

        try:
            kwargs = {"count": count, "offset": offset}
            if account_ids:
                kwargs["account_ids"] = account_ids
            options = TransactionsGetRequestOptions(**kwargs)

            request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date,
                options=options,
            )
            response = await asyncio.to_thread(
                self.plaid_client.transactions_get, request
            )

            return {
                "transactions": self._map_transactions(response.transactions),
                "total_transactions": response.total_transactions,
            }
        except Exception as e:
            logger.error("Failed to get Plaid transactions", error=str(e))
            raise

    def _map_transactions(self, transactions) -> list:
        """Map Plaid SDK transaction objects to plain dicts."""
        result = []
        for t in transactions:
            pfc = None
            if hasattr(t, "personal_finance_category") and t.personal_finance_category:
                pfc = t.personal_finance_category.primary

            result.append({
                "transaction_id": t.transaction_id,
                "account_id": t.account_id,
                "amount": float(t.amount),
                "iso_currency_code": t.iso_currency_code or "USD",
                "date": str(t.date),
                "authorized_date": str(t.authorized_date) if t.authorized_date else None,
                "name": t.name,
                "merchant_name": getattr(t, "merchant_name", None),
                "category": t.category if t.category else None,
                "personal_finance_category": pfc,
                "pending": t.pending,
                "transaction_type": getattr(t, "transaction_type", None),
            })
        return result
