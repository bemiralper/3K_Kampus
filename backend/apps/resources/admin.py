from django.contrib import admin
from .models import BookType, ResourceBook, ResourceUnit, ResourceTopic, ResourceContent


@admin.register(BookType)
class BookTypeAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'renk', 'ikon', 'sira', 'aktif_mi']
    list_filter = ['aktif_mi']
    search_fields = ['ad', 'kod']
    ordering = ['sira', 'ad']


class ResourceContentInline(admin.TabularInline):
    model = ResourceContent
    extra = 0
    fields = ['ad', 'content_type', 'sira', 'question_count', 'page_start', 'page_end', 'aktif_mi']


class ResourceTopicInline(admin.TabularInline):
    model = ResourceTopic
    extra = 0
    fields = ['ad', 'kod', 'sira', 'aktif_mi']
    show_change_link = True


class ResourceUnitInline(admin.TabularInline):
    model = ResourceUnit
    extra = 0
    fields = ['ad', 'kod', 'sira', 'aktif_mi']
    show_change_link = True


@admin.register(ResourceBook)
class ResourceBookAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'book_type', 'ders', 'sinif_seviyesi', 'yayinevi', 'aktif_mi']
    list_filter = ['book_type', 'ders', 'sinif_seviyesi', 'aktif_mi']
    search_fields = ['ad', 'kod', 'yayinevi', 'yazar']
    inlines = [ResourceUnitInline]
    ordering = ['sira', 'ad']


@admin.register(ResourceUnit)
class ResourceUnitAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'book', 'sira', 'aktif_mi', 'topic_count']
    list_filter = ['book', 'aktif_mi']
    search_fields = ['ad', 'kod']
    inlines = [ResourceTopicInline]
    ordering = ['book', 'sira']


@admin.register(ResourceTopic)
class ResourceTopicAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'unit', 'sira', 'aktif_mi', 'content_count']
    list_filter = ['unit__book', 'aktif_mi']
    search_fields = ['ad', 'kod']
    inlines = [ResourceContentInline]
    ordering = ['unit', 'sira']


@admin.register(ResourceContent)
class ResourceContentAdmin(admin.ModelAdmin):
    list_display = ['ad', 'content_type', 'topic', 'sira', 'question_count', 'page_start', 'page_end', 'aktif_mi']
    list_filter = ['content_type', 'difficulty', 'aktif_mi']
    search_fields = ['ad']
    ordering = ['topic', 'sira']
