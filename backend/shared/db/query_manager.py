"""
Query Manager
Handles dynamic schema-aware queries
"""
from django.db import connection
from typing import Any, Dict, List


class QueryManager:
    """
    Manages schema-aware database queries
    """
    
    @staticmethod
    def execute_in_schema(schema_name: str, sql: str, params: list = None) -> Any:
        """
        Execute SQL in specific schema
        
        Args:
            schema_name: Schema to execute in
            sql: SQL query
            params: Query parameters
            
        Returns:
            Query results
        """
        with connection.cursor() as cursor:
            cursor.execute(f"SET search_path TO {schema_name}, public")
            cursor.execute(sql, params or [])
            return cursor.fetchall()
    
    @staticmethod
    def fetch_dict(schema_name: str, sql: str, params: list = None) -> List[Dict]:
        """
        Execute query and return results as list of dicts
        
        Args:
            schema_name: Schema to execute in
            sql: SQL query
            params: Query parameters
            
        Returns:
            List of dictionaries
        """
        with connection.cursor() as cursor:
            cursor.execute(f"SET search_path TO {schema_name}, public")
            cursor.execute(sql, params or [])
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
