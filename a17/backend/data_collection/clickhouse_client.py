from django.conf import settings
from clickhouse_driver import Client
from datetime import datetime


class ClickHouseClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._client = Client(
                host=settings.CLICKHOUSE_CONFIG['host'],
                port=settings.CLICKHOUSE_CONFIG['port'],
                database=settings.CLICKHOUSE_CONFIG['database'],
                user=settings.CLICKHOUSE_CONFIG['user'],
                password=settings.CLICKHOUSE_CONFIG['password'],
                settings={
                    'max_execution_time': 30,
                    'max_block_size': 100000,
                    'max_memory_usage': 10000000000,
                }
            )
        return cls._instance

    @property
    def client(self):
        return self._client

    def initialize_database(self):
        self.client.execute(
            f"CREATE DATABASE IF NOT EXISTS {settings.CLICKHOUSE_CONFIG['database']}"
        )

    def initialize_tables(self):
        self.client.execute("""
            CREATE TABLE IF NOT EXISTS raw_behavior_logs (
                id UUID,
                user_id String,
                session_id String,
                event_type String,
                product_id Nullable(String),
                page_url String,
                referer_url Nullable(String),
                timestamp DateTime,
                user_agent String,
                ip_address String,
                device_type String,
                browser String,
                os String,
                event_data String,
                received_at DateTime DEFAULT now()
            )
            ENGINE = MergeTree()
            PARTITION BY toYYYYMM(timestamp)
            ORDER BY (timestamp, user_id, event_type)
            TTL timestamp + INTERVAL 30 DAY
            SETTINGS index_granularity = 8192
        """)

        self.client.execute("""
            CREATE TABLE IF NOT EXISTS user_behavior_events (
                id UUID,
                user_id String,
                session_id String,
                event_type String,
                product_id Nullable(String),
                page_url String,
                timestamp DateTime,
                duration Int32 DEFAULT 0,
                device_type String,
                ip_address String,
                order_id Nullable(String),
                order_amount Nullable(Decimal(12, 2)),
                is_valid UInt8 DEFAULT 1,
                processed_at DateTime DEFAULT now()
            )
            ENGINE = MergeTree()
            PARTITION BY toYYYYMM(timestamp)
            ORDER BY (timestamp, user_id, event_type)
            SETTINGS index_granularity = 8192
        """)

        self._initialize_aggregating_views()

    def _initialize_aggregating_views(self):
        self.client.execute("""
            CREATE MATERIALIZED VIEW IF NOT EXISTS daily_event_stats_mv
            ENGINE = SummingMergeTree()
            PARTITION BY toYYYYMM(date)
            ORDER BY (date, event_type, device_type)
            AS
            SELECT
                toDate(timestamp) AS date,
                event_type,
                device_type,
                count() AS event_count,
                uniq(user_id) AS user_count,
                uniq(session_id) AS session_count
            FROM user_behavior_events
            WHERE is_valid = 1
            GROUP BY date, event_type, device_type
        """)

        self.client.execute("""
            CREATE MATERIALIZED VIEW IF NOT EXISTS daily_product_stats_mv
            ENGINE = SummingMergeTree()
            PARTITION BY toYYYYMM(date)
            ORDER BY (date, product_id, event_type)
            AS
            SELECT
                toDate(timestamp) AS date,
                product_id,
                event_type,
                count() AS event_count,
                uniq(user_id) AS user_count,
                sumIf(order_amount, event_type = 'purchase') AS revenue
            FROM user_behavior_events
            WHERE is_valid = 1 AND product_id IS NOT NULL
            GROUP BY date, product_id, event_type
        """)

        self.client.execute("""
            CREATE TABLE IF NOT EXISTS daily_event_stats (
                date Date,
                event_type String,
                device_type String,
                event_count UInt64,
                user_count AggregateFunction(uniq, String),
                session_count AggregateFunction(uniq, String)
            )
            ENGINE = AggregatingMergeTree()
            PARTITION BY toYYYYMM(date)
            ORDER BY (date, event_type, device_type)
        """)

        self.client.execute("""
            CREATE TABLE IF NOT EXISTS daily_product_stats (
                date Date,
                product_id String,
                event_type String,
                event_count UInt64,
                user_count AggregateFunction(uniq, String),
                revenue Decimal(12, 2)
            )
            ENGINE = AggregatingMergeTree()
            PARTITION BY toYYYYMM(date)
            ORDER BY (date, product_id, event_type)
        """)

    def insert_raw_log(self, log_data):
        query = """
            INSERT INTO raw_behavior_logs (
                id, user_id, session_id, event_type, product_id, page_url,
                referer_url, timestamp, user_agent, ip_address, device_type,
                browser, os, event_data
            ) VALUES
        """
        self.client.execute(query, [log_data])

    def insert_processed_events(self, events):
        if not events:
            return
        query = """
            INSERT INTO user_behavior_events (
                id, user_id, session_id, event_type, product_id, page_url,
                timestamp, duration, device_type, ip_address, order_id,
                order_amount, is_valid
            ) VALUES
        """
        self.client.execute(query, events)

    def execute_query(self, query, params=None):
        return self.client.execute(query, params or {})

    def execute_query_with_columns(self, query, params=None):
        return self.client.execute(query, params or {}, with_column_types=True)

    def get_daily_stats_aggregated(self, start_date, end_date):
        return self.client.execute("""
            SELECT
                date,
                sumIf(event_count, event_type = 'view') AS pv,
                uniqExactMerge(user_count) FILTER (WHERE event_type = 'view') AS uv,
                sumIf(event_count, event_type = 'click') AS clicks,
                sumIf(event_count, event_type = 'add_to_cart') AS cart_adds,
                sumIf(event_count, event_type = 'purchase') AS purchases
            FROM daily_event_stats_mv
            WHERE date >= %(start_date)s AND date <= %(end_date)s
            GROUP BY date
            ORDER BY date
        """, {'start_date': start_date, 'end_date': end_date})

    def get_funnel_stats(self, start_date, end_date):
        return self.client.execute("""
            SELECT
                event_type,
                uniqExact(user_id) AS user_count
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND is_valid = 1
                AND event_type IN ('view', 'click', 'add_to_cart', 'purchase')
            GROUP BY event_type
            ORDER BY
                CASE event_type
                    WHEN 'view' THEN 1
                    WHEN 'click' THEN 2
                    WHEN 'add_to_cart' THEN 3
                    WHEN 'purchase' THEN 4
                END
        """, {'start_date': start_date, 'end_date': end_date})

    def get_overview_aggregated(self, start_date, end_date):
        return self.client.execute("""
            SELECT
                sumIf(event_count, event_type = 'view') AS pv,
                uniqExactMerge(user_count) FILTER (WHERE event_type = 'view') AS uv,
                sumIf(event_count, event_type = 'click') AS clicks,
                sumIf(event_count, event_type = 'add_to_cart') AS add_to_carts,
                sumIf(event_count, event_type = 'purchase') AS purchases,
                sum(revenue) AS total_revenue
            FROM (
                SELECT
                    event_type,
                    event_count,
                    user_count,
                    0 AS revenue
                FROM daily_event_stats_mv
                WHERE date >= %(start_date)s AND date <= %(end_date)s
                UNION ALL
                SELECT
                    event_type,
                    event_count,
                    user_count,
                    revenue
                FROM daily_product_stats_mv
                WHERE date >= %(start_date)s AND date <= %(end_date)s
                  AND event_type = 'purchase'
            )
        """, {'start_date': start_date, 'end_date': end_date})

    def get_product_performance_aggregated(self, start_date, end_date, limit=10):
        return self.client.execute(f"""
            SELECT
                product_id,
                sumIf(event_count, event_type = 'view') AS views,
                sumIf(event_count, event_type = 'click') AS clicks,
                sumIf(event_count, event_type = 'add_to_cart') AS add_to_carts,
                sumIf(event_count, event_type = 'purchase') AS purchases,
                sum(revenue) AS revenue
            FROM daily_product_stats_mv
            WHERE date >= %(start_date)s AND date <= %(end_date)s
            GROUP BY product_id
            ORDER BY revenue DESC
            LIMIT {limit}
        """, {'start_date': start_date, 'end_date': end_date})

    def get_user_retention_aggregated(self, start_date, end_date):
        return self.client.execute("""
            WITH
                cohort_users AS (
                    SELECT
                        user_id,
                        min(toDate(timestamp)) AS first_visit_date
                    FROM user_behavior_events
                    WHERE toDate(timestamp) >= %(start_date)s
                      AND toDate(timestamp) <= %(end_date)s
                      AND is_valid = 1
                    GROUP BY user_id
                )
            SELECT
                first_visit_date AS cohort_date,
                count() AS cohort_size,
                countIf(toDate(timestamp) = first_visit_date) AS day_0,
                countIf(toDate(timestamp) = first_visit_date + INTERVAL 1 DAY) AS day_1,
                countIf(toDate(timestamp) = first_visit_date + INTERVAL 3 DAY) AS day_3,
                countIf(toDate(timestamp) = first_visit_date + INTERVAL 7 DAY) AS day_7,
                countIf(toDate(timestamp) = first_visit_date + INTERVAL 14 DAY) AS day_14,
                countIf(toDate(timestamp) = first_visit_date + INTERVAL 30 DAY) AS day_30
            FROM cohort_users
            LEFT JOIN user_behavior_events ube USING (user_id)
            WHERE ube.is_valid = 1
            GROUP BY cohort_date
            ORDER BY cohort_date
            LIMIT 10
        """, {'start_date': start_date, 'end_date': end_date})

    def get_repeat_purchase_stats(self, start_date, end_date):
        return self.client.execute("""
            SELECT
                count(DISTINCT user_id) AS total_buyers,
                countIf(order_count >= 2) AS repeat_buyers
            FROM (
                SELECT
                    user_id,
                    count() AS order_count
                FROM user_behavior_events
                WHERE toDate(timestamp) >= %(start_date)s
                  AND toDate(timestamp) <= %(end_date)s
                  AND event_type = 'purchase'
                  AND is_valid = 1
                GROUP BY user_id
            )
        """, {'start_date': start_date, 'end_date': end_date})


def get_clickhouse_client():
    return ClickHouseClient()
