"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _DataQueue_instances, _DataQueue_queue, _DataQueue_build;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQueue = void 0;
/**
 * The patches queued for the other side, sent in the order they were queued.
 *
 * Nothing is merged: two updates to the same object are two patches, and the receiving side applies each in turn. A
 * caller that wants an object sent once a send queues it once.
 */
class DataQueue {
    constructor() {
        _DataQueue_instances.add(this);
        _DataQueue_queue.set(this, []);
    }
    add(targetId, value, index = null) {
        __classPrivateFieldGet(this, _DataQueue_queue, "f").push({
            [targetId]: {
                type: 'add',
                index,
                value,
            },
        });
    }
    clear() {
        __classPrivateFieldGet(this, _DataQueue_queue, "f").splice(0);
    }
    /**
     * Empties the queue and builds what was in it, to send. Anything queued while the values are built, by a value
     * function, is kept for the next `take`. A value that comes back `undefined`, or throws, is left out, and the rest go.
     */
    take() {
        return __classPrivateFieldGet(this, _DataQueue_instances, "m", _DataQueue_build).call(this, __classPrivateFieldGet(this, _DataQueue_queue, "f").splice(0));
    }
    // TODO: look at chunking the data transfer
    /**
     * Builds what is queued, as `take` does, but leaves it queued, for `clear` to empty once it has gone. The older,
     * two-step form of `take`: a patch queued while the values are built is cleared with the rest, unsent.
     */
    transferData() {
        return __classPrivateFieldGet(this, _DataQueue_instances, "m", _DataQueue_build).call(this, __classPrivateFieldGet(this, _DataQueue_queue, "f").slice(0));
    }
    update(targetId, value, index = null) {
        __classPrivateFieldGet(this, _DataQueue_queue, "f").push({
            [targetId]: {
                type: 'update',
                index,
                value,
            },
        });
    }
}
exports.DataQueue = DataQueue;
_DataQueue_queue = new WeakMap(), _DataQueue_instances = new WeakSet(), _DataQueue_build = function _DataQueue_build(queued) {
    return queued
        .map((patch) => {
        const patchData = {};
        Object.entries(patch).forEach(([key, { type, index, value }]) => {
            let built;
            // One that throws is left out, and the rest go: thrown, it stopped the whole patch, and stayed queued, so
            //  every later one threw too and the other side heard nothing more for the rest of the game
            //  (civ-clone/web-renderer#470).
            try {
                built = typeof value === 'function' ? value() : value;
            }
            catch (error) {
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
        });
        return patchData;
    })
        .filter((patchData) => Object.keys(patchData).length > 0);
};
exports.default = DataQueue;
//# sourceMappingURL=DataQueue.js.map