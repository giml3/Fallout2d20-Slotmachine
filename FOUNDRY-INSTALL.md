# Foundry v14 delivery

Release: **Goodneighbor Slots 0.2.3**

The delivery files are:

- `dist/module.json` — the standalone Foundry module manifest.
- `dist/goodneighbor-slots-0.2.3.zip` — the complete module, including the identical manifest at the archive root.

## Install locally now

1. Extract the ZIP into `{Foundry user data}/Data/modules/goodneighbor-slots/`.
2. Confirm that `module.json` is directly inside that folder, not an additional nested folder.
3. Restart Foundry and enable **Goodneighbor Slots** in a Fallout world.
4. Open the module's Overseer console in Configure Settings, assign the cashier GM, and configure the Prize cabinet.

This targets Foundry 14 and the Fallout system 11.17.1 or later. Actual multiplayer testing in Foundry is still pending, so the manifest does not claim `verified` compatibility.

## Install using a Manifest URL

Foundry's Manifest URL installer downloads the JSON and then follows its `download` field to the ZIP. A JSON file alone cannot deliver the module's scripts and styles. It is a module manifest, not an Actor/Item JSON import.

Host both files at direct HTTP(S) URLs reachable by the Foundry server. For example, use GitHub release assets. Once the actual URLs are known, run:

```powershell
.\scripts\package.ps1 -ManifestUrl '<actual stable JSON URL>' -DownloadUrl '<actual release ZIP URL>'
```

The script adds those URLs to **both** copies of the manifest and rebuilds the ZIP. Publish the generated pair together. In Foundry Setup, select **Add-on Modules → Install Module**, paste the JSON URL into **Manifest URL**, and install.

## Configured GitHub release

Repository: https://github.com/giml3/Fallout2d20-Slotmachine

Create a release with tag **v0.2.3** and attach these two generated files as release assets:

- `dist/module.json`
- `dist/goodneighbor-slots-0.2.3.zip`

Publish it as the latest full release (not a draft or prerelease). The configured Foundry Manifest URL is:

```text
https://github.com/giml3/Fallout2d20-Slotmachine/releases/latest/download/module.json
```

The manifest's ZIP download URL is pinned to version 0.2.3:

```text
https://github.com/giml3/Fallout2d20-Slotmachine/releases/download/v0.2.3/goodneighbor-slots-0.2.3.zip
```

The release workflow publishes these assets after the module version changes on main. Uploading only source files or using GitHub's automatic source-code ZIP is not enough: attach the generated module ZIP and JSON using the exact filenames above. The Foundry server must be able to access the release assets without signing in.

For future versions, update `module.json`'s version and pinned `download` URL together, keep its `manifest` URL stable, and rebuild with `scripts/package.ps1`.

Reference: [Foundry module manifests and distribution](https://foundryvtt.com/article/module-development/).


