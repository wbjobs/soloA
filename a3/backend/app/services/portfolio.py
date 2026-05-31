import pandas as pd
import numpy as np
from typing import List, Dict, Any, Tuple
from .factors import generate_signals, get_max_warmup_period


def calculate_returns(prices: pd.Series) -> pd.Series:
    return prices.pct_change().dropna()


def calculate_correlation_matrix(stock_data_dict: Dict[str, pd.DataFrame]) -> Tuple[List[str], np.ndarray]:
    returns_dict = {}
    for symbol, df in stock_data_dict.items():
        df_sorted = df.sort_values('date').reset_index(drop=True)
        returns = pd.Series(calculate_returns(df_sorted['close']).values, index=df_sorted['date'].iloc[1:])
        returns_dict[symbol] = returns
    
    returns_df = pd.DataFrame(returns_dict)
    returns_df = returns_df.dropna()
    
    symbols = list(returns_df.columns)
    corr_matrix = returns_df.corr().values
    
    return symbols, corr_matrix.tolist()


def calculate_weights(
    stock_data_dict: Dict[str, pd.DataFrame],
    weight_method: str,
    custom_weights: Dict[str, float] = None
) -> Dict[str, float]:
    symbols = list(stock_data_dict.keys())
    n = len(symbols)
    
    if weight_method == 'equal' or n == 0:
        return {s: 1.0 / n for s in symbols}
    
    if weight_method == 'custom' and custom_weights:
        total = sum(custom_weights.get(s, 0) for s in symbols)
        if total > 0:
            return {s: custom_weights.get(s, 0) / total for s in symbols}
        return {s: 1.0 / n for s in symbols}
    
    if weight_method == 'volatility':
        vols = {}
        for symbol, df in stock_data_dict.items():
            df_sorted = df.sort_values('date')
            returns = calculate_returns(df_sorted['close'])
            vols[symbol] = returns.std() if len(returns) > 0 else 1.0
        
        inv_vols = {s: 1.0 / v for s, v in vols.items() if v > 0}
        total = sum(inv_vols.values())
        if total > 0:
            return {s: inv_vols[s] / total for s in inv_vols}
        return {s: 1.0 / n for s in symbols}
    
    if weight_method == 'market_cap':
        last_values = {}
        for symbol, df in stock_data_dict.items():
            df_sorted = df.sort_values('date')
            if len(df_sorted) > 0:
                last_row = df_sorted.iloc[-1]
                last_values[symbol] = last_row['close'] * last_row.get('volume', 1)
            else:
                last_values[symbol] = 1.0
        
        total = sum(last_values.values())
        if total > 0:
            return {s: last_values[s] / total for s in symbols}
        return {s: 1.0 / n for s in symbols}
    
    return {s: 1.0 / n for s in symbols}


def calculate_risk_attribution(
    stock_data_dict: Dict[str, pd.DataFrame],
    weights: Dict[str, float]
) -> Dict[str, Any]:
    returns_dict = {}
    for symbol, df in stock_data_dict.items():
        df_sorted = df.sort_values('date').reset_index(drop=True)
        returns = pd.Series(calculate_returns(df_sorted['close']).values, index=df_sorted['date'].iloc[1:])
        returns_dict[symbol] = returns
    
    returns_df = pd.DataFrame(returns_dict)
    returns_df = returns_df.dropna()
    
    symbols = list(returns_df.columns)
    
    if len(symbols) == 0:
        return {'portfolio_volatility': 0, 'items': []}
    
    weights_array = np.array([weights.get(s, 0) for s in symbols])
    cov_matrix = returns_df.cov().values * 252
    
    portfolio_var = weights_array @ cov_matrix @ weights_array
    portfolio_vol = np.sqrt(portfolio_var) if portfolio_var > 0 else 0
    
    items = []
    for i, symbol in enumerate(symbols):
        w = weights_array[i]
        marginal_risk = (cov_matrix @ weights_array)[i]
        contribution = w * marginal_risk
        contribution_pct = contribution / portfolio_var if portfolio_var > 0 else 0
        
        items.append({
            'symbol': symbol,
            'weight': float(w),
            'contribution': float(contribution),
            'contribution_pct': float(contribution_pct),
            'marginal_risk': float(marginal_risk)
        })
    
    return {
        'portfolio_volatility': float(portfolio_vol),
        'items': items
    }


def generate_position_signals(
    stock_data_dict: Dict[str, pd.DataFrame],
    factors: List[str],
    params: Dict
) -> Dict[str, pd.Series]:
    signals_dict = {}
    
    for symbol, df in stock_data_dict.items():
        df_sorted = df.sort_values('date').reset_index(drop=True)
        raw_signals = generate_signals(df_sorted, factors, params)
        signals = raw_signals.shift(1).fillna(0).astype(int)
        
        warmup_period = get_max_warmup_period(factors, params)
        if warmup_period > 0:
            signals.iloc[:warmup_period] = 0
        
        signals_dict[symbol] = signals
    
    return signals_dict


