# Goodneighbor Slots

A Foundry VTT **14** module for **Fallout 2d20**: five animated reels, independent concurrent player sessions, and a live GM console. Six-player concurrency is covered by automated tests; there is no hard six-player limit.

## Install

1. Extract `dist/goodneighbor-slots-0.2.2.zip` into a folder named `goodneighbor-slots` under your Foundry user data directory's `Data/modules/`. The resulting path must be `Data/modules/goodneighbor-slots/module.json`.
2. Restart Foundry, launch your Fallout world, and enable **Goodneighbor Slots** in Manage Modules.
3. Open **Game Settings → Configure Settings → Goodneighbor Slots → Open live console**.
4. Click **Assign me as cashier**. That GM must remain connected for spins to settle.
5. Open **Prize cabinet** and choose the common, rare, and jackpot bundles. Paste world/compendium Item UUIDs for equipment with real system statistics, or leave UUIDs blank for custom souvenirs and service vouchers.
6. Players and GMs can click **Open Goodneighbor Slots** in the right-hand **Settings** sidebar, below the other module controls. You can also use **Share machine** for a chat link, Configure Settings, or a script macro.

Player macro:

```js
game.modules.get("goodneighbor-slots").api.open();
```

GM macro:

```js
game.modules.get("goodneighbor-slots").api.monitor();
```

No external module or JavaScript dependencies are required. Releases are published at `giml3/Fallout2d20-Slotmachine`. Use the latest release's `module.json` URL for Manifest URL installation and updates; see `FOUNDRY-INSTALL.md`.

## Playing

Choose an owned character and spin for **5 caps** by default. Five reels use six original vector icons: bottle caps, a Memory Den lounger, a Third Rail microphone, a neon cocktail, Hancock's tricorn, and an Of the People badge.

Three, four, or five identical symbols **starting at the leftmost reel** award only the longest matching combination:

| Match | Reward |
| --- | --- |
| Exactly three bottle caps | Original wager returned |
| Exactly three of another symbol | Common item bundle |
| Exactly four matching symbols | Rare item bundle |
| Five matching symbols | Jackpot rare-item bundle |

The default common prize is a Third Rail drink voucher; the rare prize is Hancock's engraved lighter. The jackpot contains a mayor's presentation tricorn, a Memory Den private-session pass, and Magnolia's signed record. These original custom items are souvenirs/vouchers with no automatic game effects. Replace them with your world's weapons, consumables, ammunition, or other items through **Prize cabinet** to copy their actual statistics into the winner's inventory. Quantities are configurable. Bundles do not scale with the wager, so a single fixed wager is recommended.

No wilds, scatters, Luck spending, or automatic Fallout skill checks are included; these are house rules.

The default chance of any reward is **4.744%**: **2.854%** item wins and **1.89%** wager returns. The jackpot chance is **0.319888%** (about 1 in 313 independent spins), included within item wins. There is no cap-return percentage assigned to item values. The GM can restrict the jackpot to one particular symbol using `jackpotSymbol`; other five-symbol matches then award the rare bundle. The public jackpot display shows the configured bundle, exact chance, total jackpots, last winner, and spins since the last jackpot. It is a repeatable item award, not a growing cap pool or a guaranteed win after a number of losses.

Every player has independent controls and animations. Different actors settle concurrently; requests for the same actor are serialized. A muted/reduced-motion option is stored per client. Practice mode records simulated outcomes but changes neither caps nor inventory and is excluded from losses and jackpot history.

### Upgrading from 0.1.0

The old settings are read as version 2: cap multipliers are removed, wagers become a fixed 5 caps, and default item bundles are supplied. Configure your prizes before resuming play. Existing receipts and cap balances are untouched. Historical cap payouts remain included in all-time totals; the new jackpot display counts item jackpots only.

## GM console

- Live player cards: connection state, selected character, caps, wager, activity, and net winnings since the current GM page loaded.
- Activity: opens, character/wager changes, spin requests, settlement/recovery, animations, errors, connections, jackpots, and GM actions. Routine session activity is kept in memory (latest 1,000 events; latest 100 displayed).
- Pause/resume new wagers; accepted work completes. Block/unblock a player's future wagers.
- Prize cabinet: edit item names, Item UUIDs, and quantities for common, rare, and jackpot bundles. Save and reopen to add another row (up to 10 item types per bundle).
- Machine settings: editable JSON with validation, symbol labels/weights, wagers, bundles, jackpot trigger, practice mode, and receipt visibility. Calculated odds are shown before saving.
- All-time player ledger: total spins, caps wagered, caps returned, refunds, caps lost, losing spins, items won, and jackpots. Totals span all of a player's actors and survive reloads. Former players remain listed while their actor records exist.
- Inspect permanent receipts; return the original stake once with a required refund reason. **Refunds leave winnings intact.**
- Review interrupted updates without blindly replaying them.
- Export all existing actor receipts, pending updates, machine configuration, player totals, jackpot summary, and GM audit records as JSON.

**Caps lost** sums each spin's cap shortfall after refunds (`max(0, wager - cap return - refund)`). Item values are not deducted. A winning item spin may still cost 5 caps, but does not count as a **losing spin**. **Items won** includes awarded items awaiting delivery; the pending-prize panel makes that distinction explicit. Session cap net and all-time cap losses are separate measures.

