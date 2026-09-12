# N64 output diagnostics (phase 1)

## Current status — lifecycle1 (2026-09-12)

This section supersedes the historical build, untested-phone and LAN-CA notes
below. Earlier cullcache1 iPhone Zelda A/B failed audio acceptance with no output
reports. The subsequent lifecycle1 **capture5 is accepted by the user: no noise,
very satisfactory audio**, with complex-scene stutter still present. Its stable
receiving route has session/context/producer/generation 1/3/4/3, zero failures
and observed heartbeat age at most 971 ms. Last 60 audio seconds still have
19.2091% missing source frames, not equivalent to silence or audible crackles.
See [the device results](N64_IPHONE_20260912_RESULTS.md) for interval semantics.
Keep cull cache OFF and SDL 3072/1024. No new optimization or sample-rate fix:
the 44.1/48 kHz deficit remains an unverified hypothesis. Desktop emu2's
approximately 110-second `null function` failure remains unresolved. This is
not a perfect-emulation or long-run stability claim. Do not repeat CA setup
or open public tunnels without a new testing arrangement.

Version `7f0ebbf78c-64m2-lifecycle1` adds native SDL close/open hooks, context AND
producer identity checks, generation-based cancellation, first-render ack before
muting SDL, and a five-second running-context heartbeat watchdog. Processor errors
or missing heartbeat restore ScriptProcessor output. Recovery is bounded: no
retry on the same failed device; a new SDL identity automatically reconnects.
No buffer, resampler or renderer defaults changed. The Worklet URL is versioned.

Diagnostics refresh the bridge on existing five-second telemetry reports. Port
replacement clears counters and increments `session`; only compare cumulative
deltas within the same session/generation. `bridge` exports context state/rate,
context/producer IDs, generation, routeState, ack, heartbeat age and errors.
`mode` describes routing, not health: inspect `status`, context and heartbeat.
Missing reports become `render-report-timeout` after five seconds; old reports
become `render-report-stale`. `context-not-running` excludes suspended playback
from a healthy label. Timers and report deliveries can be delayed by main-thread
blocking; these are not hard realtime guarantees or measured speaker latency.

48 focused tests, TypeScript, repeatable 15-patch bootstrap, pinned incremental
N64 build and production build pass. Local production desktop Zelda renders 3D
and exports receiving/live at 48 kHz after device reinitialization. Desktop tests
alone do **not** establish iPhone sound quality; the acceptance above comes from
the actual user's capture5 and listening feedback, not a proven noise root cause.

Enable with the URL parameter `n64AudioDiagnostics=1`. This is independent of
`n64Benchmark` and changes no renderer, buffer, timing, resampler, fade or playback
defaults. For the existing benchmark UI/export, add the same parameter to its URL.
The existing benchmark caveat still applies: matching normal mobile rendering
requires `n64PersistentBuffers=1` and the fork. Diagnostics alone does not enable
a benchmark. No desktop benchmarks were run for this implementation.

## Reception and export

- The processor posts cumulative snapshots at most once per second of rendered
  audio, only after an explicit diagnostic subscription. Sample rate is the
  Worklet global's actual rate, not the separate application AudioContext's rate.
- Existing N64 periodic diagnostics log `[N64 audio output]` and save the current
  envelope to localStorage key `n64AudioOutputDiagnostics`. Benchmark completion
  includes `audioOutput` in `n64BenchmarkResult`, mobile result storage and the
  existing benchmark POST, and shows availability plus total/max gap in the UI.
- Status distinguishes disabled, awaiting runtime/report, receiving, unsupported
  runtime (rebuild needed), and unavailable counters on ScriptProcessor fallback.
  Unknown data is null, not zero. ScriptProcessor mode/rate come from SDL only
  when the runtime supports the bridge.
- Scope is explicitly **since diagnostic attachment**, including benchmark warmup,
  not the benchmark's steady sample interval. Snapshots are cumulative and must
  not be summed. Count deltas between snapshots can select intervals; longest gap
  and queue extrema are lifetime extrema, not interval deltas. Last snapshot may
  lag by one audio second plus main-thread delivery delay; no forced flush occurs.

## Counter semantics

- `renderedFrames` is output render progress; suspended contexts do not advance it.
- `steadyFrames` starts when normal 1024-frame priming completes. Missing source
  frames count even when decay produces nonzero PCM. A contiguous missing segment
  counts once; its longest length survives reporting boundaries. A valid prefix
  ends a previous gap before any new missing suffix begins.
- Paused, muted, initial priming and re-priming after clear are excluded. Separate
  `pausedFrames`, `mutedFrames`, `primingFrames` expose exclusions (pause takes
  precedence over mute). `clearEvents` includes clears caused by paused/muted state
  messages. Clears terminate gaps; they do not reset cumulative counters.
