import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Actor, UserLink } from "../domain/types.js";

const recordSchema = z.object({
  tenantId: z.string().min(1),
  rocketUserId: z.string().min(1),
  applicationUserId: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  disabled: z.boolean().default(false)
});

const linksSchema = z.array(recordSchema);
const key = (tenantId: string, rocketUserId: string) => `${tenantId}\u0000${rocketUserId}`;

export class FileUserLinkRepository {
  private readonly links = new Map<string, UserLink>();

  public constructor(filePath: string) {
    for (const item of linksSchema.parse(JSON.parse(readFileSync(filePath, "utf8")))) {
      this.links.set(key(item.tenantId, item.rocketUserId), Object.freeze({ ...item, scopes: new Set(item.scopes) }));
    }
  }

  public find(actor: Actor): UserLink | undefined {
    const link = this.links.get(key(actor.tenantId, actor.rocketUserId));
    return link && !link.disabled ? link : undefined;
  }
}

export function hasScopes(link: UserLink | undefined, requiredScopes: readonly string[]): boolean {
  return Boolean(link) && requiredScopes.every((scope) => link.scopes.has(scope));
}
