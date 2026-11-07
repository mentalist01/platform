# Lesson venue and helper 1.5.15

Teacher roster: “Где занимаемся” stores `lessonVenue` (`platform` / `telemost`) through the owner-authorized student PATCH. Existing pupils default to platform even with a saved backup Telemost URL. The preference and URL survive unrelated updates. Group lesson routes are unchanged.

The prelesson prompt names the preferred venue in expanded and collapsed views. Its primary button uses the existing individual Telemost callback (including recording flow), or platform call-connect. Missing Telemost links lead to call configuration without starting a platform call. The prejoin call screen also shows the preference.

Helper startup continues to try shared cell synchronization first. If a native editor opened but initialization failed, it stays open and switches to whole-file autosave after a native backup. Export and status commands avoid shared-model/presence metadata. Entering startup fallback never publishes the possibly partial native document before the next user save. If no native editor attached, the existing separate-copy fallback remains in use. Native command/stage and HRESULT are included in redacted diagnostics.

Validation: owner/foreign teacher/student authorization and storage integration; venue routing tests; existing fallback and updater-signature integration tests; hidden native Excel and Calc checks inject a post-open snapshot error, preserve unsaved B2, verify zero premature uploads, then verify the actual saved file hash at the real loopback board endpoint. Published executable self-test and production build pass. Native QA artifacts: `output/helper-startup-fallback-20261107-r6`.