- `dropEvents` counts each oldest chunk evicted at high water, with remaining
  frames counted for partially consumed chunks. Pre-prime drops and intentional
  clears are excluded. This is not a count of audible clicks.
- Queue min/max measure retained steady queue at sample admission (after existing
  high-water trimming) and render consumption boundaries. No averages or latency
  estimates are inferred. Empty steady queue is zero; no steady observations is null.

## Historical phase-1 runtime/build status (superseded above)

The new read-only controls getter is maintained in fork patch
[0003-web-audio-output-diagnostics.patch](../tools/n64/patches/mupen64plus-ui-console-web-netplay/0003-web-audio-output-diagnostics.patch),
automatically picked up by the existing bootstrap's ordered patch discovery.
It passes `git apply --check` against the cached patched console source.

The fork was rebuilt successfully on 2026-09-12 with Emscripten 3.1.25 and
64 MiB initial memory. Runtime asset version is `7f0ebbf78c-64m2-audiodiag1`.
The read-only getter is included in the rebuilt bundle. The previous artifact
and npm runtime lack this bridge and must report unsupported, not zero gaps.
The new patch uses a parenthesized object expression for EM_ASM C macro safety
and is placed outside the previous patch's context for repeatable bootstrap.
Full production build passed. No production deployment has been performed.

## Historical phase-1 validation and limits (superseded above)

Targeted Vitest processor/receiver/benchmark tests validate logic only: opt-in,
unchanged PCM, gap continuity, exclusions, drops, sample rates, low message rate,
receiver deduplication and unavailable runtime status. TypeScript checking passes.
These tests are **not performance measurements or iPhone evidence**. No iPhone
runtime playback test has been performed. HTTPS asset requests passed using the
explicit local CA (TLS verification retained); the integrated browser did not
trust this private CA, so browser playback validation remains pending.
Real-device HTTPS verification,
pause/mute/background recovery and external audio evidence remain required by
[the assessment](N64_IPHONE_AUDIO_ASSESSMENT.md). Suspended render time and time
before a main-thread state message reaches the Worklet cannot be measured as
intentional exclusions by this render-side counter alone.

## 2026-09-12 device-side integration

- The opt-in overlay shows secure-context status, actual output mode, receiver
  availability, sample rate and cumulative gap total/max. Its export includes up
  to 200 recent five-second reports with source/renderer timing and selected
  configuration. Compare cumulative counter deltas, never sum them. It contains
  user agent, ROM filename and timings; inspect before sharing.
- App pause/background/mute intent is forwarded by `diagnostics-state`, which
  only excludes counters and terminates gap segments; it does not mute N64,
  flush PCM or alter routing. This is not proof that the existing N64 mute button
  changes its independent SDL output. Repeated unchanged gestures do not reset gaps.
- 32 focused tests and TypeScript checking pass. These are logic/build evidence,
  not measurements of iPhone performance.

## Optional historical iPhone LAN setup (not the current test route)

Local VS Code tasks are intentionally not shipped. A private-network setup can
use Vite with `N64_MOBILE_HTTPS=1` (5173) and the optional public-CA-only
[server](../tools/n64/mobile-ca-server.mjs) (5174). HTTPS requires certificates generated by
[prepare-mobile-https.ps1](../tools/n64/prepare-mobile-https.ps1).
The CA endpoint serves only the public DER certificate; keys remain ignored in
the local cache and must never be transferred. No system trust or firewall rules
were changed automatically. Only use this setup on a trusted private network.

1. Connect iPhone to the computer's LAN. Determine its current reachable
  same-subnet LAN address; no machine-specific address is part of this release.
2. Open `http://<IP>:5174/rootCA.crt` in Safari to download the local test CA.
  Settings → General → VPN & Device Management → install the downloaded profile;
  then General → About → Certificate Trust Settings → enable full trust for this
  local test CA. Verify it is this computer's certificate before granting trust.
3. Open `https://<IP>:5173/?n64AudioDiagnostics=1`. Do not merely bypass a browser
  certificate warning; the diagnostic panel must show secure context and
  `audio-worklet / receiving` after a game starts.
4. First use Super Mario 64, internal speaker, low-power mode off: warm up 30 s,
  then play a repeatable scene for 60 s without pause, mute or tab switching.
  Expand the top-left diagnostic panel and export JSON. Supply actual iPhone
  model/iOS version and whether/when audible crackles occurred. Do not enable
  old baseline/full/buffer experiments for this initial capture.
5. After diagnosis, use a single targeted candidate and repeat the same scene.
  Longer 15-minute testing comes after the short capture is confirmed usable.
6. Stop both tasks and remove the test CA profile from the phone when testing is
  finished. If local IP addresses change, regenerate the leaf certificate and
  restart HTTPS. Do not expose these development ports to the public internet.

If the certificate download cannot connect, first confirm same subnet and no
guest-Wi-Fi/client isolation. A Windows firewall prompt may require the user to
allow Node.js on the private network; do not disable the firewall globally.