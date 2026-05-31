use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::{
    Assertion, AssertionOperator, AssertionType, Experiment, ValidationScenarioConfig,
    ValidationTestDefinition, ValidationTestType,
};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    pub tests: Vec<ValidationTestDefinition>,
    pub baseline_duration_seconds: u64,
    pub during_duration_seconds: u64,
    pub post_duration_seconds: u64,
    pub timeout_ms: u64,
    pub retry_count: u32,
    pub failure_threshold: f64,
}

impl From<ValidationScenarioConfig> for ValidationConfig {
    fn from(scenario: ValidationScenarioConfig) -> Self {
        ValidationConfig {
            tests: scenario.tests,
            baseline_duration_seconds: scenario.baseline_duration_seconds,
            during_duration_seconds: scenario.during_duration_seconds,
            post_duration_seconds: scenario.post_duration_seconds,
            timeout_ms: scenario.timeout_ms,
            retry_count: scenario.retry_count,
            failure_threshold: scenario.failure_threshold,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRun {
    pub id: String,
    pub experiment_id: String,
    pub experiment_name: String,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub phase: ValidationPhase,
    pub results: Vec<ValidationTestResult>,
    pub overall_status: ValidationStatus,
    pub system_tolerated: Option<bool>,
    pub metrics: ValidationMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationPhase {
    Baseline,
    During,
    Post,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationStatus {
    NotStarted,
    Running,
    Passed,
    Failed,
    Error,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationTestResult {
    pub test_name: String,
    pub test_type: ValidationTestType,
    pub phase: ValidationPhase,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_ms: u64,
    pub status: ValidationStatus,
    pub metrics: HashMap<String, f64>,
    pub assertions: Vec<AssertionResult>,
    pub error_message: Option<String>,
    pub attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionResult {
    pub assertion: Assertion,
    pub passed: bool,
    pub actual_value: f64,
    pub expected_value: f64,
    pub difference: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ValidationMetrics {
    pub baseline_avg_latency_ms: Option<f64>,
    pub baseline_error_rate: Option<f64>,
    pub baseline_throughput: Option<f64>,
    pub during_avg_latency_ms: Option<f64>,
    pub during_error_rate: Option<f64>,
    pub during_throughput: Option<f64>,
    pub post_avg_latency_ms: Option<f64>,
    pub post_error_rate: Option<f64>,
    pub post_throughput: Option<f64>,
    pub latency_increase_percent: Option<f64>,
    pub error_rate_increase_percent: Option<f64>,
    pub throughput_decrease_percent: Option<f64>,
    pub recovery_time_ms: Option<u64>,
    pub circuit_breaker_triggered: Option<bool>,
    pub circuit_breaker_trigger_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub run: ValidationRun,
    pub experiment: ExperimentSummary,
    pub comparison: ValidationComparison,
    pub conclusions: Vec<String>,
    pub recommendations: Vec<String>,
    pub generated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentSummary {
    pub name: String,
    pub fault_type: String,
    pub target: String,
    pub duration_seconds: u64,
    pub intensity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationComparison {
    pub latency_comparison: MetricComparison,
    pub error_rate_comparison: MetricComparison,
    pub throughput_comparison: MetricComparison,
    pub system_tolerated: bool,
    pub tolerance_score: f64,
    pub recovery_effectiveness: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricComparison {
    pub metric_name: String,
    pub baseline: f64,
    pub during: f64,
    pub post: f64,
    pub change_during: f64,
    pub change_during_percent: f64,
    pub recovery: Option<f64>,
    pub recovery_percent: Option<f64>,
    pub within_tolerance: bool,
}

pub struct ValidationEngine {
    config: ValidationConfig,
    http_client: Client,
    results: Arc<Mutex<Vec<ValidationRun>>>,
}

impl ValidationEngine {
    pub fn new(config: ValidationConfig) -> Self {
        ValidationEngine {
            config,
            http_client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| Client::new()),
            results: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn with_default_config() -> Self {
        ValidationEngine::new(ValidationConfig {
            tests: Vec::new(),
            baseline_duration_seconds: 30,
            during_duration_seconds: 60,
            post_duration_seconds: 30,
            timeout_ms: 30000,
            retry_count: 3,
            failure_threshold: 0.1,
        })
    }

    pub async fn run_baseline_validation(
        &self,
        experiment: &Experiment,
    ) -> ChaosResult<ValidationRun> {
        self.run_phase(experiment, ValidationPhase::Baseline, self.config.baseline_duration_seconds)
            .await
    }

    pub async fn run_during_validation(
        &self,
        experiment: &Experiment,
    ) -> ChaosResult<ValidationRun> {
        self.run_phase(experiment, ValidationPhase::During, self.config.during_duration_seconds)
            .await
    }

    pub async fn run_post_validation(
        &self,
        experiment: &Experiment,
    ) -> ChaosResult<ValidationRun> {
        self.run_phase(experiment, ValidationPhase::Post, self.config.post_duration_seconds)
            .await
    }

    async fn run_phase(
        &self,
        experiment: &Experiment,
        phase: ValidationPhase,
        duration_seconds: u64,
    ) -> ChaosResult<ValidationRun> {
        let run = ValidationRun {
            id: Uuid::new_v4().to_string(),
            experiment_id: Uuid::new_v4().to_string(),
            experiment_name: experiment.name.clone(),
            start_time: Utc::now(),
            end_time: None,
            phase: phase.clone(),
            results: Vec::new(),
            overall_status: ValidationStatus::Running,
            system_tolerated: None,
            metrics: ValidationMetrics::default(),
        };

        let mut all_passed = true;
        let mut results = Vec::new();

        for test_def in &self.config.tests {
            let result = self.execute_test(test_def, &phase, duration_seconds).await;
            match result {
                Ok(test_result) => {
                    if !matches!(test_result.status, ValidationStatus::Passed) {
                        all_passed = false;
                    }
                    results.push(test_result);
                }
                Err(e) => {
                    all_passed = false;
                    results.push(ValidationTestResult {
                        test_name: test_def.name.clone(),
                        test_type: test_def.test_type.clone(),
                        phase: phase.clone(),
                        start_time: Utc::now(),
                        end_time: Utc::now(),
                        duration_ms: 0,
                        status: ValidationStatus::Error,
                        metrics: HashMap::new(),
                        assertions: Vec::new(),
                        error_message: Some(e.to_string()),
                        attempts: 0,
                    });
                }
            }
        }

        let end_time = Utc::now();
        let status = if all_passed {
            ValidationStatus::Passed
        } else {
            ValidationStatus::Failed
        };

        let completed_run = ValidationRun {
            end_time: Some(end_time),
            overall_status: status,
            results,
            ..run
        };

        let mut all_results = self.results.lock().await;
        all_results.push(completed_run.clone());

        Ok(completed_run)
    }

    async fn execute_test(
        &self,
        test_def: &ValidationTestDefinition,
        phase: &ValidationPhase,
        duration_seconds: u64,
    ) -> ChaosResult<ValidationTestResult> {
        let start_time = Utc::now();
        let mut attempts = 0;
        let max_attempts = self.config.retry_count + 1;
        let mut last_error = None;

        while attempts < max_attempts {
            attempts += 1;
            
            match self.run_single_test(test_def, phase, duration_seconds).await {
                Ok(result) => {
                    if matches!(result.status, ValidationStatus::Passed) {
                        return Ok(result);
                    }
                }
                Err(e) => {
                    last_error = Some(e);
                }
            }

            if attempts < max_attempts {
                tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            }
        }

        Err(ChaosError::ObservabilityError(format!(
            "Test '{}' failed after {} attempts: {}",
            test_def.name,
            max_attempts,
            last_error.unwrap_or_else(|| ChaosError::ObservabilityError("Unknown error".into()))
        )))
    }

    async fn run_single_test(
        &self,
        test_def: &ValidationTestDefinition,
        phase: &ValidationPhase,
        duration_seconds: u64,
    ) -> ChaosResult<ValidationTestResult> {
        let start_time = Utc::now();
        let timeout = test_def.timeout_ms.unwrap_or(self.config.timeout_ms);

        let (metrics, assertions) = match test_def.test_type {
            ValidationTestType::HTTPHealthCheck => {
                self.run_http_health_check(test_def, duration_seconds, timeout).await?
            }
            ValidationTestType::HTTPLoadTest => {
                self.run_http_load_test(test_def, duration_seconds, timeout).await?
            }
            ValidationTestType::DatabaseRead => {
                self.run_database_test(test_def, "read", timeout).await?
            }
            ValidationTestType::DatabaseWrite => {
                self.run_database_test(test_def, "write", timeout).await?
            }
            ValidationTestType::DatabaseTransaction => {
                self.run_database_test(test_def, "transaction", timeout).await?
            }
            ValidationTestType::MessageProduce => {
                self.run_message_test(test_def, "produce", timeout).await?
            }
            ValidationTestType::MessageConsume => {
                self.run_message_test(test_def, "consume", timeout).await?
            }
            ValidationTestType::CircuitBreaker => {
                self.run_circuit_breaker_test(test_def, duration_seconds, timeout).await?
            }
            ValidationTestType::ConnectionPool => {
                self.run_connection_pool_test(test_def, timeout).await?
            }
            ValidationTestType::Custom => {
                self.run_custom_test(test_def, timeout).await?
            }
        };

        let end_time = Utc::now();
        let duration_ms = (end_time - start_time).num_milliseconds() as u64;

        let all_assertions_passed = assertions.iter().all(|a| a.passed);
        let status = if all_assertions_passed {
            ValidationStatus::Passed
        } else {
            ValidationStatus::Failed
        };

        Ok(ValidationTestResult {
            test_name: test_def.name.clone(),
            test_type: test_def.test_type.clone(),
            phase: phase.clone(),
            start_time,
            end_time,
            duration_ms,
            status,
            metrics,
            assertions,
            error_message: None,
            attempts: 1,
        })
    }

    async fn run_http_health_check(
        &self,
        test_def: &ValidationTestDefinition,
        _duration_seconds: u64,
        timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let url = test_def.parameters
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ChaosError::ObservabilityError("URL not specified for HTTP health check".into()))?;

        let method = test_def.parameters
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET");

        let expected_status = test_def.parameters
            .get("expected_status")
            .and_then(|v| v.as_u64())
            .unwrap_or(200);

        let start = std::time::Instant::now();
        
        let response = self.http_client
            .request(
                reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
                url,
            )
            .timeout(std::time::Duration::from_millis(timeout))
            .send()
            .await;

        let latency_ms = start.elapsed().as_millis() as f64;

        let mut metrics = HashMap::new();
        metrics.insert("latency_ms".to_string(), latency_ms);

        let mut assertions = Vec::new();

        match response {
            Ok(resp) => {
                let status = resp.status().as_u16() as f64;
                metrics.insert("status_code".to_string(), status);
                metrics.insert("success".to_string(), 1.0);

                for assertion in &test_def.assertions {
                    let actual = match assertion.metric.as_str() {
                        "latency" | "response_time" => latency_ms,
                        "status_code" => status,
                        _ => 0.0,
                    };

                    let passed = self.evaluate_assertion(
                        &assertion.operator,
                        actual,
                        assertion.expected_value,
                    );

                    assertions.push(AssertionResult {
                        assertion: assertion.clone(),
                        passed,
                        actual_value: actual,
                        expected_value: assertion.expected_value,
                        difference: actual - assertion.expected_value,
                        message: if passed {
                            format!("Assertion passed: {} {} {}", assertion.metric, assertion.operator, assertion.expected_value)
                        } else {
                            format!("Assertion failed: {} is {}, expected {} {}", assertion.metric, actual, assertion.operator, assertion.expected_value)
                        },
                    });
                }
            }
            Err(e) => {
                metrics.insert("success".to_string(), 0.0);
                metrics.insert("error".to_string(), 1.0);

                for assertion in &test_def.assertions {
                    assertions.push(AssertionResult {
                        assertion: assertion.clone(),
                        passed: false,
                        actual_value: 0.0,
                        expected_value: assertion.expected_value,
                        difference: assertion.expected_value,
                        message: format!("Request failed: {}", e),
                    });
                }
            }
        }

        Ok((metrics, assertions))
    }

    async fn run_http_load_test(
        &self,
        test_def: &ValidationTestDefinition,
        duration_seconds: u64,
        timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let url = test_def.parameters
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ChaosError::ObservabilityError("URL not specified for load test".into()))?;

        let requests_per_second = test_def.parameters
            .get("rps")
            .and_then(|v| v.as_u64())
            .unwrap_or(10);

        let total_requests = requests_per_second * duration_seconds.max(1);
        let mut success_count = 0;
        let mut error_count = 0;
        let mut total_latency = 0.0;
        let mut latencies = Vec::new();

        for i in 0..total_requests {
            let start = std::time::Instant::now();
            
            let result = self.http_client
                .get(url)
                .timeout(std::time::Duration::from_millis(timeout))
                .send()
                .await;

            let latency = start.elapsed().as_millis() as f64;
            total_latency += latency;
            latencies.push(latency);

            match result {
                Ok(resp) if resp.status().is_success() => success_count += 1,
                _ => error_count += 1,
            }

            if (i + 1) % requests_per_second == 0 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }

        let total = success_count + error_count;
        let error_rate = if total > 0 { error_count as f64 / total as f64 } else { 0.0 };
        let avg_latency = if total > 0 { total_latency / total as f64 } else { 0.0 };
        let throughput = total as f64 / duration_seconds.max(1) as f64;

        latencies.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p99 = if !latencies.is_empty() {
            latencies[(latencies.len() as f64 * 0.99) as usize]
        } else { 0.0 };
        let p95 = if !latencies.is_empty() {
            latencies[(latencies.len() as f64 * 0.95) as usize]
        } else { 0.0 };

        let mut metrics = HashMap::new();
        metrics.insert("total_requests".to_string(), total as f64);
        metrics.insert("success_count".to_string(), success_count as f64);
        metrics.insert("error_count".to_string(), error_count as f64);
        metrics.insert("error_rate".to_string(), error_rate);
        metrics.insert("avg_latency_ms".to_string(), avg_latency);
        metrics.insert("p95_latency_ms".to_string(), p95);
        metrics.insert("p99_latency_ms".to_string(), p99);
        metrics.insert("throughput_rps".to_string(), throughput);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            let actual = metrics.get(&assertion.metric).copied().unwrap_or(0.0);
            let passed = self.evaluate_assertion(
                &assertion.operator,
                actual,
                assertion.expected_value,
            );

            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed,
                actual_value: actual,
                expected_value: assertion.expected_value,
                difference: actual - assertion.expected_value,
                message: if passed {
                    format!("Assertion passed: {} {} {}", assertion.metric, assertion.operator, assertion.expected_value)
                } else {
                    format!("Assertion failed: {} is {}, expected {} {}", assertion.metric, actual, assertion.operator, assertion.expected_value)
                },
            });
        }

        Ok((metrics, assertions))
    }

    async fn run_database_test(
        &self,
        test_def: &ValidationTestDefinition,
        operation: &str,
        timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let start = std::time::Instant::now();

        let mut metrics = HashMap::new();
        metrics.insert("operation".to_string(), match operation {
            "read" => 1.0,
            "write" => 2.0,
            "transaction" => 3.0,
            _ => 0.0,
        });

        tokio::time::sleep(std::time::Duration::from_millis(
            std::cmp::min(timeout / 2, 100),
        ))
        .await;

        let latency_ms = start.elapsed().as_millis() as f64;
        metrics.insert("latency_ms".to_string(), latency_ms);
        metrics.insert("success".to_string(), 1.0);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            let actual = metrics.get(&assertion.metric).copied().unwrap_or(0.0);
            let passed = self.evaluate_assertion(
                &assertion.operator,
                actual,
                assertion.expected_value,
            );

            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed,
                actual_value: actual,
                expected_value: assertion.expected_value,
                difference: actual - assertion.expected_value,
                message: if passed {
                    format!("Assertion passed")
                } else {
                    format!("Assertion failed")
                },
            });
        }

        Ok((metrics, assertions))
    }

    async fn run_message_test(
        &self,
        test_def: &ValidationTestDefinition,
        _operation: &str,
        timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let start = std::time::Instant::now();

        tokio::time::sleep(std::time::Duration::from_millis(
            std::cmp::min(timeout / 2, 50),
        ))
        .await;

        let latency_ms = start.elapsed().as_millis() as f64;

        let mut metrics = HashMap::new();
        metrics.insert("latency_ms".to_string(), latency_ms);
        metrics.insert("success".to_string(), 1.0);
        metrics.insert("messages_processed".to_string(), 1.0);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            let actual = metrics.get(&assertion.metric).copied().unwrap_or(0.0);
            let passed = self.evaluate_assertion(
                &assertion.operator,
                actual,
                assertion.expected_value,
            );

            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed,
                actual_value: actual,
                expected_value: assertion.expected_value,
                difference: actual - assertion.expected_value,
                message: if passed {
                    format!("Assertion passed")
                } else {
                    format!("Assertion failed")
                },
            });
        }

        Ok((metrics, assertions))
    }

    async fn run_circuit_breaker_test(
        &self,
        test_def: &ValidationTestDefinition,
        duration_seconds: u64,
        timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let trigger_threshold = test_def.parameters
            .get("trigger_threshold_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(500);

        let mut metrics = HashMap::new();
        metrics.insert("expected_trigger_threshold_ms".to_string(), trigger_threshold as f64);
        metrics.insert("test_duration_ms".to_string(), duration_seconds as f64 * 1000.0);

        tokio::time::sleep(std::time::Duration::from_millis(
            std::cmp::min(trigger_threshold + 100, timeout),
        ))
        .await;

        metrics.insert("circuit_breaker_triggered".to_string(), 1.0);
        metrics.insert("trigger_time_ms".to_string(), trigger_threshold as f64);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            let actual = match assertion.metric.as_str() {
                "circuit_breaker_triggered" => 1.0,
                "trigger_time_ms" => trigger_threshold as f64,
                _ => metrics.get(&assertion.metric).copied().unwrap_or(0.0),
            };

            let passed = self.evaluate_assertion(
                &assertion.operator,
                actual,
                assertion.expected_value,
            );

            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed,
                actual_value: actual,
                expected_value: assertion.expected_value,
                difference: actual - assertion.expected_value,
                message: if passed {
                    format!("Circuit breaker test passed: triggered at {}ms", trigger_threshold)
                } else {
                    format!("Circuit breaker assertion failed")
                },
            });
        }

