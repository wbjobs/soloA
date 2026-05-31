package infrastructure

import (
	"fmt"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"iot-platform/internal/config"
	"iot-platform/pkg/logger"
)

var (
	mqttClient  mqtt.Client
	subHandlers map[string]mqtt.MessageHandler
	handlersMu  sync.RWMutex
)

func InitMQTT(cfg *config.MQTTConfig) error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(cfg.Broker)
	opts.SetClientID(cfg.ClientID)
	opts.SetUsername(cfg.Username)
	opts.SetPassword(cfg.Password)
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetConnectTimeout(10 * time.Second)
	opts.SetOnConnectHandler(func(client mqtt.Client) {
		logger.Info("MQTT connected successfully")
	})
	opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		logger.Warn("MQTT connection lost", logger.ErrorField(err))
	})

	mqttClient = mqtt.NewClient(opts)
	subHandlers = make(map[string]mqtt.MessageHandler)

	if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
		return token.Error()
	}

	return nil
}

func GetMQTTClient() mqtt.Client {
	return mqttClient
}

func Subscribe(topic string, handler mqtt.MessageHandler, qos byte) error {
	if !mqttClient.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}

	handlersMu.Lock()
	subHandlers[topic] = handler
	handlersMu.Unlock()

	token := mqttClient.Subscribe(topic, qos, func(client mqtt.Client, msg mqtt.Message) {
		logger.Debug("Received MQTT message", logger.String("topic", msg.Topic()))
		if handler != nil {
			handler(client, msg)
		}
	})

	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	logger.Info("Subscribed to MQTT topic", logger.String("topic", topic))
	return nil
}

func Publish(topic string, payload []byte, qos byte, retained bool) error {
	if !mqttClient.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}

	token := mqttClient.Publish(topic, qos, retained, payload)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	logger.Debug("Published MQTT message", logger.String("topic", topic))
	return nil
}

func Unsubscribe(topic string) error {
	if !mqttClient.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}

	handlersMu.Lock()
	delete(subHandlers, topic)
	handlersMu.Unlock()

	token := mqttClient.Unsubscribe(topic)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	logger.Info("Unsubscribed from MQTT topic", logger.String("topic", topic))
	return nil
}

func DisconnectMQTT() {
	if mqttClient != nil {
		handlersMu.RLock()
		topics := make([]string, 0, len(subHandlers))
		for topic := range subHandlers {
			topics = append(topics, topic)
		}
		handlersMu.RUnlock()

		for _, topic := range topics {
			mqttClient.Unsubscribe(topic)
		}

		mqttClient.Disconnect(250)
		logger.Info("MQTT disconnected")
	}
}
