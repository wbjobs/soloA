use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::{MetricQuery, ObservabilityConfig, PrometheusConfig};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricSnapshot {
    pub metric_name: String,
    pub timestamp: DateTime<Utc>,
    pub values: Vec<(DateTime<Utc>, f64)>,
    pub average: f64,
    pub max: f64,
    pub min: f64,
    pub p95: f64,
    pub p99: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactReport {
    pub experiment_name: String,
    pub experiment_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub baseline_metrics: HashMap<String, MetricSnapshot>,
    pub during_metrics: HashMap<String, MetricSnapshot>,
    pub post_metrics: HashMap<String, MetricSnapshot>,
    pub impact_analysis: HashMap<String, ImpactAnalysis>,
    pub overall_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactAnalysis {
    pub metric_name: String,
    pub baseline_avg: f64,
    pub during_avg: f64,
    pub change_percent: f64,
    pub absolute_change: f64,
    pub threshold_exceeded: bool,
    pub threshold: Option<f64>,
    pub severity: ImpactSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImpactSeverity {
    None,
    Low,
    Medium,
    High,
    Critical,
}

pub struct ObservabilityManager {
    client: Client,
}

impl ObservabilityManager {
    pub fn new() -> Self {
        ObservabilityManager {
            client: Client::new(),
        }
    }

    pub async fn collect_metrics(
        &self,
        config: &ObservabilityConfig,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> ChaosResult<HashMap<String, MetricSnapshot>> {
        let mut results = HashMap::new();

        for metric_query in &config.metrics {
            let snapshot = self
                .query_prometheus(&config.prometheus, metric_query, start_time, end_time)
                .await?;
            results.insert(metric_query.name.clone(), snapshot);
        }

        Ok(results)
    }

    async fn query_prometheus(
        &self,
        config: &PrometheusConfig,
        metric_query: &MetricQuery,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> ChaosResult<MetricSnapshot> {
        let step = config.step.unwrap_or(15);
        let timeout = config.query_timeout_ms.unwrap_or(30000);

        let url = format!(
            "{}/api/v1/query_range?query={}&start={}&end={}&step={}s&timeout={}ms",
            config.url,
            urlencoding::encode(&metric_query.query),
            start_time.timestamp(),
            end_time.timestamp(),
            step,
            timeout
        );

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ChaosError::ObservabilityError(format!("Prometheus query failed: {}", e)))?;

        let prom_response: PrometheusRangeResponse = response
            .json()
            .await
            .map_err(|e| ChaosError::ObservabilityError(format!("Failed to parse Prometheus response: {}", e)))?;

        let mut values: Vec<(DateTime<Utc>, f64)> = Vec::new();
        
        for result in &prom_response.data.result {
            for (ts_str, val_str) in &result.values {
                let ts: i64 = match ts_str {
                    serde_json::Value::Number(n) => n.as_i64().unwrap_or(0),
                    _ => continue,
                };
                let val: f64 = match val_str {
                    serde_json::Value::String(s) => s.parse().unwrap_or(0.0),
                    _ => 0.0,
                };
                values.push((
                    DateTime::from_timestamp(ts, 0).unwrap_or_else(|| Utc::now()),
                    val,
                ));
            }
        }

        let numeric_values: Vec<f64> = values.iter().map(|(_, v)| *v).collect();
        let avg = if numeric_values.is_empty() {
            0.0
        } else {
            numeric_values.iter().sum::<f64>() / numeric_values.len() as f64
        };
        let max = numeric_values.iter().cloned().fold(0.0, f64::max);
        let min = numeric_values.iter().cloned().fold(f64::INFINITY, f64::min);
        let p95 = calculate_percentile(&numeric_values, 95.0);
        let p99 = calculate_percentile(&numeric_values, 99.0);

        Ok(MetricSnapshot {
            metric_name: metric_query.name.clone(),
            timestamp: Utc::now(),
            values,
            average: avg,
            max,
            min,
            p95,
            p99,
        })
    }

    pub fn analyze_impact(
        baseline: &HashMap<String, MetricSnapshot>,
        during: &HashMap<String, MetricSnapshot>,
        threshold_config: &Option<HashMap<String, f64>>,
    ) -> HashMap<String, ImpactAnalysis> {
        let mut analysis = HashMap::new();

        for (name, baseline_snap) in baseline {
            if let Some(during_snap) = during.get(name) {
                let baseline_avg = baseline_snap.average;
                let during_avg = during_snap.average;
                
                let absolute_change = during_avg - baseline_avg;
                let change_percent = if baseline_avg == 0.0 {
                    if during_avg > 0.0 { 100.0 } else { 0.0 }
                } else {
                    (absolute_change / baseline_avg) * 100.0
                };

                let threshold = threshold_config
                    .as_ref()
                    .and_then(|t| t.get(name).cloned());

                let threshold_exceeded = match threshold {
                    Some(t) => during_avg > t,
                    None => change_percent.abs() > 20.0,
                };

                let severity = calculate_severity(change_percent, threshold_exceeded);

                analysis.insert(
                    name.clone(),
                    ImpactAnalysis {
                        metric_name: name.clone(),
                        baseline_avg,
                        during_avg,
                        change_percent,
                        absolute_change,
                        threshold_exceeded,
                        threshold,
                        severity,
                    },
                );
            }
        }

        analysis
    }

    pub fn generate_report(
        experiment_name: &str,
        experiment_id: &str,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        baseline: HashMap<String, MetricSnapshot>,
        during: HashMap<String, MetricSnapshot>,
        post: HashMap<String, MetricSnapshot>,
        thresholds: Option<HashMap<String, f64>>,
    ) -> ImpactReport {
        let impact_analysis = Self::analyze_impact(&baseline, &during, &thresholds);

        let has_critical = impact_analysis
            .values()
            .any(|a| matches!(a.severity, ImpactSeverity::Critical));
        let has_high = impact_analysis
            .values()
            .any(|a| matches!(a.severity, ImpactSeverity::High));

        let overall_status = if has_critical {
            "CRITICAL".to_string()
        } else if has_high {
            "HIGH_IMPACT".to_string()
        } else {
            "NORMAL".to_string()
        };

        ImpactReport {
            experiment_name: experiment_name.to_string(),
            experiment_id: experiment_id.to_string(),
            start_time,
            end_time,
            baseline_metrics: baseline,
            during_metrics: during,
            post_metrics: post,
            impact_analysis,
            overall_status,
        }
    }

    pub fn print_report(report: &ImpactReport) {
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║           CHAOS EXPERIMENT IMPACT REPORT                      ║");
        println!("╚══════════════════════════════════════════════════════════════╝");
        println!();
        println!("Experiment: {}", report.experiment_name);
        println!("ID: {}", report.experiment_id);
        println!("Duration: {} - {}", report.start_time, report.end_time);
        println!("Overall Status: {}", report.overall_status);
        println!();
        
        println!("─────────────────────────────────────────────────────────────");
        println!("Metric Impact Analysis:");
        println!("─────────────────────────────────────────────────────────────");
        println!();

        for (name, analysis) in &report.impact_analysis {
            println!("  Metric: {}", name);
            println!("    Baseline Avg: {:.2}", analysis.baseline_avg);
            println!("    During Avg:   {:.2}", analysis.during_avg);
            println!("    Change:       {:.2}% ({:+.2})", analysis.change_percent, analysis.absolute_change);
            println!("    Severity:     {:?}", analysis.severity);
            if analysis.threshold_exceeded {
                println!("    ⚠️  THRESHOLD EXCEEDED");
            }
            println!();
        }

        println!("─────────────────────────────────────────────────────────────");
    }

    pub fn save_report(report: &ImpactReport, path: &std::path::Path) -> ChaosResult<()> {
        let json = serde_json::to_string_pretty(report)?;
        std::fs::write(path, json)?;
        Ok(())
    }
}

impl Default for ObservabilityManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Deserialize)]
struct PrometheusRangeResponse {
    status: String,
    data: PrometheusRangeData,
}

#[derive(Debug, Deserialize)]
struct PrometheusRangeData {
    resultType: String,
    result: Vec<PrometheusResult>,
}

#[derive(Debug, Deserialize)]
struct PrometheusResult {
    metric: serde_json::Value,
    values: Vec<(serde_json::Value, serde_json::Value)>,
}

fn calculate_percentile(values: &[f64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let index = ((percentile / 100.0) * (sorted.len() - 1) as f64).round() as usize;
    sorted[index]
}

fn calculate_severity(change_percent: f64, threshold_exceeded: bool) -> ImpactSeverity {
    let abs_change = change_percent.abs();
    
    if threshold_exceeded {
        if abs_change > 100.0 {
            ImpactSeverity::Critical
        } else if abs_change > 50.0 {
            ImpactSeverity::High
        } else {
            ImpactSeverity::Medium
        }
    } else {
        if abs_change > 50.0 {
            ImpactSeverity::High
        } else if abs_change > 20.0 {
            ImpactSeverity::Medium
        } else if abs_change > 10.0 {
            ImpactSeverity::Low
        } else {
            ImpactSeverity::None
        }
    }
}
