# Changelog

## 0.2.2

- Added an Open Goodneighbor Slots button for all players and GMs in the right-hand Settings sidebar, appended below other module controls.
- Supports sidebar rerenders and popped-out Settings without duplicate buttons.

## 0.2.1

- Reels scroll through changing symbols at speed, smoothly decelerate, and stop independently at randomized times (roughly 2.5–5 seconds).
- Visual stopping order varies per spin; all reels land on the already-settled result.
- Shared animation for Foundry and the preview, with reduced-motion and closed-window handling.

## 0.2.0

- Replaced large cap payouts with common, rare, and jackpot item bundles; three leftmost caps return the wager.
- Added a GM prize cabinet for world/compendium Item UUIDs and configurable quantities. Blank UUIDs create custom souvenirs or service vouchers.
- Five matching symbols now trigger the rare-item jackpot by default; a specific symbol can be selected instead.
- Added a public jackpot display with the current bundle, odds, wins, last winner, and spins since the latest jackpot.
- Added persistent per-player cap losses, losing spins, wagers, refunds, items won, and jackpot totals, including ledger exports.
- Prize inventory delivery uses saved item IDs and snapshots, with recovery for partial deliveries and lost responses.
- Existing configuration upgrades to a fixed 5-cap wager and item prizes. Existing receipts remain unchanged.
- Preview includes a clearly labeled demo jackpot button; no forced-outcome control is exposed in the Foundry module.

## 0.1.0

- Five reels with six original Goodneighbor-themed SVG symbols.
- Independent concurrent sessions, with six-player automated coverage.
- Configurable weights, payouts, wagers, practice mode, and calculated odds.
- Assigned GM cashier, same-actor serialization, persistent spin IDs, combined balance/receipt updates, and interrupted-update review.
- Live GM player cards and activity feed; pause, block, inspect, refund, share, and ledger export.
- Original cabinet styling, staggered reel stops, synthesized audio, and reduced-motion controls.
- Standalone interactive preview and dependency-free automated tests.
- Targets Foundry v14 and Fallout 11.17.1+. Live Foundry compatibility verification remains pending.
