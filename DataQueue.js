"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _DataQueue_queue;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataQueue = void 0;
class DataQueue {
    constructor() {
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
    // TODO: look at chunking the data transfer
    transferData() {
        return __classPrivateFieldGet(this, _DataQueue_queue, "f")
            .slice(0)
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
_DataQueue_queue = new WeakMap();
exports.default = DataQueue;
//# sourceMappingURL=DataQueue.js.map