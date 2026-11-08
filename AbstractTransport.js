"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AbstractTransport_instances, _AbstractTransport_nextId, _AbstractTransport_outstanding, _AbstractTransport_listening, _AbstractTransport_timers, _AbstractTransport_heardFrom, _AbstractTransport_silence, _AbstractTransport_unreported, _AbstractTransport_watch, _AbstractTransport_stopWatching, _AbstractTransport_listen, _AbstractTransport_take, _AbstractTransport_settle;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractTransport = exports.defaultSilenceTimeout = exports.RequestFailed = void 0;
// What a request the other side could not answer rejects with (civ-clone/web-renderer#470).
class RequestFailed extends Error {
    constructor(channel, message) {
        super(message);
        this.name = 'RequestFailed';
        this.channel = channel;
    }
}
exports.RequestFailed = RequestFailed;
// How long the other side can say nothing while a request waits on it before `notAnswering` is called
//  (civ-clone/web-renderer#470). A side busy with a game answers a request once it is free, so one asked while the AI
//  players take their turns waits for them: about a second each late in a big game, and a few times that on a slow
//  device. Nothing is given up on: a reply that comes after this still resolves its request.
exports.defaultSilenceTimeout = 30000;
const realTimers = {
    set: (callback, timeout) => setTimeout(callback, timeout),
    clear: (handle) => clearTimeout(handle),
};
class AbstractTransport {
    constructor({ timers = realTimers } = {}) {
        _AbstractTransport_instances.add(this);
        _AbstractTransport_nextId.set(this, 1);
        // Each request that has been sent and not yet answered or failed, by its id.
        _AbstractTransport_outstanding.set(this, new Map());
        // The channels replies are listened for on, and `requestFailed`: one listener each, for as long as the transport is
        //  in use, so that a reply that answers no waiting request is still heard, and dropped.
        _AbstractTransport_listening.set(this, new Set());
        _AbstractTransport_timers.set(this, void 0);
        // Whether the other side has said anything yet: until it has, it may still be loading, and its silence means nothing.
        _AbstractTransport_heardFrom.set(this, false);
        // The silence being timed, while a request waits that no silence has been reported for.
        _AbstractTransport_silence.set(this, undefined);
        __classPrivateFieldSet(this, _AbstractTransport_timers, timers, "f");
    }
    // How many requests are waiting for their replies.
    get outstanding() {
        return __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").size;
    }
    // Each request is sent with an id of its own, which the reply echoes, so any number can be waiting on one channel at
    //  once and each gets its own reply, in whatever order they come (civ-clone/web-renderer#324, #470).
    //
    // A request the other side could not answer is answered with a `requestFailed` with its id, which rejects it, and
    //  `requestRejected` is called. A request waits for its reply however long it takes, but when the other side has
    //  said nothing at all for `defaultSilenceTimeout` while one waits, `notAnswering` is called, once for each silence,
    //  and no more than once for each request.
    request(request) {
        var _a, _b;
        const channel = request.channel(), id = (__classPrivateFieldSet(this, _AbstractTransport_nextId, (_b = __classPrivateFieldGet(this, _AbstractTransport_nextId, "f"), _a = _b++, _b), "f"), _a);
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_listen).call(this, channel);
        return new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").set(id, { channel, resolve, reject, reported: false });
            try {
                this.post(channel, request.args()[0], id);
            }
            catch (error) {
                __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_settle).call(this, id);
                reject(error);
                return;
            }
            __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_watch).call(this);
        });
    }
    reply(channel, data, id) {
        this.post(channel, data, id);
    }
    send(channel, data) {
        this.post(channel, data);
    }
    // The other side has sent a message, of any kind, so it is still there. Called by the transport for each one.
    heard() {
        __classPrivateFieldSet(this, _AbstractTransport_heardFrom, true, "f");
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_stopWatching).call(this);
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_watch).call(this);
    }
    // A request the other side could not answer has rejected with `error`. Here for a transport to tell someone.
    requestRejected(error) { }
    // The other side has said nothing for `defaultSilenceTimeout` while requests on `channels` wait on it. Here for a
    //  transport to tell someone.
    notAnswering(channels) { }
}
exports.AbstractTransport = AbstractTransport;
_AbstractTransport_nextId = new WeakMap(), _AbstractTransport_outstanding = new WeakMap(), _AbstractTransport_listening = new WeakMap(), _AbstractTransport_timers = new WeakMap(), _AbstractTransport_heardFrom = new WeakMap(), _AbstractTransport_silence = new WeakMap(), _AbstractTransport_instances = new WeakSet(), _AbstractTransport_unreported = function _AbstractTransport_unreported() {
    return [...__classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").values()].filter(({ reported }) => !reported);
}, _AbstractTransport_watch = function _AbstractTransport_watch() {
    if (!__classPrivateFieldGet(this, _AbstractTransport_heardFrom, "f") ||
        __classPrivateFieldGet(this, _AbstractTransport_silence, "f") !== undefined ||
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_unreported).call(this).length === 0) {
        return;
    }
    __classPrivateFieldSet(this, _AbstractTransport_silence, __classPrivateFieldGet(this, _AbstractTransport_timers, "f").set(() => {
        __classPrivateFieldSet(this, _AbstractTransport_silence, undefined, "f");
        const unreported = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_unreported).call(this);
        if (unreported.length === 0) {
            return;
        }
        unreported.forEach((outstanding) => (outstanding.reported = true));
        const channels = [...new Set(unreported.map(({ channel }) => channel))];
        console.warn(`The other side has said nothing for ${exports.defaultSilenceTimeout / 1000} seconds while requests on ${channels
            .map((channel) => `"${channel}"`)
            .join(', ')} wait for it.`);
        this.notAnswering(channels);
    }, exports.defaultSilenceTimeout), "f");
}, _AbstractTransport_stopWatching = function _AbstractTransport_stopWatching() {
    if (__classPrivateFieldGet(this, _AbstractTransport_silence, "f") === undefined) {
        return;
    }
    __classPrivateFieldGet(this, _AbstractTransport_timers, "f").clear(__classPrivateFieldGet(this, _AbstractTransport_silence, "f"));
    __classPrivateFieldSet(this, _AbstractTransport_silence, undefined, "f");
}, _AbstractTransport_listen = function _AbstractTransport_listen(channel) {
    if (!__classPrivateFieldGet(this, _AbstractTransport_listening, "f").has('requestFailed')) {
        __classPrivateFieldGet(this, _AbstractTransport_listening, "f").add('requestFailed');
        this.receive('requestFailed', (failure) => {
            const outstanding = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_take).call(this, failure === null || failure === void 0 ? void 0 : failure.channel, failure === null || failure === void 0 ? void 0 : failure.id, 'requestFailed');
            if (!outstanding) {
                return;
            }
            const error = new RequestFailed(failure.channel, failure.message);
            outstanding.reject(error);
            this.requestRejected(error);
        });
    }
    if (__classPrivateFieldGet(this, _AbstractTransport_listening, "f").has(channel)) {
        return;
    }
    __classPrivateFieldGet(this, _AbstractTransport_listening, "f").add(channel);
    this.receive(channel, (value, { id } = {}) => {
        var _a;
        // Without an id it is no reply.
        if (id === undefined) {
            return;
        }
        (_a = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_take).call(this, String(channel), id, 'reply')) === null || _a === void 0 ? void 0 : _a.resolve(value);
    });
}, _AbstractTransport_take = function _AbstractTransport_take(channel, id, what) {
    const outstanding = id === undefined ? undefined : __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").get(id);
    if (!outstanding || outstanding.channel !== channel) {
        console.warn(`Dropped a ${what} on "${channel}" for request ${id}, which is not waiting.`);
        return undefined;
    }
    return __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_settle).call(this, id);
}, _AbstractTransport_settle = function _AbstractTransport_settle(id) {
    const outstanding = __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").get(id);
    if (!outstanding) {
        return undefined;
    }
    __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").delete(id);
    if (__classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_unreported).call(this).length === 0) {
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_stopWatching).call(this);
    }
    return outstanding;
};
exports.default = AbstractTransport;
//# sourceMappingURL=AbstractTransport.js.map