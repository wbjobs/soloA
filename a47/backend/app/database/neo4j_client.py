from neo4j import GraphDatabase, Driver
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class Neo4jClient:
    _driver: Optional[Driver] = None

    @classmethod
    def init(cls, uri: str, user: str, password: str):
        if cls._driver is None:
            cls._driver = GraphDatabase.driver(uri, auth=(user, password))
            logger.info(f"Connected to Neo4j at {uri}")

    @classmethod
    def close(cls):
        if cls._driver is not None:
            cls._driver.close()
            cls._driver = None
            logger.info("Closed Neo4j connection")

    @classmethod
    def run_query(cls, query: str, parameters: Dict[str, Any] = None) -> List[Dict]:
        if cls._driver is None:
            raise RuntimeError("Neo4j driver not initialized. Call init() first.")

        with cls._driver.session() as session:
            result = session.run(query, parameters or {})
            return [dict(record) for record in result]

    @classmethod
    def run_query_with_tx(cls, query: str, parameters: Dict[str, Any] = None) -> List[Dict]:
        if cls._driver is None:
            raise RuntimeError("Neo4j driver not initialized. Call init() first.")

        def transaction(tx):
            result = tx.run(query, parameters or {})
            return [dict(record) for record in result]

        with cls._driver.session() as session:
            return session.execute_write(transaction)
