# Screen sharing and OBS measurements, 8 October 2026

The reproduced bottleneck was software screen-video encoding on the teacher's CPU. Six 1920×1080 VP8 senders stalled simultaneously; changing their codec preference to H.264 selected NVIDIA's hardware encoder and restored video throughput at the same screen resolution. OBS recording remained 2560×1440 at 30 fps, NVENC HQ throughout these comparisons.

Machine: Ryzen 5 8400F, 6 cores / 12 logical processors; RTX 4060, 8188 MiB VRAM; 32 GiB physical RAM; NVIDIA driver 32.0.15.9621. The isolated test used Electron 44.5.1 / Chromium 152, matching the desktop project's runtime. GPU encoding, decoding and compositing were enabled after GPU initialization.

Actual primary-monitor capture displayed animated content, changing Python text and a clock. Real peer connections delivered the captured track to six video receivers in a separate renderer process. A further test sent the same track to an OBS browser source using the recorder's real share-view HTML. Test recordings were local, with no real lessons or uploads created. Existing applications stayed running, so total CPU usage includes background activity.

| Scenario | Total CPU | Screen fps, median | OBS encoding lag, measured stable interval |
| --- | --- | ---: | --- |
| OBS alone | 21% median, 32% peak | — | 0 / 889 frames |
| OBS + six VP8 screen senders | 100% during the stall | 0.17 | 550 / 1583 frames, 34.7% |
| OBS + six H.264 senders, production codec helper | 22% median, 90% brief peak | 14.83 | 0 / 1503 frames |
| Same test after restarting screen sharing | 31% median, 60% peak | 14.69 | 0 / 1065 frames |
| Six H.264 senders + local OBS browser feed + recording | 34% median, 53% peak | 14.77 | 0 / 1510 frames |

The bad scenario starved the system sampler too: only one full system sample fell inside its stable interval. Its CPU median/percentiles are therefore not meaningful. Independent per-core samples also reached 100%; the video sender renderer consumed 68% of the whole 12-thread CPU in the available sample, while the local receiver renderer consumed 0.06%. Video encoding took seconds per frame and renderer timer delays reached 2.8 seconds. These findings distinguish sender-side starvation from the overhead of the test's local receivers.

In the successful six-sender test the sender renderer used 2.79% CPU median; with the OBS browser feed it used 3.44%. The encoder reported `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)` and `powerEfficientEncoder: true`, versus `libvpx` / `false` in the failing VP8 test. The full successful scenario had GPU usage 32% median, encoder usage 49% median / 62% peak, and OBS render time 0.34 ms median / 0.42 ms p95. CPU background spikes remained, but video throughput and OBS frame counters stayed stable on the measured intervals.

Physical RAM and VRAM retained headroom; approximately 15–18 GiB of RAM remained available in the relevant comparisons. GPU temperature was about 55–60°C; the NVIDIA hardware and software thermal-slowdown flags were inactive. Disk activity and paging were also sampled. These observations do not indicate a sustained storage or GPU-encoder ceiling in the reproduced stall. CPU temperature was not exposed by the built-in counters and was not measured.

The source change prefers H.264 for desktop screen senders and the additional local recorder sender before SDP negotiation. It retains the remaining codec capabilities and repair codecs. An actual VP8-only receiver successfully negotiated VP8 and played 1920×1080 video at 14.83 fps. The existing connection-dependent video budgets remain in place. H.264 availability alone does not guarantee hardware encoding on every computer; hardware use was verified on this particular RTX 4060.

Validation included 12 completed controlled scenarios across the final two harnesses, eight real OBS recordings fully decoded by FFmpeg, 31 passing RTC/recovery/desktop-sharing tests and a successful production build. All eight recordings are H.264 High, 2560×1440, 30 fps. In the final recording every interior packet interval is at most 34 ms. OBS writes one 100 ms interval at the very end while stopping; this was recorded explicitly rather than described as a completely gap-free file. Beginning and ending frames were inspected and show changing text, clock and animation.

The first encoded-frame-discarding receiver experiment caused extra keyframe requests and was excluded from the comparison. The normal-decoding replacement reproduced the stall independently. The normal-decoding default-codec test could not initialize the additional OBS feed under the six-sender stall; the production H.264 preference subsequently passed both one- and six-recipient OBS-browser tests.

Full raw evidence is stored locally under `output/full-quality-diagnosis-v2` and `output/full-quality-diagnosis-v3`: measurements, system counters, per-core/thermal counters, summaries, file validation and inspected frames. The recorder's real job lists remained unchanged, OBS is idle, the original platform scene and ordinary filename pattern were restored, and temporary OBS scenes/sources were removed. The 1440p restoration remains in effect.

The six receivers were local. Their decoding load was measured separately, but the GPU figures include their work. This does not test students' WAN connections, TURN capacity, microphones/cameras, or the full production call-room interface. It proves a reproducible sender-encoding bottleneck and validates a targeted change, rather than proving that every possible live-lesson slowdown is resolved. The frontend change is implemented and built locally; this measurement run did not publish it to the site.

The interpretation of encoding time, fps and encoder implementation uses the [W3C WebRTC statistics specification](https://www.w3.org/TR/webrtc-stats/). OBS documents CPU/GPU resource contention in its [encoding performance guide](https://obsproject.com/kb/encoding-performance-troubleshooting).