Administrative financial/configuration actions require the assigned cashier GM. Other GMs can monitor, inspect, export, and share the machine. A replacement cashier can claim the role only after the previous cashier disconnects. There is deliberately no automatic financial failover.

## Settlement and recovery

The GM rolls the result. One Actor update writes both the final cap balance and the receipt under `flags.goodneighbor-slots.transactions.<spinId>`, including immutable item snapshots and reserved item IDs. Any wager return is netted in that update. Item inventory creation is a subsequent, separately recoverable step. The animation runs after settlement/delivery attempt.

Missing configured Item UUIDs reject the spin before caps are charged. Prize snapshots preserve the source item's statistics, set the configured quantity, and start unequipped. They are created as separate inventory entries instead of merging with existing stacks.

If inventory delivery fails, the receipt stays pending and the GM sees **Item prizes awaiting delivery**. **Deliver prizes** checks reserved IDs and creates only missing items. The same request can recover partially delivered bundles without charging again. Once delivery is recorded, consuming/deleting an item does not recreate it on retry. Do not consume, transfer, or delete items while their delivery is still pending; let the GM reconcile those cases first. Refunds return only the wager and do not remove won items.

Before applying an update, the GM saves a pending marker on their User document. It is removed only after a confirmed actor update. On a lost response, the original request ID retrieves the saved receipt without another payout. A local pending request survives browser refresh. Use **Check pending spin**, not a new wager, after a timeout.

If an update fails or a pending marker remains, further spins for that actor are held. Reload the world, inspect the actor balance and original receipt in the console, and reconcile the marker. Reconciliation never changes caps. If a correction is needed, make it manually on the actor sheet first and retain the ledger export. A reconciliation audit entry records whether the original receipt was found.

The module serializes its own writes, but Foundry does not provide a general compare-and-swap transaction against every other module. Avoid editing the same actor's caps in another sheet/module during a spin. Do not delete actors or pending cashier User documents before exporting their history; those documents hold the durable records.

## Compatibility and trust

The source inspected for the community Fallout system declares v14 compatibility and stores caps at `system.currency.caps`. The manifest targets Fallout **11.17.1+** and Foundry **14**. Unsupported/malformed currency fields are rejected. This release does **not** yet claim verified compatibility: actual Foundry v14 multi-client acceptance testing is still required.

This is for a trusted tabletop group using fictional caps. Native module sockets do not authenticate a user ID supplied inside a custom packet, and actor owners can edit their own documents. Ownership checks and GM execution protect normal UI workflows, not hostile clients running custom scripts. Socket result packets are visible to connected clients even when chat receipts are whispered. Do not treat the GM console as a security boundary or store secrets in the ledger.

## Development and verification

Requires Node.js 22+; no package installation is necessary.

```sh
node --test tests/*.test.js
node scripts/check.mjs
node scripts/preview.mjs
```

Open `http://127.0.0.1:4173` for the interactive standalone visual demo. It uses demo balances; it does not connect to Foundry. **Demo jackpot** demonstrates the full bundle and updates the example loss table. This button exists only in the preview. The production renderer and CSS are reused, while Foundry-only administrative operations are available in the installed module.

`npm test`, `npm run check`, and `npm run preview` are equivalent when npm is on PATH.

### Foundry acceptance checklist

- Open six player browsers plus the assigned GM; give each player an owned Fallout character with known caps.
- Spin all six together; compare the actor balances, private chat receipts, and exported records.
- Double-click and retry the same request; verify only one record/balance mutation.
- Spend the final caps from two windows for one actor; only affordable requests succeed.
- Close a window during animation and reconnect; settlement must remain recorded once.
- Pause/block while players are active; reject future wagers while allowing saved receipts to be retrieved.
- Disconnect/reload the cashier around settlement; inspect pending markers before switching GMs.
- Refund a wager twice; verify one returned stake and an unchanged original payout.
- Check settings validation, public/private receipts, reduced motion, mute, and six-card console layout.
- Configure a real compendium item; win it and verify quantity/statistics in inventory.
- Interrupt a multi-item prize delivery; retry and verify only missing items are created.
- Reload the world and compare all-time player loss totals and jackpot history with the export.
- Check that practice awards do not affect inventory, losses, or jackpot statistics.

## Source layout

- `scripts/engine.js`: odds, weighted symbol selection, payout rules, validation, actor queues.
- `scripts/transactions.js`: idempotent balance/receipt writes, recovery holds, refunds.
- `scripts/prizes.js`: immutable item snapshots and retryable inventory delivery.
- `scripts/main.js`: Foundry applications, sockets, settings, GM actions, and chat integration.
- `scripts/views.js`, `styles/slots.css`: shared UI, original SVG symbols, animation, layout.
- `preview/`: browser demo; `tests/`: dependency-free Node tests.

## References

- [Foundry v14 ApplicationV2](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)
- [Fallout system manifest](https://github.com/Muttley/foundryvtt-fallout/blob/develop/system/system.json)
- [Fallout currency template](https://github.com/Muttley/foundryvtt-fallout/blob/develop/system/template.json)

MIT licensed code and original vector art. Fallout and Goodneighbor are owned by their respective rights holders. This unofficial fan project is not endorsed by Bethesda or Modiphius.
