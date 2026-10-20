# Third-party notices

Our own code is released under the MIT License (`LICENSE`).
The work below was made by others. It keeps its own license and is not code written by this team.

## Third-party file kept in this repository

| File | Origin | License |
|---|---|---|
| `scripts/patches/zcash-devtool-nu7.patch` (arrives with the build scripts) | [Aegis Gate](https://github.com/angelraph/aegis-gate), `patches/zcash-devtool-nu7.patch`, last changed in commit `f1d139a` (5 Oct 2026). Our copy is byte-identical: sha256 `0ea94fe330778a4c129d85ccce5da45af6b129d00250dba38fd840b249584142`, checked against `3e37bef` on 20 Oct 2026. | MIT OR Apache-2.0, as declared in the Aegis Gate README and `Cargo.toml` (that repository has no separate LICENSE file) |

The patch adapts zcash-devtool to Zcash testnet after NU7, where the stock tool fails with `incorrect consensus branch id`.
It modifies zcash-devtool and pins librustzcash, both licensed MIT OR Apache-2.0.

## Fetched or built at setup time (not stored in this repository)

| Component | Version | How it is used | License |
|---|---|---|---|
| [zcash-devtool](https://github.com/zcash/zcash-devtool) | commit `5a26ee8` + the patch above | built into `bin/devtool-aegis` (git-ignored) | MIT OR Apache-2.0 |
| [librustzcash](https://github.com/zcash/librustzcash) | rev `9c5705f` (pinned by the patch) | Rust dependency of zcash-devtool | MIT OR Apache-2.0 |
| [Codec2](https://github.com/drowe67/codec2) | tag `1.2.0` (commit `06d4c11e`) | built from source into `bin/c2enc`, `bin/c2dec` (git-ignored) | LGPL-2.1 |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | system package | invoked as a separate program for local text-to-speech | GPL-3.0 |
| [@grpc/grpc-js](https://github.com/grpc/grpc-node), [@grpc/proto-loader](https://github.com/grpc/grpc-node) | npm | lightwalletd queries in the spike scripts | Apache-2.0 |

No third-party binaries are distributed from this repository: `bin/`, `vendor/` and `node_modules/` are git-ignored.
