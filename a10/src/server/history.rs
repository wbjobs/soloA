use std::collections::VecDeque;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::protocol::HistorySnapshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryManager {
    max_snapshots: usize,
    full_snapshot_interval: u32,
    snapshots: VecDeque<HistorySnapshot>,
    frame_count: u32,
}

impl HistoryManager {
    pub fn new(max_snapshots: usize, full_snapshot_interval: u32) -> Self {
        Self {
            max_snapshots,
            full_snapshot_interval,
            snapshots: VecDeque::with_capacity(max_snapshots),
            frame_count: 0,
        }
    }

    pub fn add_snapshot(&mut self, snapshot: HistorySnapshot) {
        self.frame_count += 1;
        self.snapshots.push_back(snapshot);

        while self.snapshots.len() > self.max_snapshots {
            self.snapshots.pop_front();
        }
    }

    pub fn should_save_full(&self) -> bool {
        self.frame_count % self.full_snapshot_interval == 0
    }

    pub fn get_snapshots(
        &self,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    ) -> Vec<HistorySnapshot> {
        self.snapshots
            .iter()
            .filter(|s| {
                let in_range = match (start_time, end_time) {
                    (Some(start), Some(end)) => {
                        s.timestamp >= start && s.timestamp <= end
                    }
                    (Some(start), None) => s.timestamp >= start,
                    (None, Some(end)) => s.timestamp <= end,
                    (None, None) => true,
                };
                in_range
            })
            .cloned()
            .collect()
    }

    pub fn clear(&mut self) {
        self.snapshots.clear();
        self.frame_count = 0;
    }

    pub fn len(&self) -> usize {
        self.snapshots.len()
    }

    pub fn is_empty(&self) -> bool {
        self.snapshots.is_empty()
    }
}

impl Default for HistoryManager {
    fn default() -> Self {
        Self::new(1000, 60)
    }
}
