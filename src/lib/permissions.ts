import type { AccessArea, AccessAction } from "../config/access-areas";
import { ACCESS_AREAS, DEFAULT_ACCESS_ACTION } from "../config/access-areas";
import type { PageId } from "../config/page-map";

export type PermissionMap = Record<PageId, AccessAction[]>;
export type ResolvedPermissions = "all" | PermissionMap;

export const ACCESS_AREA_MAP: Record<PageId, AccessArea> = ACCESS_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = area;
    return acc;
  },
  {} as Record<PageId, AccessArea>,
);

export function normalizePermissions(raw: unknown): ResolvedPermissions {
  if (!raw || (typeof raw === "string" && raw.toLowerCase() === "all")) {
    return "all";
  }

  if (typeof raw === "object") {
    if (Array.isArray(raw)) {
      if (raw.length === 1 && typeof raw[0] === "string" && raw[0].toLowerCase() === "all") {
        return "all";
      }
      const map: Partial<PermissionMap> = {};
      raw.forEach((areaId) => {
        if (typeof areaId === "string" && (ACCESS_AREA_MAP as any)[areaId]) {
          map[areaId as PageId] = [DEFAULT_ACCESS_ACTION];
        }
      });
      return map as PermissionMap;
    }

    const map: Partial<PermissionMap> = {};
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      if (!(ACCESS_AREA_MAP as any)[key]) {
        return;
      }
      if (Array.isArray(value)) {
        const filtered = value.filter((action) =>
          ACCESS_AREA_MAP[key as PageId]?.actions.includes(action as AccessAction),
        ) as AccessAction[];
        if (filtered.length > 0) {
          map[key as PageId] = filtered;
        }
      }
    });
    return map as PermissionMap;
  }

  return {} as PermissionMap;
}

export function hasPermission(
  permissions: ResolvedPermissions,
  areaId: PageId,
  action: AccessAction = DEFAULT_ACCESS_ACTION,
) {
  if (permissions === "all") return true;
  const area = permissions[areaId];
  if (!area) return false;
  return area.includes(action);
}

export function mergePermission(
  permissions: PermissionMap,
  areaId: PageId,
  action: AccessAction,
) {
  const allowedActions = ACCESS_AREA_MAP[areaId]?.actions ?? [];
  if (!allowedActions.includes(action)) return permissions;

  const current = permissions[areaId] ?? [];
  if (current.includes(action)) return permissions;

  return {
    ...permissions,
    [areaId]: [...current, action].sort(sortActions(areaId)),
  };
}

export function removePermission(
  permissions: PermissionMap,
  areaId: PageId,
  action?: AccessAction,
) {
  if (!(areaId in permissions)) return permissions;
  if (!action) {
    const { [areaId]: _removed, ...rest } = permissions;
    return rest;
  }

  const remaining = permissions[areaId].filter((item) => item !== action);
  if (remaining.length === 0) {
    const { [areaId]: _removed, ...rest } = permissions;
    return rest;
  }

  return {
    ...permissions,
    [areaId]: remaining,
  };
}

const sortActions =
  (areaId: PageId) =>
  (a: AccessAction, b: AccessAction) => {
    const order = ACCESS_AREA_MAP[areaId]?.actions ?? [];
    return order.indexOf(a) - order.indexOf(b);
  };

export function permissionSummary(permissions: ResolvedPermissions, maxAreas = 3) {
  if (permissions === "all") return "All system access";
  const entries = Object.entries(permissions);
  if (entries.length === 0) return "No access assigned";

  const lines = entries.slice(0, maxAreas).map(([areaId, actions]) => {
    const label = ACCESS_AREA_MAP[areaId as PageId]?.label ?? areaId;
    const actionLabel =
      actions.length >= (ACCESS_AREA_MAP[areaId as PageId]?.actions.length ?? 0)
        ? "All actions"
        : actions.join(", ");
    return `${label}: ${actionLabel}`;
  });

  if (entries.length > maxAreas) {
    lines.push(`+${entries.length - maxAreas} more`);
  }

  return lines.join(" • ");
}


