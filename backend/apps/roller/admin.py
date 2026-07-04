"""
Rol Yönetimi Admin Configuration
"""
from django.contrib import admin
from .models import Role, Permission, RolePermission, UserRole


class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 1
    autocomplete_fields = ['permission']


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'module', 'permission_type', 'is_active']
    list_filter = ['module', 'permission_type', 'is_active']
    search_fields = ['code', 'name', 'description']
    ordering = ['module', 'permission_type', 'code']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'level', 'is_system_role', 'is_active']
    list_filter = ['is_system_role', 'is_active']
    search_fields = ['code', 'name', 'description']
    ordering = ['level', 'name']
    inlines = [RolePermissionInline]
    
    def get_readonly_fields(self, request, obj=None):
        if obj and obj.is_system_role:
            return ['code', 'is_system_role']
        return []


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'kurum', 'assigned_at']
    list_filter = ['role', 'kurum']
    search_fields = ['user__username', 'user__email']
    autocomplete_fields = ['user', 'role', 'kurum']