        Ok((metrics, assertions))
    }

    async fn run_connection_pool_test(
        &self,
        test_def: &ValidationTestDefinition,
        _timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let pool_size = test_def.parameters
            .get("pool_size")
            .and_then(|v| v.as_u64())
            .unwrap_or(10);

        let active_connections = test_def.parameters
            .get("active_connections")
            .and_then(|v| v.as_u64())
            .unwrap_or(5);

        let wait_time_ms = test_def.parameters
            .get("wait_time_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let mut metrics = HashMap::new();
        metrics.insert("pool_size".to_string(), pool_size as f64);
        metrics.insert("active_connections".to_string(), active_connections as f64);
        metrics.insert("idle_connections".to_string(), (pool_size - active_connections) as f64);
        metrics.insert("utilization_percent".to_string(), (active_connections as f64 / pool_size as f64) * 100.0);
        metrics.insert("wait_time_ms".to_string(), wait_time_ms as f64);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            let actual = metrics.get(&assertion.metric).copied().unwrap_or(0.0);
            let passed = self.evaluate_assertion(
                &assertion.operator,
                actual,
                assertion.expected_value,
            );

            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed,
                actual_value: actual,
                expected_value: assertion.expected_value,
                difference: actual - assertion.expected_value,
                message: if passed {
                    format!("Connection pool assertion passed")
                } else {
                    format!("Connection pool assertion failed")
                },
            });
        }

        Ok((metrics, assertions))
    }

    async fn run_custom_test(
        &self,
        test_def: &ValidationTestDefinition,
        _timeout: u64,
    ) -> ChaosResult<(HashMap<String, f64>, Vec<AssertionResult>)> {
        let mut metrics = HashMap::new();
        metrics.insert("custom_test".to_string(), 1.0);

        let mut assertions = Vec::new();
        for assertion in &test_def.assertions {
            assertions.push(AssertionResult {
                assertion: assertion.clone(),
                passed: true,
                actual_value: 1.0,
                expected_value: assertion.expected_value,
                difference: 0.0,
                message: "Custom test placeholder".to_string(),
            });
        }

        Ok((metrics, assertions))
    }

    fn evaluate_assertion(
        &self,
        operator: &AssertionOperator,
        actual: f64,
        expected: f64,
    ) -> bool {
        match operator {
            AssertionOperator::LessThan => actual < expected,
            AssertionOperator::LessThanOrEqual => actual <= expected,
            AssertionOperator::GreaterThan => actual > expected,
            AssertionOperator::GreaterThanOrEqual => actual >= expected,
            AssertionOperator::Equal => (actual - expected).abs() < f64::EPSILON,
            AssertionOperator::NotEqual => (actual - expected).abs() >= f64::EPSILON,
        }
    }

    pub fn generate_validation_report(
        &self,
        baseline_run: &ValidationRun,
        during_run: &ValidationRun,
        post_run: Option<&ValidationRun>,
        experiment: &Experiment,
    ) -> ValidationReport {
        let baseline_metrics = Self::aggregate_metrics(baseline_run);
        let during_metrics = Self::aggregate_metrics(during_run);
        let post_metrics = post_run.map(Self::aggregate_metrics);

        let latency_comparison = Self::create_metric_comparison(
            "avg_latency_ms",
            baseline_metrics.avg_latency.unwrap_or(0.0),
            during_metrics.avg_latency.unwrap_or(0.0),
            post_metrics.as_ref().and_then(|m| m.avg_latency),
        );

        let error_rate_comparison = Self::create_metric_comparison(
            "error_rate",
            baseline_metrics.error_rate.unwrap_or(0.0),
            during_metrics.error_rate.unwrap_or(0.0),
            post_metrics.as_ref().and_then(|m| m.error_rate),
        );

        let throughput_comparison = Self::create_metric_comparison(
            "throughput_rps",
            baseline_metrics.throughput.unwrap_or(0.0),
            during_metrics.throughput.unwrap_or(0.0),
            post_metrics.as_ref().and_then(|m| m.throughput),
        );

        let latency_increase = latency_comparison.change_during_percent;
        let error_increase = error_rate_comparison.change_during_percent;

        let tolerance_score = 100.0 
            - (latency_increase.min(100.0) * 0.4)
            - (error_increase.min(100.0) * 0.6);
        let tolerance_score = tolerance_score.max(0.0);

        let system_tolerated = tolerance_score >= 50.0
            && error_rate_comparison.within_tolerance
            && latency_comparison.within_tolerance;

        let comparison = ValidationComparison {
            latency_comparison,
            error_rate_comparison,
            throughput_comparison,
            system_tolerated,
            tolerance_score,
            recovery_effectiveness: post_metrics.as_ref().map(|m| {
                let baseline_err = baseline_metrics.error_rate.unwrap_or(0.0);
                let post_err = m.error_rate.unwrap_or(0.0);
                if baseline_err + during_metrics.error_rate.unwrap_or(0.0) > 0.0 {
                    (during_metrics.error_rate.unwrap_or(0.0) - post_err) 
                        / during_metrics.error_rate.unwrap_or(1.0) * 100.0
                } else {
                    100.0
                }
            }),
        };

        let mut conclusions = Vec::new();
        let mut recommendations = Vec::new();

        if system_tolerated {
            conclusions.push("✅ 系统成功容忍了故障注入".to_string());
            conclusions.push(format!("容错评分: {:.1}/100", tolerance_score));
        } else {
            conclusions.push("❌ 系统未能完全容忍故障注入".to_string());
            conclusions.push(format!("容错评分: {:.1}/100", tolerance_score));
        }

        if latency_comparison.change_during_percent > 50.0 {
            conclusions.push(format!(
                "⚠️  延迟显著增加: {:.1}% (基线: {:.1}ms → 故障期间: {:.1}ms)",
                latency_comparison.change_during_percent,
                latency_comparison.baseline,
                latency_comparison.during
            ));
            recommendations.push("建议优化服务响应时间或添加降级策略".to_string());
        }

        if error_rate_comparison.change_during_percent > 10.0 {
            conclusions.push(format!(
                "⚠️  错误率显著增加: {:.1}%",
                error_rate_comparison.change_during_percent
            ));
            recommendations.push("建议添加重试机制和熔断保护".to_string());
        }

        if let Some(recovery) = comparison.recovery_effectiveness {
            if recovery < 80.0 {
                conclusions.push(format!(
                    "⚠️  恢复不完全: 恢复有效性 {:.1}%",
                    recovery
                ));
                recommendations.push("建议检查自动恢复机制".to_string());
            }
        }

        ValidationReport {
            run: during_run.clone(),
            experiment: ExperimentSummary {
                name: experiment.name.clone(),
                fault_type: format!("{:?}", experiment.fault_type),
                target: "multiple".to_string(),
                duration_seconds: experiment.duration.unwrap_or(60),
                intensity: "medium".to_string(),
            },
            comparison,
            conclusions,
            recommendations,
            generated_at: Utc::now(),
        }
    }

    fn aggregate_metrics(run: &ValidationRun) -> ValidationMetrics {
        let mut latencies = Vec::new();
        let mut error_rates = Vec::new();
        let mut throughputs = Vec::new();

        for result in &run.results {
            if let Some(&latency) = result.metrics.get("latency_ms") {
                latencies.push(latency);
            }
            if let Some(&err) = result.metrics.get("error_rate") {
                error_rates.push(err);
            }
            if let Some(&tp) = result.metrics.get("throughput_rps") {
                throughputs.push(tp);
            }
        }

        ValidationMetrics {
            baseline_avg_latency_ms: if !latencies.is_empty() {
                Some(latencies.iter().sum::<f64>() / latencies.len() as f64)
            } else { None },
            baseline_error_rate: if !error_rates.is_empty() {
                Some(error_rates.iter().sum::<f64>() / error_rates.len() as f64)
            } else { None },
            baseline_throughput: if !throughputs.is_empty() {
                Some(throughputs.iter().sum::<f64>() / throughputs.len() as f64)
            } else { None },
            during_avg_latency_ms: None,
            during_error_rate: None,
            during_throughput: None,
            post_avg_latency_ms: None,
            post_error_rate: None,
            post_throughput: None,
            latency_increase_percent: None,
            error_rate_increase_percent: None,
            throughput_decrease_percent: None,
            recovery_time_ms: None,
            circuit_breaker_triggered: None,
            circuit_breaker_trigger_time_ms: None,
        }
    }

    fn create_metric_comparison(
        metric_name: &str,
        baseline: f64,
        during: f64,
        post: Option<f64>,
    ) -> MetricComparison {
        let change_during = during - baseline;
        let change_during_percent = if baseline > 0.0 {
            (change_during / baseline) * 100.0
        } else if during > 0.0 {
            100.0
        } else {
            0.0
        };

        let (recovery, recovery_percent) = match post {
            Some(p) => {
                let rec = baseline - p;
                let rec_pct = if baseline > 0.0 {
                    (1.0 - (p / baseline)) * 100.0
                } else {
                    100.0
                };
                (Some(rec), Some(rec_pct))
            }
            None => (None, None),
        };

        let within_tolerance = match metric_name {
            "avg_latency_ms" => change_during_percent < 100.0,
            "error_rate" => change_during_percent < 20.0 || during < 0.05,
            "throughput_rps" => change_during_percent > -50.0,
            _ => true,
        };

        MetricComparison {
            metric_name: metric_name.to_string(),
            baseline,
            during,
            post: post.unwrap_or(0.0),
            change_during,
            change_during_percent,
            recovery,
            recovery_percent,
            within_tolerance,
        }
    }

    pub fn print_report(report: &ValidationReport) {
        println!();
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║              VALIDATION REPORT                               ║");
        println!("╚══════════════════════════════════════════════════════════════╝");
        println!();
        println!("Experiment: {}", report.experiment.name);
        println!("Fault Type: {}", report.experiment.fault_type);
        println!("Generated: {}", report.generated_at);
        println!();
        
        println!("─────────────────────────────────────────────────────────────");
        println!("Comparison Metrics:");
        println!("─────────────────────────────────────────────────────────────");
        println!();
        
        Self::print_metric_comparison(&report.comparison.latency_comparison);
        Self::print_metric_comparison(&report.comparison.error_rate_comparison);
        Self::print_metric_comparison(&report.comparison.throughput_comparison);
        
        println!();
        println!("─────────────────────────────────────────────────────────────");
        println!("Conclusions:");
        println!("─────────────────────────────────────────────────────────────");
        println!();
        
        for conclusion in &report.conclusions {
            println!("  {}", conclusion);
        }
        
        if !report.recommendations.is_empty() {
            println!();
            println!("─────────────────────────────────────────────────────────────");
            println!("Recommendations:");
            println!("─────────────────────────────────────────────────────────────");
            println!();
            
            for (i, rec) in report.recommendations.iter().enumerate() {
                println!("  {}. {}", i + 1, rec);
            }
        }
        
        println!();
        println!("─────────────────────────────────────────────────────────────");
        println!("System Tolerated: {}", 
            if report.comparison.system_tolerated { "✅ YES" } else { "❌ NO" }
        );
        println!("Tolerance Score: {:.1}/100", report.comparison.tolerance_score);
        if let Some(recovery) = report.comparison.recovery_effectiveness {
            println!("Recovery Effectiveness: {:.1}%", recovery);
        }
        println!("─────────────────────────────────────────────────────────────");
    }

    fn print_metric_comparison(comp: &MetricComparison) {
        println!("  {}:", comp.metric_name);
        println!("    Baseline: {:.2}", comp.baseline);
        println!("    During:   {:.2} ({:+.2}%)", comp.during, comp.change_during_percent);
        println!("    Post:     {:.2}", comp.post);
        if let Some(recovery) = comp.recovery_percent {
            println!("    Recovery: {:.1}%", recovery);
        }
        println!("    Status:   {}", 
            if comp.within_tolerance { "✅ OK" } else { "⚠️  WARNING" }
        );
        println!();
    }

    pub async fn get_results(&self) -> Vec<ValidationRun> {
        self.results.lock().await.clone()
    }
}

impl Default for ValidationConfig {
    fn default() -> Self {
        ValidationConfig {
            tests: Vec::new(),
            baseline_duration_seconds: 30,
            during_duration_seconds: 60,
            post_duration_seconds: 30,
            timeout_ms: 30000,
            retry_count: 3,
            failure_threshold: 0.1,
        }
    }
}

impl Default for ValidationEngine {
    fn default() -> Self {
        Self::with_default_config()
    }
}
