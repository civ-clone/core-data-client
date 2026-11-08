# core-data-client

How a game talks to a client that isn't in the same process: a game running in a web worker and the page that shows it, say. It knows nothing about which channels there are or what crosses them; the game that uses it names those.

- **`Transport`**: the contract both ends keep. Named channels, each with what is sent on it and what is received (`TransportData`, collected in a `TransportDataMap`), `send` and `receive` on them, and `request` and `reply` for a question and its answer.
- **`Request`**: a question asked on a channel, with its arguments and, as types, what it is answered with (`RequestArgs`, `RequestReturn`).
- **`AbstractTransport`**: the part of a transport that doesn't depend on how messages travel. Each request gets an id of its own, which its reply echoes, so any number can wait on one channel and each gets its own answer, in any order. A `requestFailed` with a request's id rejects it with a `RequestFailed`. When the other side has said nothing for `defaultSilenceTimeout` while requests wait, `notAnswering` is called, once for each silence. A subclass says how messages are posted (`post`) and heard (`receive`, calling `heard()`).
- **`DataQueue`**: the changes to a game's `DataObject`s queued for the other side, sent as `DataPatch`es. A value can be a function, built when the queue is sent; one that comes back `undefined`, or throws, is left out and the rest are sent.
- **`reconstituteData`**: rebuilds a `DataObject`'s `ObjectMap` (from `@civ-clone/core-data-object`) on the other side, with every reference to an object the same object again, cycles included.

civ.one's web renderer (civ-clone/web-renderer) is built on it: its worker and page each extend `AbstractTransport` over `postMessage`, and name their channels in a `TransportDataMap` of their own.
