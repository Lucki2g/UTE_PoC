import { api } from "./apiClient.ts";

export interface EntityColumnInfo {
    logicalName: string;
    displayName: string | null;
    dataType: string;
    enumMembers: string[] | null;
    /** For EntityReference columns: the target entity logical name, if known. */
    targetEntity: string | null;
}

const columnCache = new Map<string, EntityColumnInfo[]>();
let entityNamesCache: string[] | null = null;

export const entitySchemaService = {
    async getEntityNames(): Promise<string[]> {
        if (entityNamesCache) return entityNamesCache;
        const names = await api.get<string[]>("/schema/entities");
        entityNamesCache = names;
        return names;
    },

    getCachedEntityNames(): string[] | null {
        return entityNamesCache;
    },

    async getColumns(entityName: string): Promise<EntityColumnInfo[]> {
        const key = entityName.toLowerCase();
        const cached = columnCache.get(key);
        if (cached) return cached;

        const columns = await api.get<EntityColumnInfo[]>(`/schema/entities/${key}/columns`);
        columnCache.set(key, columns);
        return columns;
    },

    getCachedColumns(entityName: string): EntityColumnInfo[] | undefined {
        return columnCache.get(entityName.toLowerCase());
    },

    clearCache() {
        columnCache.clear();
        entityNamesCache = null;
    },
};
