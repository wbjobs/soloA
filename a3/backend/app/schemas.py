from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import date
from enum import Enum


class WeightMethod(str, Enum):
    EQUAL = "equal"
    MARKET_CAP = "market_cap"
    VOLATILITY = "volatility"
    CUSTOM = "custom"


class FactorParams(BaseModel):
    ma_period: Optional[int] = 20
    rsi_period: Optional[int] = 14
    macd_fast: Optional[int] = 12
    macd_slow: Optional[int] = 26
    macd_signal: Optional[int] = 9
    bb_period: Optional[int] = 20
    bb_std: Optional[float] = 2.0


class BacktestRequest(BaseModel):
    symbol: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    factors: List[str]
    params: FactorParams = FactorParams()


class BacktestResult(BaseModel):
    dates: List[str]
    portfolio_values: List[float]
    benchmark_values: List[float]
    total_return: float
    annualized_return: float
    max_drawdown: float
    sharpe_ratio: Optional[float] = None


class StockAllocation(BaseModel):
    symbol: str
    weight: Optional[float] = None


class PortfolioBacktestRequest(BaseModel):
    stocks: List[StockAllocation]
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    weight_method: WeightMethod = WeightMethod.EQUAL
    factors: List[str]
    params: FactorParams = FactorParams()
    rebalance_frequency: Optional[str] = "monthly"


class CorrelationResult(BaseModel):
    symbols: List[str]
    correlation_matrix: List[List[float]]


class RiskAttributionItem(BaseModel):
    symbol: str
    weight: float
    contribution: float
    contribution_pct: float
    marginal_risk: float


class RiskAttributionResult(BaseModel):
    portfolio_volatility: float
    items: List[RiskAttributionItem]


class PortfolioBacktestResult(BaseModel):
    dates: List[str]
    portfolio_values: List[float]
    benchmark_values: List[float]
    total_return: float
    annualized_return: float
    max_drawdown: float
    sharpe_ratio: Optional[float] = None
    volatility: float
    allocations: List[Dict[str, Any]]
    correlation: CorrelationResult
    risk_attribution: RiskAttributionResult
