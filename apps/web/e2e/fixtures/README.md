`stage-reveal.webm` is a 16 × 16 solid-color VP8 WebM with no audio, recorded
for 30 seconds using Chromium's `canvas.captureStream(1)` and `MediaRecorder`.
It is generated locally and contains no external media. Its long duration keeps
playback alive while lifecycle tests control `ended` and `error` events.

The tests deliver its headers and body separately through a fetch mock. Chromium
still decodes the real Blob URL; a late body completion can be delivered after
an abort to check that an outdated request never starts a reveal.
