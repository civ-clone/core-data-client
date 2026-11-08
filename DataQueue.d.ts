import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
export type DataPatchType = 'add' | 'update';
export type DataPatchContents = {
  type: DataPatchType;
  index: string | null;
  value?: (() => ObjectMap | undefined) | ObjectMap;
};
export type DataPatch = {
  [id: string]: DataPatchContents;
};
export declare class DataQueue {
  #private;
  add(
    targetId: string,
    value: DataPatchContents['value'],
    index?: DataPatchContents['index']
  ): void;
  clear(): void;
  transferData(): DataPatch[];
  update(
    targetId: string,
    value: DataPatchContents['value'],
    index?: DataPatchContents['index']
  ): void;
}
export default DataQueue;
