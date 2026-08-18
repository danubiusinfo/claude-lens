# Building and releasing ClaudeLens

Three platforms are supported: **macOS** (universal — Apple Silicon and Intel in
one binary), **Windows x64**, and **Linux x64**.

## What produces what

| Platform | Bundles | Where it is built |
|---|---|---|
| macOS | `.dmg`, `.app` | locally, or `macos-latest` in CI |
| Windows | `.exe` (NSIS, per-user), `.msi` | `windows-latest` in CI only |
| Linux | `.deb`, `.rpm` | `ubuntu-22.04` in CI, or Docker locally |
| Linux | `.AppImage` | `ubuntu-22.04` in CI, or a native x86_64 Linux host |

Windows bundling needs the MSVC toolchain and cannot be cross-compiled from
macOS in practice, so CI is the only path for it.

---

## GitHub Actions (the distribution path)

Two workflows live in `.github/workflows/`:

- **`ci.yml`** — runs on every push to `main` and on PRs. Builds installers for
  all three platforms and uploads them as workflow artifacts (14-day retention).
  This is what catches a macOS-only syscall or a malformed `icon.ico` before you
  cut a tag. Colleagues can download a build from any green run.
- **`release.yml`** — runs on `v*` tags. Builds all three platforms and collects
  the installers into a **draft** GitHub Release. Review the artifacts, then
  publish the release by hand.

### One-time setup

The repository has no git remote yet. Create one and push:

```bash
# With the GitHub CLI:
gh repo create claude-lens --private --source=. --remote=origin --push

# Or by hand, after creating the empty repo in the GitHub UI:
git remote add origin git@github.com:<owner>/claude-lens.git
git push -u origin main
```

No secrets need configuring — `release.yml` uses the automatically provided
`GITHUB_TOKEN`, and nothing is code-signed.

### Cutting a release

Keep the three version numbers in step — `package.json`, `src-tauri/Cargo.toml`
and `src-tauri/tauri.conf.json` all carry it:

```bash
npm version patch --no-git-tag-version          # bumps package.json
# then edit the version in src-tauri/Cargo.toml and src-tauri/tauri.conf.json
git commit -am "release: v0.1.1"
git tag v0.1.1
git push --follow-tags
```

The workflow opens a draft release; publish it once you have smoke-tested the
installers. Point colleagues at [`docs/INSTALL.md`](INSTALL.md) — the builds are
unsigned, so first launch needs a manual step on macOS and Windows.

---

## Local builds

### macOS

```bash
npm run build:mac        # tauri build --target universal-apple-darwin
```

Needs both Rust targets:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

