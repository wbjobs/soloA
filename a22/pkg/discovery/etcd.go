package discovery

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"

	"e-commerce-fulfillment/pkg/config"
	"e-commerce-fulfillment/pkg/logger"
)

type ServiceInstance struct {
	ServiceName string `json:"service_name"`
	Address     string `json:"address"`
	Port        int    `json:"port"`
	Weight      int    `json:"weight"`
}

type ServiceRegistry struct {
	client *clientv3.Client
	kv     clientv3.KV
	lease  clientv3.Lease
}

var (
	instance   *ServiceRegistry
	once       sync.Once
	leaseIDMap = make(map[string]clientv3.LeaseID)
)

func NewServiceRegistry() *ServiceRegistry {
	once.Do(func() {
		cfg := config.AppConfig
		cli, err := clientv3.New(clientv3.Config{
			Endpoints:   cfg.Etcd.Endpoints,
			DialTimeout: 5 * time.Second,
		})
		if err != nil {
			logger.GetLogger().Fatal(fmt.Sprintf("Failed to connect etcd: %v", err))
		}

		instance = &ServiceRegistry{
			client: cli,
			kv:     clientv3.NewKV(cli),
			lease:  clientv3.NewLease(cli),
		}
		logger.GetLogger().Info("Etcd connected successfully")
	})
	return instance
}

func (r *ServiceRegistry) Register(serviceName string, instance *ServiceInstance) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	leaseResp, err := r.lease.Grant(ctx, 10)
	if err != nil {
		return fmt.Errorf("failed to grant lease: %v", err)
	}

	key := fmt.Sprintf("/services/%s/%s:%d", serviceName, instance.Address, instance.Port)
	value, err := json.Marshal(instance)
	if err != nil {
		return fmt.Errorf("failed to marshal instance: %v", err)
	}

	_, err = r.kv.Put(ctx, key, string(value), clientv3.WithLease(leaseResp.ID))
	if err != nil {
		return fmt.Errorf("failed to put service: %v", err)
	}

	leaseIDMap[key] = leaseResp.ID

	go r.keepAlive(leaseResp.ID)

	logger.GetLogger().Info(fmt.Sprintf("Service registered: %s at %s:%d", serviceName, instance.Address, instance.Port))
	return nil
}

func (r *ServiceRegistry) keepAlive(leaseID clientv3.LeaseID) {
	ch, err := r.lease.KeepAlive(context.Background(), leaseID)
	if err != nil {
		logger.GetLogger().Error(fmt.Sprintf("Failed to keep alive: %v", err))
		return
	}

	for ka := range ch {
		if ka == nil {
			logger.GetLogger().Warn("Lease keepalive returned nil, lease expired")
			return
		}
	}
}

func (r *ServiceRegistry) Discover(serviceName string) (*ServiceInstance, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	prefix := fmt.Sprintf("/services/%s/", serviceName)
	resp, err := r.kv.Get(ctx, prefix, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("failed to get services: %v", err)
	}

	if len(resp.Kvs) == 0 {
		return nil, fmt.Errorf("no service found for: %s", serviceName)
	}

	var instances []*ServiceInstance
	for _, kv := range resp.Kvs {
		var inst ServiceInstance
		if err := json.Unmarshal(kv.Value, &inst); err != nil {
			logger.GetLogger().Warn(fmt.Sprintf("Failed to unmarshal instance: %v", err))
			continue
		}
		instances = append(instances, &inst)
	}

	if len(instances) == 0 {
		return nil, fmt.Errorf("no valid service instance found")
	}

	return instances[0], nil
}

func (r *ServiceRegistry) Deregister(serviceName string, address string, port int) error {
	key := fmt.Sprintf("/services/%s/%s:%d", serviceName, address, port)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if leaseID, ok := leaseIDMap[key]; ok {
		r.lease.Revoke(ctx, leaseID)
		delete(leaseIDMap, key)
	}

	_, err := r.kv.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to deregister service: %v", err)
	}

	logger.GetLogger().Info(fmt.Sprintf("Service deregistered: %s at %s:%d", serviceName, address, port))
	return nil
}
