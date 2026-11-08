import { ObjectMap, PlainObject } from '@civ-clone/core-data-object/DataObject';

// Rebuilds a game's data from the `ObjectMap` a `DataObject` serialises to: each object once, and every reference to it
//  the same object again, cycles and all.

export const reconstituteData = ({
  hierarchy,
  objects,
}: ObjectMap): PlainObject => {
  const seenObjects: Map<PlainObject, PlainObject> = new Map();

  const getReferences = (value: any): PlainObject => {
    if (seenObjects.has(value)) {
      return seenObjects.get(value)!;
    }

    if (Array.isArray(value)) {
      const updated: any[] = [];

      seenObjects.set(value, updated);

      value.forEach((value) => {
        // A ref the frontend no longer holds is left out, rather than leaving an `undefined` hole for every consumer
        //  of the list to trip over (civ-clone/web-renderer#46).
        if (value && value['#ref'] && !(value['#ref'] in objects)) {
          console.error(new TypeError(`missing ${value['#ref']}`));

          return;
        }

        updated.push(getReferences(value));
      });

      return updated;
    }

    if (value && value['#ref']) {
      if (!(value['#ref'] in objects)) {
        console.error(new TypeError(`missing ${value['#ref']}`));
      }

      const updated = getReferences(objects[value['#ref']]);

      seenObjects.set(value, updated);

      return updated;
    }

    if (value instanceof Object) {
      const updated: PlainObject = {};

      seenObjects.set(value, updated);

      Object.entries(value).forEach(([key, childValue]) => {
        updated[key] = getReferences(childValue);
      });

      return updated;
    }

    return value;
  };

  seenObjects.clear();

  return getReferences(hierarchy);
};

export default reconstituteData;
