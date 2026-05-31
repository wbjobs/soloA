import pandas as pd
import numpy as np


def calculate_ma(df: pd.DataFrame, period: int = 20) -> pd.Series:
    return df['close'].rolling(window=period).mean()


def calculate_ema(df: pd.DataFrame, period: int) -> pd.Series:
    return df['close'].ewm(span=period, adjust=False).mean()


def calculate_rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_macd(df: pd.DataFrame, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = calculate_ema(df, fast)
    ema_slow = calculate_ema(df, slow)
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0):
    ma = calculate_ma(df, period)
    std = df['close'].rolling(window=period).std()
    upper = ma + (std_dev * std)
    lower = ma - (std_dev * std)
    return upper, ma, lower


def get_max_warmup_period(factors: list, params: dict) -> int:
    max_period = 0
    if 'MA' in factors:
        max_period = max(max_period, params.get('ma_period', 20))
    if 'RSI' in factors:
        max_period = max(max_period, params.get('rsi_period', 14))
    if 'MACD' in factors:
        macd_total = params.get('macd_slow', 26) + params.get('macd_signal', 9)
        max_period = max(max_period, macd_total)
    if 'Bollinger' in factors:
        max_period = max(max_period, params.get('bb_period', 20))
    return max_period


def generate_signals(df: pd.DataFrame, factors: list, params: dict) -> pd.Series:
    signals = pd.Series(0, index=df.index)
    signal_counts = pd.Series(0, index=df.index)
    
    if 'MA' in factors:
        ma_period = params.get('ma_period', 20)
        ma = calculate_ma(df, ma_period)
        ma_signal = (df['close'] > ma).astype(int) * 2 - 1
        signals += ma_signal
        signal_counts += 1
    
    if 'RSI' in factors:
        rsi_period = params.get('rsi_period', 14)
        rsi = calculate_rsi(df, rsi_period)
        rsi_signal = pd.Series(0, index=df.index)
        rsi_signal[rsi < 30] = 1
        rsi_signal[rsi > 70] = -1
        signals += rsi_signal
        signal_counts += 1
    
    if 'MACD' in factors:
        macd_fast = params.get('macd_fast', 12)
        macd_slow = params.get('macd_slow', 26)
        macd_signal_period = params.get('macd_signal', 9)
        macd_line, signal_line, _ = calculate_macd(df, macd_fast, macd_slow, macd_signal_period)
        macd_signal = ((macd_line > signal_line).astype(int) * 2 - 1)
        signals += macd_signal
        signal_counts += 1
    
    if 'Bollinger' in factors:
        bb_period = params.get('bb_period', 20)
        bb_std = params.get('bb_std', 2.0)
        upper, _, lower = calculate_bollinger_bands(df, bb_period, bb_std)
        bb_signal = pd.Series(0, index=df.index)
        bb_signal[df['close'] < lower] = 1
        bb_signal[df['close'] > upper] = -1
        signals += bb_signal
        signal_counts += 1
    
    final_signals = pd.Series(0, index=df.index)
    mask = signal_counts > 0
    avg_signal = signals[mask] / signal_counts[mask]
    final_signals[mask] = (avg_signal > 0.2).astype(int) - (avg_signal < -0.2).astype(int)
    
    return final_signals


def run_backtest(df: pd.DataFrame, factors: list, params: dict, initial_capital: float = 100000.0):
    df = df.copy()
    df = df.sort_values('date').reset_index(drop=True)
    
    raw_signals = generate_signals(df, factors, params)
    signals = raw_signals.shift(1).fillna(0).astype(int)
    
    warmup_period = get_max_warmup_period(factors, params)
    if warmup_period > 0:
        signals.iloc[:warmup_period] = 0
    
    position = 0
    cash = initial_capital
    shares = 0
    portfolio_values = []
    
    for i in range(len(df)):
        signal = signals.iloc[i]
        close_price = df['close'].iloc[i]
        
        if signal == 1 and position == 0:
            shares = cash / close_price
            cash = 0
            position = 1
        elif signal == -1 and position == 1:
            cash = shares * close_price
            shares = 0
            position = 0
        
        portfolio_value = cash + shares * close_price
        portfolio_values.append(portfolio_value)
    
    df['portfolio'] = portfolio_values
    df['benchmark'] = (df['close'] / df['close'].iloc[0]) * initial_capital
    
    total_return = (df['portfolio'].iloc[-1] - initial_capital) / initial_capital
    
    num_days = len(df)
    annualized_return = (1 + total_return) ** (252 / num_days) - 1 if num_days > 0 else 0
    
    rolling_max = df['portfolio'].cummax()
    drawdown = (df['portfolio'] - rolling_max) / rolling_max
    max_drawdown = drawdown.min()
    
    returns = df['portfolio'].pct_change().dropna()
    sharpe_ratio = np.sqrt(252) * returns.mean() / returns.std() if len(returns) > 1 and returns.std() > 0 else 0
    
    return {
        'dates': df['date'].astype(str).tolist(),
        'portfolio_values': df['portfolio'].tolist(),
        'benchmark_values': df['benchmark'].tolist(),
        'total_return': total_return,
        'annualized_return': annualized_return,
        'max_drawdown': max_drawdown,
        'sharpe_ratio': sharpe_ratio
    }
