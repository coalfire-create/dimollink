import {
  defaultKeyOf,
  type CollectionPersistence,
  type PersistenceFactory,
} from './json-collection.js';

/**
 * 파일 IO 없는 인메모리 영속화(테스트·시연·휘발성 모드용).
 * JsonCollectionFile 과 동일한 async CollectionPersistence 계약을 만족한다.
 */
export function memoryPersistenceFactory(): PersistenceFactory {
  return <T>(_name: string, keyOf: (item: T) => string = defaultKeyOf): CollectionPersistence<T> => {
    const map = new Map<string, T>();
    return {
      async get(id) {
        return map.get(id);
      },
      async list() {
        return [...map.values()];
      },
      async save(item) {
        map.set(keyOf(item), item);
      },
      async saveAll(items) {
        for (const item of items) map.set(keyOf(item), item);
      },
      async delete(id) {
        map.delete(id);
      },
    };
  };
}
