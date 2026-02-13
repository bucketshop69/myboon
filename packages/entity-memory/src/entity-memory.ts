import { EntityRepository } from './repositories/entity.repo.js';
import { EventRepository } from './repositories/event.repo.js';
import { RepresentationRepository } from './repositories/representation.repo.js';
import { ResearchRepository } from './repositories/research.repo.js';
import { CacheService } from './services/cache.service.js';
import { EntityService } from './services/entity.service.js';
import { ResearchService } from './services/research.service.js';

export interface EntityMemory {
  repositories: {
    entities: EntityRepository;
    representations: RepresentationRepository;
    events: EventRepository;
    research: ResearchRepository;
  };
  services: {
    entity: EntityService;
    research: ResearchService;
    cache: CacheService;
  };
}

export function createEntityMemory(): EntityMemory {
  const entities = new EntityRepository();
  const representations = new RepresentationRepository();
  const events = new EventRepository();
  const research = new ResearchRepository();

  const entityService = new EntityService(entities, representations, research);
  const researchService = new ResearchService(entities, representations, events, research);
  const cacheService = new CacheService(researchService);

  return {
    repositories: {
      entities,
      representations,
      events,
      research
    },
    services: {
      entity: entityService,
      research: researchService,
      cache: cacheService
    }
  };
}
