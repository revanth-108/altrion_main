"""BofA Secure Acceptance payment transaction log"""
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class BofaPaymentTransaction(Base):
    __tablename__ = "bofa_payment_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("public.subscriptions.id", ondelete="SET NULL"), nullable=True)
    reference_number = Column(String(255), nullable=False)
    transaction_uuid = Column(String(255))
    transaction_id = Column(String(255))
    decision = Column(String(20), nullable=False)
    reason_code = Column(String(10))
    auth_code = Column(String(50))
    amount = Column(Numeric(10, 2))
    currency = Column(String(3), default="USD")
    req_card_type = Column(String(50))
    req_card_number = Column(String(20))
    req_bill_to_email = Column(String(255))
    req_bill_to_forename = Column(String(100))
    req_bill_to_surname = Column(String(100))
    req_bill_to_address_line1 = Column(String(255))
    req_bill_to_address_city = Column(String(100))
    req_bill_to_address_state = Column(String(50))
    req_bill_to_address_postal_code = Column(String(20))
    req_bill_to_address_country = Column(String(10))
    payment_token = Column(String(255))
    avs_code = Column(String(10))
    cvn_code = Column(String(10))
    raw_response = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = ({"schema": "public"},)

    def __repr__(self):
        return f"<BofaPaymentTransaction {self.reference_number} decision={self.decision}>"
