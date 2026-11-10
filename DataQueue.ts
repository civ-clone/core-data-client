import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

// The changes to a game's data objects that one side has queued for the other, by id: each is a whole object added, or
//  an update to it (at `index`, a key path into it, or the whole of it). The value can be a function, built when the
//  queue is sent, from the game as it is then; one that comes back `undefined` is left out, as unchanged.

export type DataPatchType = 'add' | 'update';

/**
 * One change to the object with the patch's id.
 *
 * `index` is where in that object `value` goes: `null` for the whole object, which the value is, or else a key path
 * into the object as the receiving side holds it, keys separated by `.` and list positions in brackets (`tiles[12]`,
 * `research.complete`). The queue only carries it, unchanged. Applying a patch, `add` or `update`, at its `index` or as
 * the whole object, is the receiving side's job: nothing here reads the path.
 */
export type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  value?: (() => ObjectMap | undefined) | ObjectMap;
};

export type DataPatch = {
  [id: string]: DataPatchContents;
};

/**
 * The patches queued for the other side, sent in the order they were queued.
 *
 * Nothing is merged: two updates to the same object are two patches, and the receiving side applies each in turn. A
 * caller that wants an object sent once a send queues it once.
 */
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

  /**
   * Empties the queue and builds what was in it, to send. Anything queued while the values are built, by a value
   * function, is kept for the next `take`. A value that comes back `undefined`, or throws, is left out, and the rest go.
   */
  take(): DataPatch[] {
    return this.#build(this.#queue.splice(0));
  }

  // TODO: look at chunking the data transfer

  /**
   * Builds what is queued, as `take` does, but leaves it queued, for `clear` to empty once it has gone. The older,
   * two-step form of `take`: a patch queued while the values are built is cleared with the rest, unsent.
   */
  transferData(): DataPatch[] {
    return this.#build(this.#queue.slice(0));
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

  #build(queued: DataPatch[]): DataPatch[] {
    return queued
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
}

export default DataQueue;
