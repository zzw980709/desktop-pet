export {
  discoverPets as discoverCharacters,
  getBuiltInPet as getBuiltInCharacter,
  resolveExternalPetRecord as resolveUserCharacterRecord,
  type ExternalPetRecord as UserCharacterRecord,
} from '../pets/catalog';

export type { PetCatalogEntry as CharacterCatalogEntry } from '../types';
