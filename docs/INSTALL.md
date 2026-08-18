# Installing ClaudeLens

ClaudeLens reads the Claude Code transcripts already on your machine
(`~/.claude`) and stores its own database in `~/.claudelens`. Nothing is
uploaded anywhere.

Downloads live on the [Releases page](../../releases). Grab the file for your
platform:

| Platform | File |
|---|---|
| macOS (Apple Silicon and Intel) | `ClaudeLens_<version>_universal.dmg` |
| Windows 10/11 x64 | `ClaudeLens_<version>_x64-setup.exe` |
| Linux x64 (Ubuntu/Debian) | `claude-lens_<version>_amd64.deb` |
| Linux x64 (Fedora/RHEL) | `claude-lens-<version>-1.x86_64.rpm` |
| Linux x64 (any distro) | `claude-lens_<version>_amd64.AppImage` |

> **These builds are not code-signed.** That is a deliberate, current-state
> choice — there is no Apple Developer ID or Windows certificate behind them
> yet. Both macOS and Windows will therefore warn you on first launch, and the
> steps below are how you get past that. Only do this for a build you got from
> this repository's Releases page.

---

## macOS

1. Open the `.dmg` and drag **ClaudeLens** into `/Applications`.
2. The first launch will be blocked: *"ClaudeLens is damaged and can't be
   opened"* or *"cannot be opened because the developer cannot be verified"*.
   Both messages mean the same thing — the app is unsigned and unnotarized.
3. Clear the quarantine flag, then open it:

   ```bash
   xattr -dr com.apple.quarantine /Applications/ClaudeLens.app
   open /Applications/ClaudeLens.app
   ```

   Alternatively: right-click the app → **Open** → **Open** in the dialog. On
   macOS 15+ that path is gone for unsigned apps, so prefer the `xattr` command.

The Liquid Glass window effect needs macOS 26 (Tahoe); on older versions the app
falls back to the standard vibrancy material automatically.

---

## Windows

1. Run `ClaudeLens_<version>_x64-setup.exe`.
2. SmartScreen shows *"Windows protected your PC"*. Click **More info** →
   **Run anyway**.
3. The installer is per-user — it installs into `%LOCALAPPDATA%\ClaudeLens` and
   needs **no administrator rights**.
4. If Microsoft Edge WebView2 is missing, the installer downloads and installs
   it for you. It is already present on any up-to-date Windows 10/11.

Uninstall via **Settings → Apps → Installed apps → ClaudeLens**.

---

## Linux

### Debian / Ubuntu

```bash
sudo apt install ./claude-lens_<version>_amd64.deb
```

Requires Ubuntu 22.04+ or Debian 12+ (glibc 2.35 and WebKitGTK 4.1). `apt` pulls
in `libwebkit2gtk-4.1-0` and `libgtk-3-0` automatically.

### Fedora / RHEL

```bash
sudo dnf install ./claude-lens-<version>-1.x86_64.rpm
```

### AppImage (any distro)

```bash
chmod +x claude-lens_<version>_amd64.AppImage
./claude-lens_<version>_amd64.AppImage
```

### If the window comes up blank

This is the well-known WebKitGTK compositing bug, most often on NVIDIA drivers.
Launch with the DMA-BUF renderer disabled:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 claude-lens
```

If that alone is not enough, also disable compositing:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 claude-lens
```

To make it permanent, add the variable to the `Exec=` line of
`/usr/share/applications/claude-lens.desktop`, or export it from your shell
profile.

---

## Uninstalling completely

The app never writes outside your home directory. To remove its data along with
the app:

```bash
rm -rf ~/.claudelens          # macOS / Linux
```

```powershell
Remove-Item -Recurse $HOME\.claudelens   # Windows
```

`~/.claude` belongs to Claude Code itself — ClaudeLens only reads it, so leave
it alone.
