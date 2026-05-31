from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
import io
from datetime import datetime
from sqlalchemy import text

from ..database import get_db
from ..models import StockData
from ..redis_client import cache_result, get_cached_result
from ..schemas import BacktestRequest, BacktestResult, PortfolioBacktestRequest, PortfolioBacktestResult
from ..services.factors import run_backtest
from ..services.portfolio import run_portfolio_backtest

router = APIRouter()

BATCH_SIZE = 1000


@router.post("/upload/{symbol}")
async def upload_csv(symbol: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV format")
    
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
        
        expected_columns = ['date', 'open', 'high', 'low', 'close', 'volume']
        lower_columns = [col.lower() for col in df.columns]
        df.columns = lower_columns
        
        for col in expected_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        
        db.query(StockData).filter(StockData.symbol == symbol).delete()
        
        df['date'] = pd.to_datetime(df['date']).dt.date
        df = df.dropna(subset=['date', 'open', 'high', 'low', 'close', 'volume'])
        df = df[df['volume'] >= 0]
        
        records = []
        for _, row in df.iterrows():
            records.append({
                'symbol': symbol,
                'date': row['date'],
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'volume': float(row['volume'])
            })
        
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            db.bulk_insert_mappings(StockData, batch)
            db.commit()
        
        count = len(records)
        return {"status": "success", "symbol": symbol, "records_imported": count}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols")
def get_symbols(db: Session = Depends(get_db)):
    symbols = db.query(StockData.symbol).distinct().all()
    return {"symbols": [s[0] for s in symbols]}


@router.get("/data/{symbol}")
def get_stock_data(symbol: str, db: Session = Depends(get_db)):
    data = db.query(StockData).filter(StockData.symbol == symbol).order_by(StockData.date).all()
    if not data:
        raise HTTPException(status_code=404, detail="Symbol not found")
    
    return {
        "symbol": symbol,
        "data": [
            {
                "date": str(d.date),
                "open": d.open,
                "high": d.high,
                "low": d.low,
                "close": d.close,
                "volume": d.volume
            }
            for d in data
        ]
    }


@router.post("/backtest", response_model=BacktestResult)
def backtest(request: BacktestRequest, db: Session = Depends(get_db)):
    cache_key = f"backtest:{request.symbol}:{hash(str(request))}"
    cached = get_cached_result(cache_key)
    if cached:
        return BacktestResult(**cached)
    
    query = db.query(StockData).filter(StockData.symbol == request.symbol)
    
    if request.start_date:
        query = query.filter(StockData.date >= request.start_date)
    if request.end_date:
        query = query.filter(StockData.date <= request.end_date)
    
    data = query.order_by(StockData.date).all()
    
    if not data:
        raise HTTPException(status_code=404, detail="No data found for this symbol")
    
    df = pd.DataFrame([
        {
            'date': d.date,
            'open': d.open,
            'high': d.high,
            'low': d.low,
            'close': d.close,
            'volume': d.volume
        }
        for d in data
    ])
    
    result = run_backtest(df, request.factors, request.params.model_dump())
    cache_result(cache_key, result)
    
    return BacktestResult(**result)


@router.post("/portfolio/backtest", response_model=PortfolioBacktestResult)
def portfolio_backtest(request: PortfolioBacktestRequest, db: Session = Depends(get_db)):
    if len(request.stocks) < 2:
        raise HTTPException(status_code=400, detail="Portfolio backtest requires at least 2 stocks")
    
    cache_key = f"portfolio_backtest:{hash(str(request))}"
    cached = get_cached_result(cache_key)
    if cached:
        return PortfolioBacktestResult(**cached)
    
    stock_data_dict = {}
    custom_weights = {}
    
    for stock in request.stocks:
        query = db.query(StockData).filter(StockData.symbol == stock.symbol)
        
        if request.start_date:
            query = query.filter(StockData.date >= request.start_date)
        if request.end_date:
            query = query.filter(StockData.date <= request.end_date)
        
        data = query.order_by(StockData.date).all()
        
        if not data:
            raise HTTPException(status_code=404, detail=f"No data found for symbol: {stock.symbol}")
        
        df = pd.DataFrame([
            {
                'date': d.date,
                'open': d.open,
                'high': d.high,
                'low': d.low,
                'close': d.close,
                'volume': d.volume
            }
            for d in data
        ])
        stock_data_dict[stock.symbol] = df
        
        if stock.weight is not None:
            custom_weights[stock.symbol] = stock.weight
    
    result = run_portfolio_backtest(
        stock_data_dict=stock_data_dict,
        factors=request.factors,
        params=request.params.model_dump(),
        weight_method=request.weight_method.value,
        custom_weights=custom_weights if custom_weights else None,
        rebalance_frequency=request.rebalance_frequency
    )
    
    cache_result(cache_key, result, expire=300)
    
    return PortfolioBacktestResult(**result)
