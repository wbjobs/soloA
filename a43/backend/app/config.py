import os

class Settings:
    MQTT_BROKER = os.getenv("MQTT_BROKER", "test.mosquitto.org")
    MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
    MQTT_TOPIC = os.getenv("MQTT_TOPIC", "lab/sensors/#")
    MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "lab_backend")
    
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/lab_platform")
    
    USE_SQLITE = os.getenv("USE_SQLITE", "true").lower() == "true"
    SQLITE_URL = "sqlite:///./lab.db"

settings = Settings()
