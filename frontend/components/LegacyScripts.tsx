"use client";

import { useEffect } from "react";

export default function LegacyScripts() {
  useEffect(() => {
    const toggleSidebar = () => {
      const sidebar = document.getElementById("appSidebar");
      const container = document.querySelector(".app-container");
      if (!sidebar || !container) return;
      sidebar.classList.toggle("sidebar-closed");
      container.classList.toggle("sidebar-closed");
      const isClosed = sidebar.classList.contains("sidebar-closed");
      localStorage.setItem("sidebarClosed", String(isClosed));
      if (isClosed) {
        document.querySelectorAll(".menu-item").forEach((item) => item.classList.remove("open"));
      }
    };

    const toggleSubmenu = (event: Event, element: Element) => {
      event.preventDefault();
      const menuItem = element.closest(".menu-item");
      if (!menuItem) return;
      const menuItems = document.querySelectorAll(".menu-item");
      menuItems.forEach((item) => {
        if (item !== menuItem) item.classList.remove("open");
      });
      menuItem.classList.toggle("open");
      const index = Array.from(menuItems).indexOf(menuItem);
      if (index >= 0) localStorage.setItem("lastOpenMenu", String(index));
    };

    const toggleMegaMenu = () => {
      const menu = document.getElementById("megaMenuDropdown");
      if (menu) menu.classList.toggle("show");
    };

    const toggleNotifications = () => {
      const panel = document.getElementById("notificationDropdown");
      if (panel) panel.classList.toggle("show");
    };

    const toggleUserMenu = () => {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.toggle("show");
    };

    const openSearchModal = () => {
      const modal = document.getElementById("searchModal");
      if (modal) modal.classList.add("show");
    };

    const closeSearchModal = () => {
      const modal = document.getElementById("searchModal");
      if (modal) modal.classList.remove("show");
    };

    const toggleMobileSidebar = () => {
      const sidebar = document.getElementById("appSidebar");
      const overlay = document.querySelector(".sidebar-overlay");
      if (!sidebar || !overlay) return;
      sidebar.classList.toggle("mobile-open");
      overlay.classList.toggle("show");
    };

    const showTab = (tabId: string) => {
      const panels = document.querySelectorAll(".tab-panel");
      panels.forEach((panel) => panel.classList.remove("active"));
      const targetPanel = document.getElementById(`tab-${tabId}`);
      if (targetPanel) targetPanel.classList.add("active");

      const statBoxes = document.querySelectorAll(".stat-box");
      statBoxes.forEach((box) => box.classList.remove("active"));
      const targetStat = document.getElementById(`stat-${tabId}`);
      if (targetStat) targetStat.classList.add("active");
    };

    const restoreSidebarState = () => {
      const sidebar = document.getElementById("appSidebar");
      const container = document.querySelector(".app-container");
      if (!sidebar || !container) return;
      const sidebarClosed = localStorage.getItem("sidebarClosed");
      if (sidebarClosed === null || sidebarClosed === "true") {
        sidebar.classList.add("sidebar-closed");
        container.classList.add("sidebar-closed");
      } else {
        sidebar.classList.remove("sidebar-closed");
        container.classList.remove("sidebar-closed");
      }
    };

    const restoreLastOpenMenu = () => {
      const lastOpenMenuIndex = localStorage.getItem("lastOpenMenu");
      if (lastOpenMenuIndex === null) return;
      const menuItems = document.querySelectorAll(".menu-item");
      const target = menuItems[Number(lastOpenMenuIndex)];
      if (target) target.classList.add("open");
    };

    const onSidebarMouseEnter = () => {
      restoreLastOpenMenu();
    };

    const onSidebarMouseLeave = () => {
      const sidebar = document.getElementById("appSidebar");
      if (!sidebar || !sidebar.classList.contains("sidebar-closed")) return;
      document.querySelectorAll(".menu-item").forEach((item) => item.classList.remove("open"));
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const megaMenu = document.getElementById("megaMenuDropdown");
      const userDropdown = document.getElementById("userDropdown");
      if (megaMenu && !megaMenu.contains(target) && !target.closest(".header-mega-menu-btn")) {
        megaMenu.classList.remove("show");
      }
      if (userDropdown && !userDropdown.contains(target) && !target.closest(".header-user-menu")) {
        userDropdown.classList.remove("show");
      }
    };

    const onOverlayClick = () => {
      const sidebar = document.getElementById("appSidebar");
      const overlay = document.querySelector(".sidebar-overlay");
      if (!sidebar || !overlay) return;
      sidebar.classList.remove("mobile-open");
      overlay.classList.remove("show");
    };

    restoreSidebarState();

    const sidebar = document.getElementById("appSidebar");
    if (sidebar) {
      sidebar.addEventListener("mouseenter", onSidebarMouseEnter);
      sidebar.addEventListener("mouseleave", onSidebarMouseLeave);
    }

    const overlay = document.querySelector(".sidebar-overlay");
    if (overlay) overlay.addEventListener("click", onOverlayClick);

    document.addEventListener("click", onDocumentClick);

    Object.assign(window, {
      toggleSidebar,
      toggleSubmenu,
      toggleMegaMenu,
      toggleNotifications,
      toggleUserMenu,
      openSearchModal,
      closeSearchModal,
      toggleMobileSidebar,
      showTab,
    });

    return () => {
      document.removeEventListener("click", onDocumentClick);
      if (sidebar) {
        sidebar.removeEventListener("mouseenter", onSidebarMouseEnter);
        sidebar.removeEventListener("mouseleave", onSidebarMouseLeave);
      }
      if (overlay) overlay.removeEventListener("click", onOverlayClick);
      Object.assign(window, {
        toggleSidebar: undefined,
        toggleSubmenu: undefined,
        toggleMegaMenu: undefined,
        toggleNotifications: undefined,
        toggleUserMenu: undefined,
        openSearchModal: undefined,
        closeSearchModal: undefined,
        toggleMobileSidebar: undefined,
        showTab: undefined,
      });
    };
  }, []);

  return null;
}
