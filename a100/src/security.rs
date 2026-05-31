use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::{
    BigRedButtonConfig, DatabaseDumpConfig, DatabaseType, EtcdLockConfig,
    EtcdSnapshotConfig, LockType, RedisLockConfig, SnapshotTargets,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub id: String,
    pub snapshot_type: SnapshotType,
    pub created_at: DateTime<Utc>,
    pub filepath: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SnapshotType {
    Etcd,
    Database,
    Filesystem,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BigRedButtonState {
    pub triggered: bool,
    pub triggered_at: Option<DateTime<Utc>>,
    pub triggered_by: Option<String>,
    pub experiment_ids: Vec<String>,
}

pub struct SecurityManager {
    big_red_button_triggered: Arc<AtomicBool>,
    snapshots: HashMap<String, SnapshotRecord>,
    lock_value: Option<String>,
}

impl SecurityManager {
    pub fn new() -> Self {
        SecurityManager {
            big_red_button_triggered: Arc::new(AtomicBool::new(false)),
            snapshots: HashMap::new(),
            lock_value: None,
        }
    }

    pub fn create_snapshot(
        &mut self,
        targets: Option<&SnapshotTargets>,
        output_dir: Option<&std::path::Path>,
    ) -> ChaosResult<Vec<SnapshotRecord>> {
        let mut records = Vec::new();
        let output_dir = output_dir.unwrap_or_else(|| std::path::Path::new("."));

        if let Some(targets) = targets {
            if let Some(etcd_config) = &targets.etcd {
                let record = self.snapshot_etcd(etcd_config, output_dir)?;
                self.snapshots.insert(record.id.clone(), record.clone());
                records.push(record);
            }

            if let Some(db_config) = &targets.database {
                let record = self.snapshot_database(db_config, output_dir)?;
                self.snapshots.insert(record.id.clone(), record.clone());
                records.push(record);
            }

            if let Some(fs_paths) = &targets.filesystem {
                let record = self.snapshot_filesystem(fs_paths, output_dir)?;
                self.snapshots.insert(record.id.clone(), record.clone());
                records.push(record);
            }
        }

        Ok(records)
    }

    fn snapshot_etcd(
        &self,
        config: &EtcdSnapshotConfig,
        output_dir: &std::path::Path,
    ) -> ChaosResult<SnapshotRecord> {
        let snapshot_id = Uuid::new_v4().to_string();
        let filepath = output_dir
            .join(format!("etcd-snapshot-{}.db", snapshot_id))
            .to_string_lossy()
            .to_string();

        let endpoints = config.endpoints.join(",");
        let cmd = format!("etcdctl snapshot save {} --endpoints={}", filepath, endpoints);

        let output = std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map_err(|e| ChaosError::SecurityError(format!("etcd snapshot failed: {}", e)))?;

        if !output.status.success() {
            return Err(ChaosError::SecurityError(format!(
                "etcd snapshot command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(SnapshotRecord {
            id: snapshot_id,
            snapshot_type: SnapshotType::Etcd,
            created_at: Utc::now(),
            filepath,
            metadata: HashMap::new(),
        })
    }

    fn snapshot_database(
        &self,
        config: &DatabaseDumpConfig,
        output_dir: &std::path::Path,
    ) -> ChaosResult<SnapshotRecord> {
        let snapshot_id = Uuid::new_v4().to_string();
        let filepath = output_dir
            .join(format!("db-snapshot-{}.sql", snapshot_id))
            .to_string_lossy()
            .to_string();

        let cmd = match config.db_type {
            DatabaseType::PostgreSQL => format!(
                "pg_dump -h {} -p {} -U {} -d {} -f {}",
                config.host, config.port, config.user, config.database, filepath
            ),
            DatabaseType::MySQL => format!(
                "mysqldump -h {} -P {} -u {} -p{} {} > {}",
                config.host,
                config.port,
                config.user,
                config.password.as_deref().unwrap_or(""),
                config.database,
                filepath
            ),
            DatabaseType::MongoDB => format!(
                "mongodump --host {}:{} --username {} --password {} --db {} --out {}",
                config.host,
                config.port,
                config.user,
                config.password.as_deref().unwrap_or(""),
                config.database,
                filepath
            ),
        };

        let output = std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map_err(|e| ChaosError::SecurityError(format!("Database dump failed: {}", e)))?;

        if !output.status.success() {
            return Err(ChaosError::SecurityError(format!(
                "Database dump command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(SnapshotRecord {
            id: snapshot_id,
            snapshot_type: SnapshotType::Database,
            created_at: Utc::now(),
            filepath,
            metadata: HashMap::new(),
        })
    }

    fn snapshot_filesystem(
        &self,
        paths: &[String],
        output_dir: &std::path::Path,
    ) -> ChaosResult<SnapshotRecord> {
        let snapshot_id = Uuid::new_v4().to_string();
        let filepath = output_dir
            .join(format!("fs-snapshot-{}.tar.gz", snapshot_id))
            .to_string_lossy()
            .to_string();

        let paths_str = paths.join(" ");
        let cmd = format!("tar -czf {} {}", filepath, paths_str);

        let output = std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map_err(|e| ChaosError::SecurityError(format!("Filesystem snapshot failed: {}", e)))?;

        if !output.status.success() {
            return Err(ChaosError::SecurityError(format!(
                "Filesystem snapshot command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(SnapshotRecord {
            id: snapshot_id,
            snapshot_type: SnapshotType::Filesystem,
            created_at: Utc::now(),
            filepath,
            metadata: HashMap::new(),
        })
    }

    pub fn restore_snapshot(&self, record: &SnapshotRecord) -> ChaosResult<()> {
        match record.snapshot_type {
            SnapshotType::Etcd => {
                let cmd = format!("etcdctl snapshot restore {}", record.filepath);
                let _ = std::process::Command::new("sh").args(&["-c", &cmd]).output();
            }
            SnapshotType::Database => {
                let cmd = format!("psql -f {}", record.filepath);
                let _ = std::process::Command::new("sh").args(&["-c", &cmd]).output();
            }
            SnapshotType::Filesystem => {
                let cmd = format!("tar -xzf {}", record.filepath);
                let _ = std::process::Command::new("sh").args(&["-c", &cmd]).output();
            }
            SnapshotType::All => {}
        }

        Ok(())
    }

    pub fn get_snapshot(&self, id: &str) -> Option<&SnapshotRecord> {
        self.snapshots.get(id)
    }

    pub fn acquire_distributed_lock(
        &mut self,
        config: &BigRedButtonConfig,
        timeout_secs: u64,
    ) -> ChaosResult<()> {
        let lock_key = match config.lock_type {
            LockType::Etcd => {
                config
                    .etcd
                    .as_ref()
                    .map(|c| c.key.clone())
                    .unwrap_or_else(|| "chaos-platform:big-red-button".to_string())
            }
            LockType::Redis => {
                config
                    .redis
                    .as_ref()
                    .map(|c| c.key.clone())
                    .unwrap_or_else(|| "chaos-platform:big-red-button".to_string())
            }
        };

        let lock_value = Uuid::new_v4().to_string();
        self.lock_value = Some(lock_value.clone());

        let success = match config.lock_type {
            LockType::Etcd => self.acquire_etcd_lock(config.etcd.as_ref().unwrap(), &lock_key, timeout_secs),
            LockType::Redis => self.acquire_redis_lock(config.redis.as_ref().unwrap(), &lock_key, timeout_secs),
        };

        if success {
            Ok(())
        } else {
            Err(ChaosError::SecurityError(
                "Failed to acquire distributed lock".into(),
            ))
        }
    }

    fn acquire_etcd_lock(
        &self,
        config: &EtcdLockConfig,
        key: &str,
        timeout_secs: u64,
    ) -> bool {
        let ttl = config.ttl.unwrap_or(timeout_secs);
        let endpoints = config.endpoints.join(",");
        
        let cmd = format!(
            "etcdctl lock --ttl={} {} --endpoints={}",
            ttl, key, endpoints
        );
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn acquire_redis_lock(
        &self,
        config: &RedisLockConfig,
        key: &str,
        timeout_secs: u64,
    ) -> bool {
        let ttl = config.ttl.unwrap_or(timeout_secs);
        let value = self.lock_value.as_deref().unwrap_or("lock");
        
        let cmd = format!(
            "redis-cli -u {} SET {} {} NX EX {}",
            config.url, key, value, ttl
        );
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub fn check_big_red_button(&self) -> bool {
        self.big_red_button_triggered.load(Ordering::SeqCst)
    }

    pub async fn monitor_big_red_button(
        &self,
        config: &BigRedButtonConfig,
    ) -> ChaosResult<bool> {
        if !config.enabled {
            return Ok(false);
        }

        let triggered = match config.lock_type {
            LockType::Etcd => self.check_etcd_brb(config.etcd.as_ref().unwrap()),
            LockType::Redis => self.check_redis_brb(config.redis.as_ref().unwrap()),
        };

        if triggered {
            self.big_red_button_triggered.store(true, Ordering::SeqCst);
        }

        Ok(triggered)
    }

    fn check_etcd_brb(&self, config: &EtcdLockConfig) -> bool {
        let endpoints = config.endpoints.join(",");
        let cmd = format!("etcdctl get {} --endpoints={}", config.key, endpoints);
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false)
    }

    fn check_redis_brb(&self, config: &RedisLockConfig) -> bool {
        let cmd = format!("redis-cli -u {} EXISTS {}", config.url, config.key);
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "1")
            .unwrap_or(false)
    }

    pub async fn trigger_big_red_button(
        &self,
        config: &BigRedButtonConfig,
        experiment_ids: Vec<String>,
    ) -> ChaosResult<()> {
        match config.lock_type {
            LockType::Etcd => self.set_etcd_brb(config.etcd.as_ref().unwrap(), &experiment_ids),
            LockType::Redis => self.set_redis_brb(config.redis.as_ref().unwrap(), &experiment_ids),
        };

        self.big_red_button_triggered.store(true, Ordering::SeqCst);
        Ok(())
    }

    fn set_etcd_brb(&self, config: &EtcdLockConfig, experiment_ids: &[String]) -> bool {
        let endpoints = config.endpoints.join(",");
        let value = format!("TRIGGERED:{}", experiment_ids.join(","));
        
        let cmd = format!(
            "etcdctl put {} {} --endpoints={}",
            config.key, value, endpoints
        );
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn set_redis_brb(&self, config: &RedisLockConfig, experiment_ids: &[String]) -> bool {
        let value = format!("TRIGGERED:{}", experiment_ids.join(","));
        
        let cmd = format!("redis-cli -u {} SET {} {}", config.url, config.key, value);
        
        std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub fn get_brb_flag(&self) -> Arc<AtomicBool> {
        self.big_red_button_triggered.clone()
    }
}

impl Default for SecurityManager {
    fn default() -> Self {
        Self::new()
    }
}