Output: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`.

Dropping the `--target` flag builds for the host architecture only, which is
fine for local testing but not for handing to an Intel Mac.

### Linux (via Docker, from any host)

```bash
npm run build:linux                                  # x86_64 — what colleagues run
ARCH=arm64 ./scripts/build-linux.sh                  # aarch64 Linux
BUNDLES=deb,rpm,appimage ./scripts/build-linux.sh    # force the bundle list
```

Requires Docker to be running. Output lands in `release/linux-<arch>/`.

**AppImage is skipped when the build is emulated.** The AppImage runtime is an
ELF that QEMU user-mode emulation refuses to `exec` — it fails with
`Exec format error` before `linuxdeploy` does anything, and even a manual
`--appimage-extract` fails. So on an Apple Silicon Mac building for `amd64`, the
script defaults to `deb,rpm` and says so. Those two are pure-Rust bundlers and
work fine under emulation. The amd64 AppImage comes from `ci.yml`, which runs on
a native x86_64 runner. `BUNDLES` overrides the default if you want to try
anyway.

`scripts/linux-builder.Dockerfile` pins **Ubuntu 22.04** on purpose: that sets
the glibc floor at 2.35, which is what makes the bundles run on Ubuntu 22.04+,
Debian 12+ and Fedora 36+. Building on a newer base would silently raise that
floor. The script mounts the repo read-only and copies it into the container, so
the host's macOS `node_modules/` and `target/` never leak into the Linux build.
Cargo registry and target dirs are kept in per-arch named Docker volumes, so
repeat builds are much faster than the first.

On Apple Silicon the default `amd64` build runs under emulation and is slow.
GitHub Actions is the faster path once a remote exists.

### Windows

No cross-compilation path. On a Windows machine with Rust, Node 20 and the
[MSVC build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
installed:

```powershell
npm ci
npm run tauri -- build
```

Output: `src-tauri\target\release\bundle\nsis\`.

---

## Platform-specific notes in the code

Things that already handle the OS split, worth knowing before you touch them:

- `src-tauri/src/commands/system.rs` — `open_external_url` and
  `reveal_in_file_manager`. The latter uses `open -R` on macOS,
  `explorer /select,` on Windows, and the freedesktop `FileManager1` D-Bus
  interface on Linux with an `xdg-open`-the-parent-directory fallback.
- `src-tauri/src/menu.rs` — the app menu differs per platform; the About item
  sits under the app menu on macOS and under Help elsewhere.
- `tauri-plugin-liquid-glass` — its cocoa dependencies are target-gated and the
  plugin is a safe no-op off macOS, so it compiles everywhere. The Liquid Glass
  effect itself needs macOS 26+, with an `NSVisualEffectView` fallback below
  that. On Windows and Linux the `.liquid-glass` CSS class carries the look on
  its own.
- `src/lib/paths.ts` and `db/mod.rs`'s project-name derivation split on both
  `/` and `\`, because transcripts recorded on Windows carry backslash paths.
- `src/lib/platform.ts` — host-OS detection for cosmetic labels ("Open in
  Finder" vs "Open in Explorer").

## Icons

`src-tauri/icons/` holds one artwork in every format the three bundlers need.
All of them are listed in `bundle.icon` in `tauri.conf.json` — a PNG that is not
in that list is not shipped.

| File | Consumed by | Notes |
|---|---|---|
| `icon.icns` | macOS | Ten layers, 16 up to 1024 (`ic04`…`ic10`). The 1024 layer is the highest-resolution copy of the artwork anywhere in the repo. |
| `icon.ico` | Windows | Seven entries: 16, 24, 32, 48, 64, 128, 256. The 256 is PNG-compressed, the rest are 32-bit DIBs. |
| `16x16` … `512x512.png` | Linux | Each becomes `usr/share/icons/hicolor/<w>x<h>/apps/claude-lens.png`. |
| `128x128@2x.png` | Linux | The `@2x` suffix routes it to `hicolor/256x256@2` instead. |
| `icon.png` | fallback | 256x256. |
| `icon.svg` | design source | Not consumed by any bundler — a vector reconstruction of the raster, with the measurements it came from recorded in comments. |

Two constraints that will break the build if you regenerate these:

- **Every PNG in `bundle.icon` must be RGBA (colour type 6).** `generate_context!`
  panics with `icon <path> is not RGBA` otherwise, and image tools happily emit a
  palette PNG for a small icon with few colours. Force it:

  ```bash
  magick src.png -resize 16x16 -define png:color-type=6 PNG32:16x16.png
  ```

- **`icon.ico` must be a real ICO container, not a PNG named `.ico`.** The Windows
  bundler rejects the latter, and nothing on macOS or Linux notices — so it stays
  invisible until a Windows build runs. Check with `file src-tauri/icons/icon.ico`;
  it must say `MS Windows icon resource`, not `PNG image data`.

Regenerating the whole set from the largest available source:

```bash
# Pull the 1024x1024 layer out of the icns
sips -s format png --out /tmp/src1024.png src-tauri/icons/icon.icns

magick /tmp/src1024.png -define icon:auto-resize=256,128,64,48,32,24,16 \
  src-tauri/icons/icon.ico
for n in 16 32 48 64 128 256 512; do
  magick /tmp/src1024.png -resize ${n}x${n} \
    -define png:color-type=6 PNG32:src-tauri/icons/${n}x${n}.png
done
```

Avoid `tauri icon` unless you have a genuine 1024x1024 source: it overwrites the
whole set from whatever you hand it, including the `.icns`, and it also drops
`Square*Logo.png` / `StoreLogo.png` files that only the unused AppX/MSIX target
needs.

## Bundle configuration

In `src-tauri/tauri.conf.json` under `bundle`:

- **Windows NSIS** installs per-user (`installMode: currentUser`) into
  `%LOCALAPPDATA%`, so colleagues do not need administrator rights. WebView2 is
  fetched by the installer if missing (`downloadBootstrapper`).
- **Linux `.deb`/`.rpm`** dependencies are left to Tauri, which derives them
  from the linked sonames (`libwebkit2gtk-4.1-0`, `libgtk-3-0` for the deb;
  `libwebkit2gtk-4.1.so.0()(64bit)`, `libgtk-3.so.0()(64bit)` for the rpm).
  Declaring them again under `bundle.linux.deb.depends` produced a duplicated
  `Depends` field, so that block is deliberately absent.
- **macOS** targets 10.15 as the minimum system version.
