"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconstituteData = void 0;
// Rebuilds a game's data from the `ObjectMap` a `DataObject` serialises to: each object once, and every reference to it
//  the same object again, cycles and all.
//
// A reference to an object that isn't in `objects` is dropped from a list, rather than leaving an `undefined` hole for
//  every consumer of the list to trip over (civ-clone/web-renderer#46). On an object its key stays, as `undefined`: the
//  object keeps the keys it was sent with, whichever of them can be filled in yet, which is what a side that rebuilds
//  as the data arrives does too (civ-clone/web-renderer#877). Each missing id is reported once, with a `TypeError`.
const reconstituteData = ({ hierarchy, objects, }) => {
    const seenObjects = new Map(), reported = new Set();
    // Whether `value` refers to an object that isn't there, said once for each id.
    const missing = (value) => {
        if (!value || !value['#ref'] || value['#ref'] in objects) {
            return false;
        }
        if (!reported.has(value['#ref'])) {
            reported.add(value['#ref']);
            console.error(new TypeError(`missing ${value['#ref']}`));
        }
        return true;
    };
    const getReferences = (value) => {
        if (seenObjects.has(value)) {
            return seenObjects.get(value);
        }
        if (Array.isArray(value)) {
            const updated = [];
            seenObjects.set(value, updated);
            value.forEach((value) => {
                if (missing(value)) {
                    return;
                }
                updated.push(getReferences(value));
            });
            return updated;
        }
        if (value && value['#ref']) {
            // A missing one rebuilds to `undefined`, which is not remembered as what it refers to.
            if (missing(value)) {
                return undefined;
            }
            const updated = getReferences(objects[value['#ref']]);
            seenObjects.set(value, updated);
            return updated;
        }
        if (value instanceof Object) {
            const updated = {};
            seenObjects.set(value, updated);
            Object.entries(value).forEach(([key, childValue]) => {
                updated[key] = getReferences(childValue);
            });
            return updated;
        }
        return value;
    };
    return getReferences(hierarchy);
};
exports.reconstituteData = reconstituteData;
exports.default = exports.reconstituteData;
//# sourceMappingURL=reconstituteData.js.map