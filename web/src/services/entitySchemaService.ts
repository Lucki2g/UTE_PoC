import { api } from "./apiClient.ts";

export interface EntityColumnInfo {
    logicalName: string;
    displayName: string | null;
    dataType: string;
    enumMembers: string[] | null;
}

const columnCache = new Map<string, EntityColumnInfo[]>();

export const entitySchemaService = {
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
    },
};