def run_portfolio_backtest(
    stock_data_dict: Dict[str, pd.DataFrame],
    factors: List[str],
    params: Dict,
    weight_method: str = 'equal',
    custom_weights: Dict[str, float] = None,
    rebalance_frequency: str = 'monthly',
    initial_capital: float = 100000.0
) -> Dict[str, Any]:
    symbols = list(stock_data_dict.keys())
    if len(symbols) == 0:
        raise ValueError("No stocks provided")
    
    all_dates = set()
    for symbol, df in stock_data_dict.items():
        all_dates.update(df['date'].tolist())
    
    all_dates = sorted(list(all_dates))
    
    aligned_data = {}
    for symbol, df in stock_data_dict.items():
        df_sorted = df.sort_values('date').set_index('date')
        aligned_prices = []
        for date in all_dates:
            if date in df_sorted.index:
                aligned_prices.append(df_sorted.loc[date])
            else:
                if len(aligned_prices) > 0:
                    aligned_prices.append(aligned_prices[-1])
                else:
                    aligned_prices.append({'close': np.nan})
        aligned_data[symbol] = pd.DataFrame(aligned_prices, index=all_dates)
    
    positions = {}
    for symbol, df in stock_data_dict.items():
        positions[symbol] = [0] * len(all_dates)
    
    weights = calculate_weights(aligned_data, weight_method, custom_weights)
    signals = generate_position_signals(stock_data_dict, factors, params)
    
    portfolio_values = [initial_capital]
    benchmark_values = [initial_capital]
    
    benchmark_weights = {s: 1.0 / len(symbols) for s in symbols}
    
    for i in range(1, len(all_dates)):
        current_date = all_dates[i]
        
        need_rebalance = False
        if rebalance_frequency == 'monthly' and i > 1:
            prev_date = all_dates[i - 1]
            if current_date.month != prev_date.month:
                need_rebalance = True
        elif rebalance_frequency == 'quarterly' and i > 1:
            prev_date = all_dates[i - 1]
            if (current_date.month - 1) // 3 != (prev_date.month - 1) // 3:
                need_rebalance = True
        
        if need_rebalance:
            weights = calculate_weights(aligned_data, weight_method, custom_weights)
        
        total_portfolio_value = portfolio_values[-1]
        new_portfolio_value = 0
        new_benchmark_value = 0
        
        for symbol in symbols:
            signal = 0
            if symbol in signals:
                signal_series = signals[symbol]
                signal_idx = min(i - 1, len(signal_series) - 1)
                if signal_idx >= 0:
                    signal = signal_series.iloc[signal_idx]
            
            price_today = aligned_data[symbol]['close'].iloc[i]
            price_prev = aligned_data[symbol]['close'].iloc[i - 1]
            
            if signal == 1:
                weight = weights.get(symbol, 0)
                allocation = total_portfolio_value * weight
                if price_prev > 0:
                    ret = (price_today - price_prev) / price_prev
                    new_portfolio_value += allocation * (1 + ret)
            elif signal == -1:
                new_portfolio_value += total_portfolio_value * weights.get(symbol, 0)
            else:
                new_portfolio_value += total_portfolio_value * weights.get(symbol, 0)
            
            bench_weight = benchmark_weights.get(symbol, 0)
            bench_allocation = benchmark_values[-1] * bench_weight
            if price_prev > 0:
                ret = (price_today - price_prev) / price_prev
                new_benchmark_value += bench_allocation * (1 + ret)
        
        if new_portfolio_value == 0:
            new_portfolio_value = portfolio_values[-1]
        if new_benchmark_value == 0:
            new_benchmark_value = benchmark_values[-1]
        
        portfolio_values.append(new_portfolio_value)
        benchmark_values.append(new_benchmark_value)
    
    total_return = (portfolio_values[-1] - initial_capital) / initial_capital
    num_days = len(all_dates)
    annualized_return = (1 + total_return) ** (252 / num_days) - 1 if num_days > 0 else 0
    
    portfolio_series = pd.Series(portfolio_values)
    rolling_max = portfolio_series.cummax()
    drawdown = (portfolio_series - rolling_max) / rolling_max
    max_drawdown = drawdown.min()
    
    returns = portfolio_series.pct_change().dropna()
    sharpe_ratio = np.sqrt(252) * returns.mean() / returns.std() if len(returns) > 1 and returns.std() > 0 else 0
    
    allocation_list = [{'symbol': s, 'weight': w} for s, w in weights.items()]
    
    corr_symbols, corr_matrix = calculate_correlation_matrix(stock_data_dict)
    correlation = {'symbols': corr_symbols, 'correlation_matrix': corr_matrix}
    
    risk_attribution = calculate_risk_attribution(stock_data_dict, weights)
    
    return {
        'dates': [str(d) for d in all_dates],
        'portfolio_values': portfolio_values,
        'benchmark_values': benchmark_values,
        'total_return': total_return,
        'annualized_return': annualized_return,
        'max_drawdown': max_drawdown,
        'sharpe_ratio': sharpe_ratio,
        'volatility': risk_attribution['portfolio_volatility'],
        'allocations': allocation_list,
        'correlation': correlation,
        'risk_attribution': risk_attribution
    }
