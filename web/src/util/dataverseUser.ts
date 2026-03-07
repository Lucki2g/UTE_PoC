import { getContext } from "@microsoft/power-apps/app";

/** Converts a raw UPN or full name to a git-safe folder slug. */
function toSlug(raw: string): string {
    return raw
        .split("@")[0]                    // strip domain from UPN
        .toLowerCase()
        .replace(/[^a-z0-9.\-_]/g, "-")   // replace unsafe chars
        .replace(/-+/g, "-")              // collapse multiple dashes
        .replace(/^-|-$/g, "");           // strip leading/trailing dash
}

/**
 * Returns a git-safe folder slug for the current logged-in user.
 *
 * Uses the Power Apps Code Apps SDK `getContext()` to retrieve the user's
 * UPN (preferred) or full name. Falls back to "users" when running outside
 * a Power Apps host or when the context is unavailable.
 */
export async function getDataverseUserFolder(): Promise<string> {
    try {
        const ctx = await getContext();
        const upn = ctx?.user?.userPrincipalName;
        const fullName = ctx?.user?.fullName;
        const raw = upn ?? fullName ?? "";
        const slug = toSlug(raw);
        return slug || "users";
    } catch {
        return "users";
    }
}
