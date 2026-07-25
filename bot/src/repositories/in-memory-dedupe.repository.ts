import type { MessageDedupeRepository } from "../domain/ports.js";

export class InMemoryDedupeRepository implements MessageDedupeRepository {
  private readonly items = new Map<string, number>();

  constructor(private readonly ttlMs = 10 * 60_000) {}

  add(messageId: string): boolean {
    const now = Date.now();
    for (const [id, expiresAt] of this.items) {
      if (expiresAt <= now) this.items.delete(id);
    }
    if (this.items.has(messageId)) return false;
    this.items.set(messageId, now + this.ttlMs);
    return true;
  }
}
