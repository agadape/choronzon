# anchors

Append-only archive of the work's published states, each stamped in Bitcoin with OpenTimestamps.
Written by the `publish-web` and `anchor-upgrade` workflows (and `python3 -m anchor persist` from a laptop) on
the default branch; nothing here is ever rewritten. `<height>-<id>.json` is a canonical statement (hashes,
versions, counts, one height: nothing private); `<height>-<id>.json.ots` is its OpenTimestamps proof.

Verify one (no Bitcoin node needed; checks the header against two public explorers):

    python3 -m anchor verify <height>-<id>.json

or drop both files on https://opentimestamps.org, or run `ots verify <height>-<id>.json.ots` with a Bitcoin node.
This proves that the statement existed no later than the block it is anchored in. It hides nothing and does not
prove that the chain data behind the hashes is complete. How and why: docs/anchoring.md on the default branch.
