# Progress

## Current state (22 Nov 2026, day 7 of 26)
- Repo set up from the Aevum starter kit. Submodules pinned, JS packages installed.
- Kit baseline green: forge build, Shanghai check, 11 unit tests, 3 fork tests on real tUSD8.
- No Kibble contracts yet.

## Findings from setup
- tUSD8 now has permit + EIP-3009. That reopens gasless buying and x402-style payment, so the report's "approveX402 impossible" cut can be revisited (optional).
- AA has no official support and ERC-8004 isn't open, so use the fallbacks in report section 11.

## Next step
Drawer core (report section 12.3, 22–24 Nov): `KibbleDrawer` with `_sync`, `pay`, cost ceiling, ladder, earned T, U, supplier caps and fingerprints, plus tests. Then vault + factory.
