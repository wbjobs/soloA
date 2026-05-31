from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import catalog, coordinates, spectrum, fits, timeseries, observatory, multiband

app = FastAPI(
    title="天文观测数据可视化平台",
    description="支持大规模星场3D渲染与光谱分析的天文数据平台",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router, prefix="/api/catalog", tags=["星表查询"])
app.include_router(coordinates.router, prefix="/api/coordinates", tags=["坐标转换"])
app.include_router(spectrum.router, prefix="/api/spectrum", tags=["光谱分析"])
app.include_router(fits.router, prefix="/api/fits", tags=["FITS文件管理"])
app.include_router(timeseries.router, prefix="/api/timeseries", tags=["时域天文"])
app.include_router(observatory.router, prefix="/api/observatory", tags=["观测模拟器"])
app.include_router(multiband.router, prefix="/api/multiband", tags=["多波段叠加"])


@app.get("/")
async def root():
    return {
        "name": "天文观测数据可视化平台",
        "version": "1.1.0",
        "status": "running",
        "modules": [
            {"name": "星表查询", "endpoint": "/api/catalog"},
            {"name": "坐标转换", "endpoint": "/api/coordinates"},
            {"name": "光谱分析", "endpoint": "/api/spectrum"},
            {"name": "FITS管理", "endpoint": "/api/fits"},
            {"name": "时域天文", "endpoint": "/api/timeseries"},
            {"name": "观测模拟器", "endpoint": "/api/observatory"},
            {"name": "多波段叠加", "endpoint": "/api/multiband"}
        ]
    }
