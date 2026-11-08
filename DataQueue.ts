import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

// The changes to a game's data objects that one side has queued for the other, by id: each is a whole object added, or
//  an update to it (at `index`, a key path into it, or the whole of it). The value can be a function, built when the
//  queue is sent, from the game as it is then; one that comes back `undefined` is left out, as unchanged.

export type DataPatchType = 'add' | 'update';

export type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  value?: (() => ObjectMap | undefined) | ObjectMap;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};

export class DataQueue {
  #queue: DataPatch[] = [];

  add(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'add' as DataPatchType,
        index,
        value,
      },
    });
  }

  clear(): void {
    this.#queue.splice(0);
  }

  // TODO: look at chunking the data transfer
  transferData(): DataPatch[] {
    return this.#queue
      .slice(0)
      .map((patch) => {
        const patchData: DataPatch = {};

        Object.entries(patch).forEach(
          ([key, { type, index, value }]: [string, DataPatchContents]) => {
            let built;

            // One that throws is left out, and the rest go: thrown, it stopped the whole patch, and stayed queued, so
            //  every later one threw too and the other side heard nothing more for the rest of the game
            //  (civ-clone/web-renderer#470).
            try {
              built = typeof value === 'function' ? value() : value;
            } catch (error) {
              console.error(error);

              return;
            }

            if (built === undefined) {
              return;
            }

            patchData[key] = {
              type,
              index,
              value: built,
            };
          }
        );

        return patchData;
      })
      .filter((patchData) => Object.keys(patchData).length > 0);
  }

  update(
    targetId: string,
    value: DataPatchContents['value'],
    index: DataPatchContents['index'] = null
  ): void {
    this.#queue.push({
      [targetId]: {
        type: 'update' as DataPatchType,
        index,
        value,
      },
    });
  }
}

export default DataQueue;
