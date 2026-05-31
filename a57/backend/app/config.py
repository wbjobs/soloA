import os
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    APP_NAME: str = "Industrial IoT Analytics Platform"
    API_VERSION: str = "v1"
    
    INFLUXDB_URL: str = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    INFLUXDB_TOKEN: str = os.getenv("INFLUXDB_TOKEN", "my-token")
    INFLUXDB_ORG: str = os.getenv("INFLUXDB_ORG", "my-org")
    INFLUXDB_BUCKET: str = os.getenv("INFLUXDB_BUCKET", "iot_data")
    
    ANOMALY_DETECTION_ENABLED: bool = True
    THREE_SIGMA_THRESHOLD: float = 4.5
    ISOLATION_FOREST_CONTAMINATION: float = 0.02
    
    REQUIRE_BOTH_ANOMALY_METHODS: bool = True
    
    APRIORI_MIN_SUPPORT: float = 0.1
    APRIORI_MIN_CONFIDENCE: float = 0.5
    APRIORI_MIN_LIFT: float = 1.0
    
    REAL_TIME_REFRESH_INTERVAL: int = 5
    
    ROOT_CAUSE_ANALYSIS_ENABLED: bool = True
    ROOT_CAUSE_MIN_LIFT: float = 2.0
    ROOT_CAUSE_MIN_CONFIDENCE: float = 0.6
    ROOT_CAUSE_MAX_DEPTH: int = 3
    
    EMAIL_NOTIFICATION_ENABLED: bool = False
    EMAIL_SMTP_HOST: str = os.getenv("EMAIL_SMTP_HOST", "smtp.example.com")
    EMAIL_SMTP_PORT: int = int(os.getenv("EMAIL_SMTP_PORT", "587"))
    EMAIL_SMTP_USER: str = os.getenv("EMAIL_SMTP_USER", "")
    EMAIL_SMTP_PASSWORD: str = os.getenv("EMAIL_SMTP_PASSWORD", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "")
    EMAIL_TO: List[str] = os.getenv("EMAIL_TO", "").split(",") if os.getenv("EMAIL_TO") else []
    EMAIL_USE_TLS: bool = True
    
    WECHAT_NOTIFICATION_ENABLED: bool = False
    WECHAT_WEBHOOK_URL: str = os.getenv("WECHAT_WEBHOOK_URL", "")
    WECHAT_MENTIONED_LIST: List[str] = os.getenv("WECHAT_MENTIONED_LIST", "").split(",") if os.getenv("WECHAT_MENTIONED_LIST") else []
    WECHAT_MENTIONED_MOBILE_LIST: List[str] = os.getenv("WECHAT_MENTIONED_MOBILE_LIST", "").split(",") if os.getenv("WECHAT_MENTIONED_MOBILE_LIST") else []
    
    ALERT_SEVERITY_THRESHOLD: str = "medium"
    REPORT_BASE_URL: str = os.getenv("REPORT_BASE_URL", "http://localhost:3000")

settings = Settings()
