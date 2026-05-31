import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timedelta
import random
import numpy as np
from typing import List

from app.models.schemas import SensorDataPoint
from app.services.influxdb_service import InfluxDBService

def generate_sample_data(
    num_devices: int = 3,
    hours: int = 24,
    interval_minutes: int = 5
) -> List[SensorDataPoint]:
    devices = [f"device_{i:03d}" for i in range(1, num_devices + 1)]
    sensor_types = ["temperature", "pressure", "vibration", "humidity"]
    
    data_points = []
    end_time = datetime.now()
    start_time = end_time - timedelta(hours=hours)
    
    current_time = start_time
    while current_time <= end_time:
        for device in devices:
            for sensor in sensor_types:
                base_value = {
                    "temperature": 25.0,
                    "pressure": 101.3,
                    "vibration": 0.5,
                    "humidity": 50.0
                }.get(sensor, 10.0)
                
                std_dev = base_value * 0.05
                
                value = np.random.normal(base_value, std_dev)
                
                if random.random() < 0.02:
                    anomaly_factor = random.choice([2.5, 3.0, -2.0, -2.5])
                    value = base_value * (1 + anomaly_factor * 0.2)
                
                data_point = SensorDataPoint(
                    timestamp=current_time,
                    device_id=device,
                    sensor_type=sensor,
                    value=float(value)
                )
                data_points.append(data_point)
        
        current_time += timedelta(minutes=interval_minutes)
    
    return data_points

def main():
    print("Generating sample data...")
    
    data_points = generate_sample_data(
        num_devices=3,
        hours=24,
        interval_minutes=5
    )
    
    print(f"Generated {len(data_points)} data points")
    
    try:
        influxdb_service = InfluxDBService()
        influxdb_service.write_sensor_data(data_points)
        print("Data written to InfluxDB successfully!")
        influxdb_service.close()
    except Exception as e:
        print(f"Error writing to InfluxDB: {e}")
        print("Please make sure InfluxDB is running and configured correctly.")
        print("\nSample data preview (first 5 points):")
        for dp in data_points[:5]:
            print(f"  {dp.timestamp} - {dp.device_id}/{dp.sensor_type}: {dp.value:.2f}")

if __name__ == "__main__":
    main()
