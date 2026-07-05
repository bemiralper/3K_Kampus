"use client";

import {
  MUHASEBE_NAV_ITEMS,
  type MuhasebeNavItemDef,
} from "@/components/muhasebe/muhasebeNavItems";
import { useMenuOrder, useSubmenuOrderMap } from "@/hooks/useMenuOrder";

const MAIN_STORAGE = "muhasebe-sidebar-menu-order";
const SUB_STORAGE = "muhasebe-sidebar-submenu-order";

export function useMuhasebeMenuOrder() {
  const defaultIds = MUHASEBE_NAV_ITEMS.map((i) => i.id);
  const { reorder, getOrdered } = useMenuOrder(MAIN_STORAGE, defaultIds);

  const submenuParents = MUHASEBE_NAV_ITEMS.filter((i) => i.children?.length).map((i) => ({
    id: i.id,
    childIds: i.children!.map((c) => c.id),
  }));

  const { reorderSubmenu, getOrderedChildren } = useSubmenuOrderMap(SUB_STORAGE, submenuParents);

  const getOrderedItems = (): MuhasebeNavItemDef[] => {
    const ordered = getOrdered(MUHASEBE_NAV_ITEMS);
    return ordered.map((item) => {
      if (!item.children?.length) return item;
      return {
        ...item,
        children: getOrderedChildren(item.id, item.children),
      };
    });
  };

  return { reorder, reorderSubmenu, getOrderedItems };
}
