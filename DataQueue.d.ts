import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
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
export declare class DataQueue {
  #private;
  add(
    targetId: string,
    value: DataPatchContents['value'],
    index?: DataPatchContents['index']
  ): void;
  clear(): void;
  /**
   * Empties the queue and builds what was in it, to send. Anything queued while the values are built, by a value
   * function, is kept for the next `take`. A value that comes back `undefined`, or throws, is left out, and the rest go.
   */
  take(): DataPatch[];
  /**
   * Builds what is queued, as `take` does, but leaves it queued, for `clear` to empty once it has gone. The older,
   * two-step form of `take`: a patch queued while the values are built is cleared with the rest, unsent.
   */
  transferData(): DataPatch[];
  update(
    targetId: string,
    value: DataPatchContents['value'],
    index?: DataPatchContents['index']
  ): void;
}
export default DataQueue;
