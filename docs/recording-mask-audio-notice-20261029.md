# Recording capture mask and audio notice

During an active lesson on 29 October, OBS was recording but all five configured capture sources retained the enabled `IVAN100: скрыть личные разделы` color filter with opacity zero. The selected platform window was valid and visibly displayed the lesson. Disabling the persisted mask restored both the platform scene and, when it became active, the screen-share scene without stopping the recording. Local screenshots and guarded diagnostics are saved under `output/obs-*-20261029.*`.

The installed desktop 0.1.12 and repository both skipped the public-view reconciliation call when `PlatformTabs.appliedPrivacy` had no entries. OBS filters persist independently of that in-memory state. A second gap occurred if the public page opened while OBS was unavailable: the idle failure was intentionally harmless but there was no later public reconnect reconciliation.

Desktop 0.1.13 confirms the active ready public tab even without local mask ownership. After a confirmed public view, a five-second connection check retries reconciliation only if its OBS connection is absent; a healthy connection generates no source requests. Private reasons remain authoritative, including separate accounts panels. No recorder start/stop, audio settings or unrelated filters change.

The call audio notice defaults to a compact lower-right icon in board mode. It can expand for participant-specific recovery and collapse again. New state updates preserve the user's collapsed choice. Full-call notices can also collapse; fullscreen continues to use the existing in-fullscreen portal.

Validation: regression reproduced the skipped public reconciliation before the patch; all 60 desktop tests pass after both fixes. Browser QA uses the real notice component to check the default icon, access to the upper toolbar, expansion, recovery callback, collapse and state updates. No production lesson was restarted.
