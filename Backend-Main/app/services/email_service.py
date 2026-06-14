"""
Email service for subscription notifications.
Sends via SMTP (smtplib, no extra dependencies).
Configure SMTP_HOST / SMTP_USER / SMTP_PASSWORD in .env.
"""
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

_BASE_STYLE = """
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f1117; color: #e2e8f0; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 40px auto; background: #1a1d27;
          border: 1px solid #2d3148; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #6366f1, #4f46e5);
             padding: 32px 40px; text-align: center; }
  .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 700; }
  .header p  { margin: 6px 0 0; color: rgba(255,255,255,.75); font-size: 14px; }
  .body { padding: 32px 40px; }
  .body p  { margin: 0 0 16px; line-height: 1.6; color: #94a3b8; font-size: 15px; }
  .body strong { color: #e2e8f0; }
  .info-box { background: #0f1117; border: 1px solid #2d3148; border-radius: 8px;
              padding: 16px 20px; margin: 20px 0; }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0;
              font-size: 14px; border-bottom: 1px solid #2d3148; }
  .info-row:last-child { border-bottom: none; }
  .info-row span:first-child { color: #64748b; }
  .info-row span:last-child  { color: #e2e8f0; font-weight: 600; }
  .btn { display: inline-block; background: #6366f1; color: #fff !important;
         text-decoration: none; padding: 12px 28px; border-radius: 8px;
         font-size: 14px; font-weight: 600; margin-top: 8px; }
  .footer { padding: 20px 40px; border-top: 1px solid #2d3148; text-align: center;
             font-size: 12px; color: #475569; }
</style>
"""


def _send_smtp(to: str, subject: str, html: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.info("email_skipped_no_credentials", to=to, subject=subject)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM, to, msg.as_string())
        logger.info("email_sent", to=to, subject=subject)
    except Exception as exc:
        logger.error("email_send_failed", to=to, subject=subject, error=str(exc))


async def _send(to: str, subject: str, html: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_smtp, to, subject, html)


class EmailService:

    @staticmethod
    async def send_subscription_activated(
        email: str,
        name: str,
        plan_name: str,
        price: str,
        billing_cycle: str,
        period_end: Optional[str] = None,
    ) -> None:
        subject = "Your Altrion subscription is now active"
        renews_line = (
            f'<div class="info-row"><span>Renews on</span><span>{period_end}</span></div>'
            if period_end else ""
        )
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>You're all set, {name}! 🎉</h1>
    <p>Your Altrion subscription is active</p>
  </div>
  <div class="body">
    <p>Thank you for subscribing. Here's a summary of your plan:</p>
    <div class="info-box">
      <div class="info-row"><span>Plan</span><span>{plan_name}</span></div>
      <div class="info-row"><span>Billing</span><span>{billing_cycle.capitalize()}</span></div>
      <div class="info-row"><span>Amount</span><span>${price}/{billing_cycle}</span></div>
      {renews_line}
    </div>
    <a href="{settings.FRONTEND_URL}/dashboard/profile" class="btn">View Subscription</a>
  </div>
  <div class="footer">© 2026 Altrion · <a href="{settings.FRONTEND_URL}/pricing" style="color:#6366f1">Manage plan</a></div>
