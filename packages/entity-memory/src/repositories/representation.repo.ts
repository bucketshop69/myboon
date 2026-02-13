import type { CreateRepresentationInput, Representation } from '../types/index.js';
import { createId } from '../utils/ids.js';

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export class RepresentationRepository {
  private readonly representationsById = new Map<string, Representation>();

  create(input: CreateRepresentationInput): Representation {
    this.ensureUniqueness(input);

    const now = Date.now();
    const representation: Representation = {
      id: createId(),
      entityId: input.entityId,
      type: input.type,
      protocol: input.protocol,
      chain: input.chain,
      context: input.context,
      active: input.active ?? true,
      discoveredAt: now,
      lastSeenAt: now
    };

    this.representationsById.set(representation.id, representation);
    return representation;
  }

  findById(id: string): Representation | null {
    return this.representationsById.get(id) ?? null;
  }

  findByMint(mint: string): Representation | null {
    return (
      [...this.representationsById.values()].find(
        (representation) => representation.context.mint === mint
      ) ?? null
    );
  }

  findManyByEntityId(entityId: string, activeOnly = false): Representation[] {
    return [...this.representationsById.values()].filter((representation) => {
      if (representation.entityId !== entityId) {
        return false;
      }
      return activeOnly ? representation.active : true;
    });
  }

  touch(representationId: string): void {
    const representation = this.findById(representationId);
    if (!representation) {
      return;
    }

    this.representationsById.set(representationId, {
      ...representation,
      lastSeenAt: Date.now()
    });
  }

  deactivate(representationId: string): void {
    const representation = this.findById(representationId);
    if (!representation) {
      return;
    }

    this.representationsById.set(representationId, {
      ...representation,
      active: false,
      lastSeenAt: Date.now()
    });
  }

  all(): Representation[] {
    return [...this.representationsById.values()];
  }

  private ensureUniqueness(input: CreateRepresentationInput): void {
    const protocol = normalize(input.protocol);
    const chain = normalize(input.chain);

    for (const existing of this.representationsById.values()) {
      if (existing.type !== input.type) {
        continue;
      }

      const existingProtocol = normalize(existing.protocol);
      const existingChain = normalize(existing.chain);
      if (existingProtocol !== protocol) {
        continue;
      }

      if (input.type === 'spot-token') {
        if (existingChain === chain && existing.context.mint === input.context.mint) {
          throw new Error(
            `Duplicate spot-token representation: protocol=${input.protocol}, chain=${input.chain}, mint=${input.context.mint}`
          );
        }
        continue;
      }

      if (input.type === 'perp-contract') {
        if (existing.context.market === input.context.market) {
          throw new Error(
            `Duplicate perp-contract representation: protocol=${input.protocol}, market=${input.context.market}`
          );
        }
        continue;
      }

      if (input.type === 'lp-pair') {
        if (existing.context.poolAddress === input.context.poolAddress) {
          throw new Error(
            `Duplicate lp-pair representation: protocol=${input.protocol}, poolAddress=${input.context.poolAddress}`
          );
        }
      }
    }
  }
}
