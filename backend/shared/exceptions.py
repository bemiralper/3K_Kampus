"""
Custom Exceptions
"""


class TenantException(Exception):
    """Base exception for tenant-related errors"""
    pass


class NoActiveTenantException(TenantException):
    """Raised when no active tenant is set"""
    pass


class InvalidTenantException(TenantException):
    """Raised when tenant is invalid"""
    pass


class SchemaException(Exception):
    """Base exception for schema-related errors"""
    pass


class SchemaNotFound(SchemaException):
    """Raised when schema does not exist"""
    pass


class SchemaCreationError(SchemaException):
    """Raised when schema creation fails"""
    pass