</div></body></html>"""
        await _send(email, subject, html)

    @staticmethod
    async def send_subscription_canceled(
        email: str,
        name: str,
        plan_name: str,
        end_date: str,
        immediately: bool = False,
    ) -> None:
        if immediately:
            subject = "Your Altrion subscription has been canceled"
            body = "<p>Your subscription has been <strong>canceled immediately</strong>. You no longer have access to premium features.</p>"
        else:
            subject = "Subscription cancellation confirmed — access until " + end_date
            body = f"<p>Your subscription has been canceled as requested. You'll continue to have <strong>full access until {end_date}</strong>, then it will not renew.</p>"

        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
    <h1>Subscription Canceled</h1>
    <p>Hi {name}, we're sorry to see you go</p>
  </div>
  <div class="body">
    {body}
    <div class="info-box">
      <div class="info-row"><span>Plan canceled</span><span>{plan_name}</span></div>
      <div class="info-row"><span>Access until</span><span>{end_date}</span></div>
    </div>
    <p>Changed your mind? You can reactivate any time before {end_date}.</p>
    <a href="{settings.FRONTEND_URL}/dashboard/profile" class="btn">Reactivate Subscription</a>
  </div>
  <div class="footer">© 2026 Altrion · Questions? <a href="mailto:support@altrion.ai" style="color:#6366f1">Contact us</a></div>
</div></body></html>"""
        await _send(email, subject, html)

    @staticmethod
    async def send_subscription_reactivated(
        email: str,
        name: str,
        plan_name: str,
        next_billing: str,
    ) -> None:
        subject = "Your Altrion subscription is back on!"
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Welcome back, {name}! ✅</h1>
    <p>Your subscription has been reactivated</p>
  </div>
  <div class="body">
    <p>Great news — your subscription is <strong>active again</strong> and will continue renewing as normal.</p>
    <div class="info-box">
      <div class="info-row"><span>Plan</span><span>{plan_name}</span></div>
      <div class="info-row"><span>Next billing</span><span>{next_billing}</span></div>
    </div>
    <a href="{settings.FRONTEND_URL}/dashboard/profile" class="btn">View Subscription</a>
  </div>
  <div class="footer">© 2026 Altrion</div>
</div></body></html>"""
        await _send(email, subject, html)

    @staticmethod
    async def send_welcome_email(email: str, name: str, trial_days: int) -> None:
        subject = f"Welcome to Altrion — your {trial_days}-day trial starts now"
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Welcome to Altrion, {name}!</h1>
    <p>Your {trial_days}-day free trial is active</p>
  </div>
  <div class="body">
    <p>You now have full access to everything Altrion has to offer:</p>
    <div class="info-box">
      <div class="info-row"><span>Real-time portfolio tracking</span><span>✓</span></div>
      <div class="info-row"><span>Multi-platform sync</span><span>✓</span></div>
      <div class="info-row"><span>AI financial health score</span><span>✓</span></div>
      <div class="info-row"><span>Loan eligibility analysis</span><span>✓</span></div>
      <div class="info-row"><span>Priority support</span><span>✓</span></div>
    </div>
    <a href="{settings.FRONTEND_URL}/dashboard" class="btn">Go to Dashboard</a>
  </div>
  <div class="footer">© 2026 Altrion · <a href="mailto:support@altrion.ai" style="color:#6366f1">support@altrion.ai</a></div>
</div></body></html>"""
        await _send(email, subject, html)

    @staticmethod
    async def send_trial_ending_reminder(email: str, name: str, days_left: int) -> None:
        subject = f"Your Altrion trial ends in {days_left} day{'s' if days_left != 1 else ''}"
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background: linear-gradient(135deg, #d97706, #b45309);">
    <h1>Trial ending soon</h1>
    <p>Hi {name}, {days_left} day{'s' if days_left != 1 else ''} left</p>
  </div>
  <div class="body">
    <p>Your free trial ends in <strong>{days_left} day{'s' if days_left != 1 else ''}</strong>. Subscribe now to keep access to your portfolio insights.</p>
    <a href="{settings.FRONTEND_URL}/pricing" class="btn">Choose a Plan</a>
  </div>
  <div class="footer">© 2026 Altrion</div>
</div></body></html>"""
        await _send(email, subject, html)

    @staticmethod
    async def send_payment_success(email: str, name: str, amount: float) -> None:
        logger.info("email_payment_success_logged", email=email, name=name, amount=amount)

    @staticmethod
    async def send_payment_failed(email: str, name: str) -> None:
        subject = "Payment failed — action required"
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
    <h1>Payment failed</h1><p>Hi {name}, please update your billing info</p>
  </div>
  <div class="body">
    <p>We were unable to process your payment. Please update your payment method to keep your subscription active.</p>
    <a href="{settings.FRONTEND_URL}/dashboard/profile" class="btn">Update Payment Method</a>
  </div>
  <div class="footer">© 2026 Altrion</div>
</div></body></html>"""
        await _send(email, subject, html)


email_service = EmailService()
