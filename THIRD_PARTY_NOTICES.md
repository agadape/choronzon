# Third-party notices

Our own code is released under the MIT License (`LICENSE`).
The work below was made by others. It keeps its own license and is not code written by this team.

## Third-party file kept in this repository

| File | Origin | License |
|---|---|---|
| `scripts/patches/zcash-devtool-nu7.patch` (arrives with the build scripts) | [Aegis Gate](https://github.com/angelraph/aegis-gate), `patches/zcash-devtool-nu7.patch`, last changed in commit `f1d139a` (5 Oct 2026). Our copy is byte-identical: sha256 `0ea94fe330778a4c129d85ccce5da45af6b129d00250dba38fd840b249584142`, checked against `3e37bef` on 20 Oct 2026. | MIT OR Apache-2.0, as declared in the Aegis Gate README and `Cargo.toml` (that repository has no separate LICENSE file) |

The patch adapts zcash-devtool to Zcash testnet after NU7, where the stock tool fails with `incorrect consensus branch id`.
It modifies zcash-devtool and pins librustzcash, both licensed MIT OR Apache-2.0.

## Vendored for the web page (stored in this repository, served from our own origin; the page makes no request to any other host)

| File(s) | Origin | sha256 of our copy | License |
|---|---|---|---|
| `web/vendor/three/three.module.min.js` | [three.js](https://github.com/mrdoob/three.js) r160, npm `three@0.160.0`, `build/three.module.min.js` (tarball sha256 `1ee2f935c4f555814b388e87b5ef78a44856bd2e9d0feb88643a6e193fb42856`), fetched 24 Oct 2026, unmodified | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` | MIT (`web/vendor/three/LICENSE`, the package's own copy) |
| `web/vendor/three/BufferGeometryUtils.js` | same package, `examples/jsm/utils/BufferGeometryUtils.js`, unmodified (it imports `three`, which the page's import map resolves to the file above) | `9be041e96308775d00e2695cc607645b9a9b64fd7c0e759dd8f7c00a8d92becb` | MIT |
| `web/fonts/IMFellEnglish-Regular.ttf` | [IM Fell English](https://github.com/google/fonts/tree/main/ofl/imfellenglish) by Igino Marini, google/fonts `main` `ofl/imfellenglish/IMFeENrm28P.ttf`, fetched 24 Oct 2026, renamed only | `fe9705bbde51af802719246d4608d08d37bde956ab99d9a590da996a5221a24c` | SIL OFL 1.1 (`web/fonts/OFL.txt`) with Reserved Font Name "IM FELL English" |
| `web/fonts/IMFellEnglish-Italic.ttf` | same, `IMFeENit28P.ttf` | `47cd75dce54b1f2e0831359d22d5e688f519d68ae45706b664fd310fd0e3ccf7` | SIL OFL 1.1 |
| `web/fonts/IMFellEnglishSC-Regular.ttf` | [IM Fell English SC](https://github.com/google/fonts/tree/main/ofl/imfellenglishsc), `ofl/imfellenglishsc/IMFeENsc28P.ttf` | `102324fb5434bb5da7963533426b0ad44c85bbc9e7755067535c9d11464a176b` | SIL OFL 1.1 (same OFL text) |

`web/tests/test_vendor.py` checks these hashes and that nothing in `web/` loads from another origin;
`scripts/build_web.sh --check` repeats the origin check on every deploy.

## Fetched or built at setup time (not stored in this repository)

| Component | Version | How it is used | License |
|---|---|---|---|
| [zcash-devtool](https://github.com/zcash/zcash-devtool) | commit `5a26ee8` + the patch above | built into `bin/devtool-aegis` (git-ignored) | MIT OR Apache-2.0 |
| [librustzcash](https://github.com/zcash/librustzcash) | rev `9c5705f` (pinned by the patch) | Rust dependency of zcash-devtool | MIT OR Apache-2.0 |
| [Codec2](https://github.com/drowe67/codec2) | tag `1.2.0` (commit `06d4c11e`) | built from source into `bin/c2enc`, `bin/c2dec` (git-ignored) | LGPL-2.1 |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | system package | invoked as a separate program for local text-to-speech | GPL-3.0 |
| [@grpc/grpc-js](https://github.com/grpc/grpc-node), [@grpc/proto-loader](https://github.com/grpc/grpc-node) | npm | lightwalletd queries in the spike scripts | Apache-2.0 |

No third-party binaries are distributed from this repository beyond the web files listed above: `bin/`, `vendor/`
and `node_modules/` are git-ignored.
