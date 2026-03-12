import { useEffect, useState } from "react";
import { entitySchemaService } from "../services/entitySchemaService.ts";

export function useEntityNames() {
    const [names, setNames] = useState<string[]>(
        () => entitySchemaService.getCachedEntityNames() ?? [],
    );
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const cached = entitySchemaService.getCachedEntityNames();
        if (cached) {
            setNames(cached);
            return;
        }

        let cancelled = false;
        setLoading(true);

        entitySchemaService.getEntityNames().then(
            (data) => {
                if (!cancelled) {
                    setNames(data);
                    setLoading(false);
                }
            },
            () => {
                if (!cancelled) setLoading(false);
            },
        );

        return () => { cancelled = true; };
    }, []);

    return { names, loading };
}
