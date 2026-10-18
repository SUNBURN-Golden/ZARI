export function extractListing(snapshot: unknown, pageUrl: string): string[];
export function extractProducts(snapshot: unknown, pageUrl: string, now?: number): { items: Record<string, any>[]; error: string | null };
export function categoryHintOf(category: string, name: string): string;
