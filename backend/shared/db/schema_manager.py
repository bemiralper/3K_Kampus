"""
PostgreSQL Schema Manager
Handles dynamic schema creation and management
"""
from django.db import connection


class SchemaManager:
    """
    Manages PostgreSQL schemas for multi-tenant architecture
    """
    
    @staticmethod
    def create_schema(schema_name: str) -> bool:
        """
        Create a new PostgreSQL schema
        
        Args:
            schema_name: Name of the schema to create
            
        Returns:
            bool: True if created successfully
        """
        try:
            with connection.cursor() as cursor:
                cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {schema_name}")
            return True
        except Exception as e:
            print(f"Error creating schema {schema_name}: {e}")
            return False
    
    @staticmethod
    def drop_schema(schema_name: str, cascade: bool = False) -> bool:
        """
        Drop a PostgreSQL schema
        
        Args:
            schema_name: Name of the schema to drop
            cascade: If True, drop all objects in schema
            
        Returns:
            bool: True if dropped successfully
        """
        try:
            cascade_sql = "CASCADE" if cascade else ""
            with connection.cursor() as cursor:
                cursor.execute(f"DROP SCHEMA IF EXISTS {schema_name} {cascade_sql}")
            return True
        except Exception as e:
            print(f"Error dropping schema {schema_name}: {e}")
            return False
    
    @staticmethod
    def schema_exists(schema_name: str) -> bool:
        """
        Check if a schema exists
        
        Args:
            schema_name: Name of the schema to check
            
        Returns:
            bool: True if schema exists
        """
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name = %s",
                [schema_name]
            )
            return cursor.fetchone() is not None
    
    @staticmethod
    def get_all_schemas() -> list:
        """
        Get list of all non-system schemas
        
        Returns:
            list: List of schema names
        """
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY schema_name
            """)
            return [row[0] for row in cursor.fetchall()]
    
    @staticmethod
    def set_search_path(schema_name: str) -> None:
        """
        Set the search path for the current connection
        
        Args:
            schema_name: Name of the schema to set as search path
        """
        with connection.cursor() as cursor:
            cursor.execute(f"SET search_path TO {schema_name}, public")
