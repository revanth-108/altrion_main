"""
Risk tier classification using Groq AI with heuristic fallback.
"""
from typing import Dict, Tuple, Optional
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()


class ModelClient:
    """
    Risk tier classification based on:
      1) volatility_score (from local volatility_client)
      2) the asset's market cap (decided by the AI model's internal knowledge)
    """

    def __init__(self):
        self.provider = getattr(settings, "AI_PROVIDER", "groq")

    def risk_tier(self, symbol: str, context: Dict) -> Tuple[str, float]:
        logger.info("loan_risk_tier_classify_start", symbol=symbol, provider=self.provider)
        if self.provider == "groq":
            tier, score = self._groq_risk_tier(symbol, context)
            logger.info(
                "loan_risk_tier_classify_result",
                symbol=symbol,
                tier=tier,
                confidence=score,
                provider=self.provider,
            )
            return tier, score
        raise ValueError(f"Unsupported AI_PROVIDER: {self.provider}")

    def _get_volatility(self, symbol: str, context: Dict) -> Optional[float]:
        vs: Optional[float] = None
        try:
            from app.services.loan.volatility_client import get_metrics
            m = get_metrics(symbol)
            vs = m.get("volatility_score")
        except Exception as e:
            logger.warning("metrics fetch failed", symbol=symbol, error=str(e))

        if vs is None:
            vs = context.get("volatility_score") or context.get("volatility")

        try:
            return float(vs) if vs is not None else None
        except Exception:
            return None

    def _heuristic_from_vol(self, vs: Optional[float]) -> Tuple[str, float]:
        """Fallback from volatility_score when the model fails."""
        if vs is None:
            return "Tier 2", 0.5
        if vs <= 10:
            return "Tier 1.5", 0.6
        if vs <= 25:
            return "Tier 2", 0.6
        return "Tier 3", 0.6

    def _groq_risk_tier(self, symbol: str, context: Dict) -> Tuple[str, float]:
        vs = self._get_volatility(symbol, context)

        if vs is None:
            logger.warning(
                "loan_groq_missing_volatility_heuristic",
                symbol=symbol,
                fallback="heuristic",
            )
            return self._heuristic_from_vol(vs)

        try:
            from groq import Groq
            client = Groq(api_key=settings.GROQ_API_KEY)

            prompt = f"""
You are a crypto risk officer. Classify the asset into one of exactly:
['Tier 1','Tier 1.5','Tier 2','Tier 3'].

You MUST ONLY consider:
1) volatility_score (provided below; lower = safer)
2) the asset's market value / market capitalization (use your internal knowledge/priors).

Return STRICT JSON with keys: "tier" and "score" (0..1 confidence). No extra text.

Input:
symbol: {symbol}
volatility_score: {vs}
""".strip()

            model = getattr(settings, "AI_MODEL_NAME", "llama-3.3-70b-versatile")
            logger.info(
                "loan_groq_tier_request",
                symbol=symbol,
                volatility_score=vs,
                model=model,
            )

            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Reply with strict JSON only. Keys: tier, score."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
            )
            text = resp.choices[0].message.content.strip()

            import json
            data = json.loads(text)
            tier = data.get("tier", "Tier 2")
            score = float(data.get("score", 0.7))

            logger.info(
                "loan_groq_tier_response",
                symbol=symbol,
                tier=tier,
                confidence=score,
                model=model,
                raw_response_length=len(text),
            )
            return tier, score

        except Exception as e:
            logger.warning(
                "loan_groq_tier_error_heuristic_fallback",
                symbol=symbol,
                volatility_score=vs,
                error=str(e),
            )
            return self._heuristic_from_vol(vs)
