import type {
  CreateEntityInput,
  CreateRepresentationInput,
  Entity,
  Representation
} from '../types/index.js';
import { EntityRepository } from '../repositories/entity.repo.js';
import { RepresentationRepository } from '../repositories/representation.repo.js';
import { ResearchRepository } from '../repositories/research.repo.js';
import { normalizeSymbol, slugify } from '../utils/ids.js';

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface ResolveEntityResult {
  entity: Entity | null;
  representation?: Representation;
  candidates?: Entity[];
  message?: string;
}

export class EntityService {
  constructor(
    private readonly entities: EntityRepository,
    private readonly representations: RepresentationRepository,
    private readonly research: ResearchRepository
  ) {}

  resolveIdentifier(identifier: string): ResolveEntityResult {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      return { entity: null, message: 'Empty identifier' };
    }

    if (MINT_PATTERN.test(normalizedIdentifier)) {
      const representation = this.representations.findByMint(normalizedIdentifier);
      if (!representation) {
        return { entity: null, message: 'Mint not found in memory' };
      }

      const entity = this.entities.findById(representation.entityId);
      if (!entity) {
        return { entity: null, message: 'Representation exists but entity is missing' };
      }

      return { entity, representation };
    }

    const bySlug = this.entities.findBySlug(slugify(normalizedIdentifier));
    if (bySlug) {
      return { entity: bySlug };
    }

    const bySymbol = this.entities.findBySymbol(normalizedIdentifier);
    if (bySymbol.length === 1) {
      return { entity: bySymbol[0] };
    }
    if (bySymbol.length > 1) {
      const selected = this.selectBestCandidate(bySymbol);
      return {
        entity: selected,
        candidates: bySymbol,
        message: 'Multiple entities found for symbol; selected best candidate automatically'
      };
    }

    const byName = this.entities.searchByName(normalizedIdentifier);
    if (byName.length === 1) {
      return { entity: byName[0] };
    }
    if (byName.length > 1) {
      return {
        entity: byName[0],
        candidates: byName,
        message: 'Multiple entities found by name; returned first match'
      };
    }

    return { entity: null, message: 'Entity not found' };
  }

  createEntity(input: Omit<CreateEntityInput, 'slug'> & { slug?: string }): Entity {
    const requestedSlug = input.slug ?? slugify(input.name);
    const slug = this.ensureUniqueSlug(requestedSlug);
    return this.entities.create({
      ...input,
      slug,
      symbol: normalizeSymbol(input.symbol)
    });
  }

  createUnverifiedEntityFromClaim(params: {
    name: string;
    symbol?: string;
    claimedEntitySlug?: string;
    mint?: string;
    type?: CreateEntityInput['type'];
  }): Entity {
    const suffix = params.mint ? params.mint.slice(0, 6).toLowerCase() : Date.now().toString(36);
    const baseSlug = slugify(`${params.name}-unverified-${suffix}`);
    const slug = this.ensureUniqueSlug(baseSlug);

    return this.createEntity({
      slug,
      name: `${params.name} (unverified)`,
      symbol: params.symbol,
      type: params.type ?? 'meme',
      verified: false,
      metadata: {
        category: ['unverified'],
        tags: ['pending-verification'],
        claimedEntity: params.claimedEntitySlug,
        mint: params.mint
      }
    });
  }

  addRepresentation(input: CreateRepresentationInput): Representation {
    const entity = this.entities.findById(input.entityId);
    if (!entity) {
      throw new Error(`Cannot add representation: entity not found (${input.entityId})`);
    }

    return this.representations.create(input);
  }

  getRepresentations(entityId: string, activeOnly = true): Representation[] {
    return this.representations.findManyByEntityId(entityId, activeOnly);
  }

  searchEntities(filters: Parameters<EntityRepository['search']>[0]): Entity[] {
    return this.entities.search(filters);
  }

  private selectBestCandidate(candidates: Entity[]): Entity {
    const verified = candidates.find((candidate) => candidate.verified);
    if (verified) {
      return verified;
    }

    const ranked = candidates
      .map((candidate) => {
        const latest = this.research.getLatest(candidate.id);
        const liquidity = Number(latest?.findings.metadata.liquidity ?? 0);
        return { candidate, liquidity };
      })
      .sort((a, b) => b.liquidity - a.liquidity);

    return ranked[0]?.candidate ?? candidates[0];
  }

  private ensureUniqueSlug(baseSlug: string): string {
    if (!this.entities.findBySlug(baseSlug)) {
      return baseSlug;
    }

    let index = 2;
    while (this.entities.findBySlug(`${baseSlug}-${index}`)) {
      index += 1;
    }
    return `${baseSlug}-${index}`;
  }
}
