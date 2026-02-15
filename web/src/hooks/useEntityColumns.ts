import { useEffect, useState } from "react";
import { entitySchemaService, type EntityColumnInfo } from "../services/entitySchemaService.ts";

export function useEntityColumns(entityName: string) {
    const [columns, setColumns] = useState<EntityColumnInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entityName) {
            setColumns([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        entitySchemaService.getColumns(entityName).then(
            (data) => {
                if (!cancelled) {
                    setColumns(data);
                    setLoading(false);
                }
            },
            (err) => {
                if (!cancelled) {
                    setError(String(err));
                    setLoading(false);
                }
            },
        );

        return () => { cancelled = true; };
    }, [entityName]);

    return { columns, loading, error };
}
