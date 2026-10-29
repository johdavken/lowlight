/** A model's short label: OpenRouter's name without its `Provider: ` prefix, else the id after `/`. */
export function modelLabel(id: string, name?: string): string {
  if (name && name.trim()) return name.replace(/^[^:]*:\s*/, '').trim() || name.trim();
  return id.slice(id.lastIndexOf('/') + 1);
}
