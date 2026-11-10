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
var _AbstractTransport_instances, _AbstractTransport_nextId, _AbstractTransport_outstanding, _AbstractTransport_listening, _AbstractTransport_disposers, _AbstractTransport_timers, _AbstractTransport_silenceTimeout, _AbstractTransport_heardFrom, _AbstractTransport_silence, _AbstractTransport_disposed, _AbstractTransport_unreported, _AbstractTransport_watch, _AbstractTransport_stopWatching, _AbstractTransport_listen, _AbstractTransport_take, _AbstractTransport_settle;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractTransport = exports.disposedMessage = exports.startingSilenceFactor = exports.defaultSilenceTimeout = exports.RequestFailed = void 0;
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
// How many times longer the other side is given before it has said anything at all: it may still be loading, on a slow
//  connection, and that is no reason to say it has stopped answering (civ-clone/web-renderer#871).
exports.startingSilenceFactor = 4;
// What a request rejects with when its transport is disposed of while it waits, or is used after that.
exports.disposedMessage = 'The transport is no longer in use.';
const realTimers = {
    set: (callback, timeout) => setTimeout(callback, timeout),
    clear: (handle) => clearTimeout(handle),
};
class AbstractTransport {
    constructor({ timers = realTimers, silenceTimeout = exports.defaultSilenceTimeout, } = {}) {
        _AbstractTransport_instances.add(this);
        _AbstractTransport_nextId.set(this, 1);
        // Each request that has been sent and not yet answered or failed, by its id.
        _AbstractTransport_outstanding.set(this, new Map());
        // The channels replies are listened for on, and `requestFailed`: one listener each, for as long as the transport is
        //  in use, so that a reply that answers no waiting request is still heard, and dropped.
        _AbstractTransport_listening.set(this, new Set());
        // What stops each of those listeners, for `dispose`.
        _AbstractTransport_disposers.set(this, []);
        _AbstractTransport_timers.set(this, void 0);
        _AbstractTransport_silenceTimeout.set(this, void 0);
        // Whether the other side has said anything yet. Its silence is timed either way, from the first request
        //  (civ-clone/web-renderer#871): one that never starts says nothing, and is the one most worth hearing about. Until
        //  it has spoken it is given `startingSilenceFactor` times as long.
        _AbstractTransport_heardFrom.set(this, false);
        // The silence being timed, while a request waits that no silence has been reported for.
        _AbstractTransport_silence.set(this, undefined);
        _AbstractTransport_disposed.set(this, false);
        __classPrivateFieldSet(this, _AbstractTransport_timers, timers, "f");
        __classPrivateFieldSet(this, _AbstractTransport_silenceTimeout, silenceTimeout, "f");
    }
    // How many requests are waiting for their replies.
    get outstanding() {
        return __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").size;
    }
    // Whether the other side has sent anything yet. Until it has, an error from it means it never started.
    get heardFrom() {
        return __classPrivateFieldGet(this, _AbstractTransport_heardFrom, "f");
    }
    // Each request is sent with an id of its own, which the reply echoes, so any number can be waiting on one channel at
    //  once and each gets its own reply, in whatever order they come (civ-clone/web-renderer#324, #470).
    //
    // A request the other side could not answer is answered with a `requestFailed` with its id, which rejects it, and
    //  `requestRejected` is called. A request waits for its reply however long it takes, but when the other side has
    //  said nothing at all for the silence timeout while one waits, `notAnswering` is called, once for each silence,
    //  and no more than once for each request.
    //
    // It resolves with what the request says it returns (civ-clone/web-renderer#872). A message carries one piece of
    //  data, so a request carries one argument at most: one made with more is rejected rather than sent short.
    request(request) {
        var _a, _b;
        const channel = request.channel(), args = request.args();
        if (__classPrivateFieldGet(this, _AbstractTransport_disposed, "f")) {
            return Promise.reject(new RequestFailed(channel, exports.disposedMessage));
        }
        if (args.length > 1) {
            return Promise.reject(new TypeError(`A request carries one argument, and the one on "${channel}" has ${args.length}: put them in one object.`));
        }
        const id = (__classPrivateFieldSet(this, _AbstractTransport_nextId, (_b = __classPrivateFieldGet(this, _AbstractTransport_nextId, "f"), _a = _b++, _b), "f"), _a);
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_listen).call(this, channel);
        return new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").set(id, { channel, resolve, reject, reported: false });
            try {
                this.post(channel, args[0], id);
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
    /**
     * Ends the transport's use (civ-clone/web-renderer#871): each request still waiting is rejected, the silence is no
     * longer timed, and the listeners for replies are removed. A request made after this is rejected too. A transport
     * that listens to anything of its own stops that in its own `dispose`, and calls this.
     */
    dispose() {
        if (__classPrivateFieldGet(this, _AbstractTransport_disposed, "f")) {
            return;
        }
        __classPrivateFieldSet(this, _AbstractTransport_disposed, true, "f");
        this.failAll(exports.disposedMessage);
        __classPrivateFieldGet(this, _AbstractTransport_disposers, "f").splice(0).forEach((dispose) => dispose());
        __classPrivateFieldGet(this, _AbstractTransport_listening, "f").clear();
    }
    // Rejects every request that waits, with `message`: for a transport that learns the other side has gone, or never
    //  started. `requestRejected` is not called for them: the transport that calls this already knows. A reply that
    //  comes for one of them after all is dropped, with a warning, as any reply to no waiting request is.
    failAll(message) {
        const outstanding = [...__classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").values()];
        __classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").clear();
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_stopWatching).call(this);
        outstanding.forEach(({ channel, reject }) => reject(new RequestFailed(channel, message)));
    }
    // The other side has sent a message, of any kind, so it is still there. Called by the transport for each one.
    heard() {
        if (__classPrivateFieldGet(this, _AbstractTransport_disposed, "f")) {
            return;
        }
        __classPrivateFieldSet(this, _AbstractTransport_heardFrom, true, "f");
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_stopWatching).call(this);
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_watch).call(this);
    }
    // A request the other side could not answer has rejected with `error`. Here for a transport to tell someone.
    requestRejected(error) { }
    // The other side has said nothing for the silence timeout while requests on `channels` wait on it. Here for a
    //  transport to tell someone.
    notAnswering(channels) { }
}
exports.AbstractTransport = AbstractTransport;
_AbstractTransport_nextId = new WeakMap(), _AbstractTransport_outstanding = new WeakMap(), _AbstractTransport_listening = new WeakMap(), _AbstractTransport_disposers = new WeakMap(), _AbstractTransport_timers = new WeakMap(), _AbstractTransport_silenceTimeout = new WeakMap(), _AbstractTransport_heardFrom = new WeakMap(), _AbstractTransport_silence = new WeakMap(), _AbstractTransport_disposed = new WeakMap(), _AbstractTransport_instances = new WeakSet(), _AbstractTransport_unreported = function _AbstractTransport_unreported() {
    return [...__classPrivateFieldGet(this, _AbstractTransport_outstanding, "f").values()].filter(({ reported }) => !reported);
}, _AbstractTransport_watch = function _AbstractTransport_watch() {
    if (__classPrivateFieldGet(this, _AbstractTransport_silenceTimeout, "f") === null ||
        __classPrivateFieldGet(this, _AbstractTransport_silence, "f") !== undefined ||
        __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_unreported).call(this).length === 0) {
        return;
    }
    const timeout = __classPrivateFieldGet(this, _AbstractTransport_silenceTimeout, "f") * (__classPrivateFieldGet(this, _AbstractTransport_heardFrom, "f") ? 1 : exports.startingSilenceFactor);
    __classPrivateFieldSet(this, _AbstractTransport_silence, __classPrivateFieldGet(this, _AbstractTransport_timers, "f").set(() => {
        __classPrivateFieldSet(this, _AbstractTransport_silence, undefined, "f");
        const unreported = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_unreported).call(this);
        if (unreported.length === 0) {
            return;
        }
        unreported.forEach((outstanding) => (outstanding.reported = true));
        const channels = [...new Set(unreported.map(({ channel }) => channel))];
        console.warn(`The other side has said nothing for ${timeout / 1000} seconds while requests on ${channels
            .map((channel) => `"${channel}"`)
            .join(', ')} wait for it.`);
        this.notAnswering(channels);
    }, timeout), "f");
}, _AbstractTransport_stopWatching = function _AbstractTransport_stopWatching() {
    if (__classPrivateFieldGet(this, _AbstractTransport_silence, "f") === undefined) {
        return;
    }
    __classPrivateFieldGet(this, _AbstractTransport_timers, "f").clear(__classPrivateFieldGet(this, _AbstractTransport_silence, "f"));
    __classPrivateFieldSet(this, _AbstractTransport_silence, undefined, "f");
}, _AbstractTransport_listen = function _AbstractTransport_listen(channel) {
    if (!__classPrivateFieldGet(this, _AbstractTransport_listening, "f").has('requestFailed')) {
        __classPrivateFieldGet(this, _AbstractTransport_listening, "f").add('requestFailed');
        __classPrivateFieldGet(this, _AbstractTransport_disposers, "f").push(this.receive('requestFailed', (failure) => {
            const outstanding = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_take).call(this, failure === null || failure === void 0 ? void 0 : failure.channel, failure === null || failure === void 0 ? void 0 : failure.id, 'requestFailed');
            if (!outstanding) {
                return;
            }
            const error = new RequestFailed(failure.channel, failure.message);
            outstanding.reject(error);
            this.requestRejected(error);
        }));
    }
    if (__classPrivateFieldGet(this, _AbstractTransport_listening, "f").has(channel)) {
        return;
    }
    __classPrivateFieldGet(this, _AbstractTransport_listening, "f").add(channel);
    __classPrivateFieldGet(this, _AbstractTransport_disposers, "f").push(this.receive(channel, (value, { id } = {}) => {
        var _a;
        // Without an id it is no reply.
        if (id === undefined) {
            return;
        }
        (_a = __classPrivateFieldGet(this, _AbstractTransport_instances, "m", _AbstractTransport_take).call(this, String(channel), id, 'reply')) === null || _a === void 0 ? void 0 : _a.resolve(value);
    }));
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