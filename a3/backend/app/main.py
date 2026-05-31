from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import stocks

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Stock Backtest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router, prefix="/api/stocks", tags=["stocks"])


@app.get("/")
def root():
    return {"message": "Stock Backtest API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
