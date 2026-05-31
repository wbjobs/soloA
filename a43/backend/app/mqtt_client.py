import paho.mqtt.client as mqtt
import json
import threading
from datetime import datetime
from .config import settings
from .database import SessionLocal
from .models import SensorData, Device
from .alert_engine import AlertEngine

class MQTTClient:
    def __init__(self):
        self.client = mqtt.Client(client_id=settings.MQTT_CLIENT_ID)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.alert_engine = AlertEngine()
        self.connected = False
        self._thread = None

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"[MQTT] Connected to {settings.MQTT_BROKER}:{settings.MQTT_PORT}")
            self.connected = True
            client.subscribe(settings.MQTT_TOPIC)
            print(f"[MQTT] Subscribed to topic: {settings.MQTT_TOPIC}")
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            self.process_sensor_data(payload)
        except json.JSONDecodeError:
            print(f"[MQTT] Invalid JSON payload: {msg.payload[:200]}")
        except Exception as e:
            print(f"[MQTT] Error processing message: {e}")

    def process_sensor_data(self, data):
        if not isinstance(data, dict):
            return
        
        device_id = data.get("device_id")
        if not device_id:
            return

        db = SessionLocal()
        try:
            device = db.query(Device).filter(Device.device_id == device_id).first()
            if not device:
                device = Device(
                    device_id=device_id,
                    name=f"Device {device_id}",
                    device_type=data.get("device_type", "unknown"),
                    status=data.get("status", "standby")
                )
                db.add(device)
                db.commit()
                db.refresh(device)

            sensor_data = SensorData(
                device_id=device_id,
                temperature=data.get("temperature"),
                humidity=data.get("humidity"),
                pressure=data.get("pressure"),
                power=data.get("power"),
                timestamp=datetime.utcnow()
            )
            db.add(sensor_data)
            
            if "status" in data:
                device.status = data["status"]
            
            db.commit()
            
            self.alert_engine.check_and_alert(db, device, sensor_data)
            
            latest_data = self.alert_engine.get_latest_data()
            if len(latest_data) > 0:
                latest_data.append({
                    "device_id": device_id,
                    "temperature": data.get("temperature"),
                    "humidity": data.get("humidity"),
                    "power": data.get("power"),
                    "status": device.status,
                    "timestamp": datetime.utcnow().isoformat()
                })
            else:
                self.alert_engine.latest_sensor_data = [{
                    "device_id": device_id,
                    "temperature": data.get("temperature"),
                    "humidity": data.get("humidity"),
                    "power": data.get("power"),
                    "status": device.status,
                    "timestamp": datetime.utcnow().isoformat()
                }]
            
            if len(self.alert_engine.latest_sensor_data) > 100:
                self.alert_engine.latest_sensor_data = self.alert_engine.latest_sensor_data[-100:]
                
        except Exception as e:
            db.rollback()
            print(f"[MQTT] Database error: {e}")
        finally:
            db.close()

    def start(self):
        def connect_async():
            try:
                print(f"[MQTT] Connecting to {settings.MQTT_BROKER}:{settings.MQTT_PORT}...")
                self.client.connect(settings.MQTT_BROKER, settings.MQTT_PORT, 60)
                self.client.loop_forever()
            except Exception as e:
                print(f"[MQTT] Connection error: {e}")
                print("[MQTT] Will use HTTP API for data input instead")
        
        self._thread = threading.Thread(target=connect_async, daemon=True)
        self._thread.start()
        print("[MQTT] Client starting in background")

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
        self.connected = False
        print("[MQTT] Client stopped")

    def publish(self, topic, payload):
        self.client.publish(topic, json.dumps(payload))

mqtt_client = MQTTClient()
