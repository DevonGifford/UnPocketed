# How is audio written during capture, and what survives a kill?

Research for [ticket 05](../issues/05-how-is-audio-written-during-capture.md).

Package facts are read from **`expo-audio@57.0.5` as installed in this repo**
(`node_modules/expo-audio/`), not from the published documentation — the two differ in places
that matter here. Platform facts come from AOSP `frameworks/av` (`MediaRecorder`'s actual
writers) and from the `MediaRecorder` javadoc in `frameworks/base`, which is the source the
reference pages are generated from. All external sources retrieved **2026-10-07**.

Citations are `File.kt:line` / `File.cpp:line`, against the copies on disk at the paths listed in
[Sources](#sources). Every quoted block was grepped out of a local copy of the file named.

## Findings

| Question | Answer |
| --- | --- |
| Is audio buffered or written progressively? | **Written progressively**, in ~1 s chunks, by unbuffered `write(2)`. |
| Is a file from a killed process playable? | **No.** The `moov` atom and the `mdat` size are written only during `MediaRecorder.stop()`. |
| Can it be repaired on-device? | **No.** Off-device, only by `untrunc`-style reconstruction, which needs a reference file. |
| Is there a truncation-tolerant format? | **Yes — three**, and all three are reachable: `aac_adts`, `amrnb`/`amrwb`, `mpeg2ts`. |
| What does `maxFileSize` do? | **Stops** the recording and emits one event. It does not rotate, and the event claims an error. |
| Is gapless segmented capture reachable? | **No.** `setNextOutputFile` is not exposed, and the one event that permits calling it is not handled. |
| Does the notification Stop reach JS? | It emits `recordingStatusUpdate`. **This app subscribes no listener**, and today the notification is never posted at all. |
| What can JS find on relaunch? | **Nothing but an orphan file.** No persisted recorder, no recoverable state, no known path. |
| Where does the in-progress file live? | **The cache directory** — evictable by Android, and not scanned by this project's library. |

The sacred-original invariant (§3.2) and §14's "survive unexpected application termination" are
both load-bearing on a single platform fact: an MP4-family container is finalised in one
operation at the end, and that operation is `stop()`. Everything else in this document follows
from that, or from `expo-audio` declining to expose the platform's own answer to it.

---

## 1. When audio actually reaches the file

### Encoded audio is written as it is produced, not buffered

`MediaRecorder` with `OutputFormat.MPEG_4` is served by AOSP's `MPEG4Writer`. Its writer thread
drains chunks to the file as the encoder produces them — `writeChunkToFile()` called from
`threadFunc()` — and the writes are raw `write(2)` calls, wrapped in `writeOrPostError()`, with
no stdio buffering layer.

Samples do not go to the file one at a time; they accumulate in a per-track `mChunkSamples` vector
and are handed to the writer thread a chunk at a time. The gate is the interleave duration, and
despite the name it applies **per track, regardless of how many tracks there are** —
`MPEG4Writer.cpp:3943-3968`, inside `Track::threadEntry()`, verbatim:

```cpp
        mChunkSamples.push_back(copy);
        if (mIsHeic) {
            bufferChunk(0 /*timestampUs*/);
            ++nChunks;
        } else if (interleaveDurationUs == 0) {
            addOneStscTableEntry(++nChunks, 1);
            bufferChunk(timestampUs);
        } else {
            if (chunkTimestampUs == 0) {
                chunkTimestampUs = timestampUs;
            } else {
                int64_t chunkDurationUs = timestampUs - chunkTimestampUs;
                if (chunkDurationUs > interleaveDurationUs || lastSample > 1) {
```

`interleaveDurationUs` is read from the owning writer at `MPEG4Writer.cpp:3439`
(`const int64_t interleaveDurationUs = mOwner->interleaveDuration();`) and initialised at
`MPEG4Writer.cpp:520` to `mInterleaveDurationUs = 1000000;` — **1 second**. `expo-audio` never
calls `setInterleaveDuration` (`AudioRecorder.kt:255-290` sets only audio source, output format,
encoder, sampling rate, channels, bit rate, max file size and output file), so the default stands.

So "progressive" means **in roughly one-second chunks**, not continuously.

`MPEG4Writer`'s own comment in `MPEG4Writer::start()` (`MPEG4Writer.cpp:950-958`) states the
invariant that matters most here, verbatim:

> mWriteBoxToMemory is true if the amount of data in a file-level meta or moov box is smaller
> than the reserved free space at the beginning of a file, AND when the content of the box is
> constructed. Note that video/audio frame data is always written to the file but not in the
> memory. **Before stop()/reset() is called, mWriteBoxToMemory is always false.**

"video/audio frame data is always written to the file but not in the memory" is the primary-source
answer to question 1. The samples are on disk.

### What is therefore *not* on disk at an arbitrary moment mid-recording

1. **The `moov` atom** — the sample table. Written only in `reset()`. See [§2](#2-the-crux-a-file-from-a-killed-process).
2. **The real `mdat` box size.** The size field is a placeholder until `reset()` patches it.
3. **Up to one chunk** of encoded audio — up to ~1 s, sitting in `mChunkSamples` or in the
   writer thread's queue rather than in the file, per the gate quoted above.
4. **Encoder and `AudioRecord` latency** — audio captured but not yet encoded. Small, and not
   quantified by any source consulted.

A SIGKILL does **not** lose bytes that `write(2)` already accepted: those belong to the kernel
page cache and are flushed by the kernel independently of the process. So the damage from a
process kill is **structural, not acoustic** — which is exactly why reconstruction is possible at
all (see [§2.3](#23-is-there-a-repair-path)).

> **UNVERIFIED:** whether any Android version or OEM adds buffering between `MPEG4Writer` and the
> file. The AOSP path is unbuffered; a vendor fork was not checked.

### Pausing is not a safe point

`AudioRecorder.pauseRecording()` (`AudioRecorder.kt:157-162`) calls `MediaRecorder.pause()`,
whose javadoc reads, verbatim:

> Pauses recording. Call this after start(). You may resume recording with resume() without
> reconfiguration, as opposed to stop(). It does nothing if the recording is already paused.
>
> When the recording is paused and resumed, the resulting output would be as if nothing happend
> during paused period, immediately switching to the resumed scene.

`pause()` does not finalise anything. A recording that is paused — which is what
`OnActivityEntersBackground` does today, see [§6.3](#63-in-this-build-the-notification-does-not-exist) —
has exactly the same unplayable file on disk as a recording that is running.

---

## 2. The crux: a file from a killed process

### 2.1 When the `moov` atom is written

Only in `MPEG4Writer::reset()`, which is what `MediaRecorder.stop()` drives.
`MPEG4Writer.cpp:1378-1388`, verbatim:

```cpp
    if (mHasMoovBox) {
        writeMoovBox(maxDurationUs);
        // mWriteBoxToMemory could be set to false in
        // MPEG4Writer::write() method
        if (mWriteBoxToMemory) {
            writeCachedBoxToFile("moov");
        } else {
            ALOGI("The mp4 file will not be streamable.");
        }
        ALOGI("MOOV atom was written to the file");
    }
```

and, a few lines earlier in the same function, the `mdat` fix-up —
`MPEG4Writer.cpp:1350-1356`, verbatim:

```cpp
    // Fix up the size of the 'mdat' chunk.
    seekOrPostError(mFd, mMdatOffset + 8, SEEK_SET);
    uint64_t size = mOffset - mMdatOffset;
    size = hton64(size);
    writeOrPostError(mFd, &size, 8);
    seekOrPostError(mFd, mOffset, SEEK_SET);
    mMdatEndOffset = mOffset;
```

Both are end-of-session operations. Nothing writes a `moov` while recording — the `start()`
comment quoted in §1 says so outright ("Before stop()/reset() is called, mWriteBoxToMemory is
always false"), and `MediaRecorder.setOutputFile(File)`'s javadoc requires a seekable file for
precisely this reason:

> Pass in the file object to be written. Call this after setOutputFormat() but before prepare().
> **File should be seekable.** After setting the next output file, application should not use the
> file until {@link #stop}. Application is responsible for cleaning up unused files after
> {@link #stop} is called.

The `MediaRecorder.stop()` javadoc states the consequence for the degenerate case, and the phrase
generalises:

> Stops recording. Call this after start(). Once recording is stopped, you will have to configure
> it again as if it has just been constructed. Note that a RuntimeException is intentionally
> thrown to the application, if no valid audio/video data has been received when stop() is called.
> This happens if stop() is called immediately after start(). The failure lets the application
> take action accordingly to clean up the output file (delete the output file, for instance),
> **since the output file is not properly constructed when this happens.**

### 2.2 So: is the file playable?

**No.** After a process kill mid-recording, the `.m4a` on disk contains:

- a valid `ftyp` box;
- an `mdat` box whose **size field is a placeholder**, followed by every encoded AAC frame that
  reached `write(2)`;
- **no `moov` box at all**, and — in this project's configuration — not even reserved space where
  one would go.

That last point is worth pinning down, because it decides what a reconstructor would face.
`MPEG4Writer` reserves a `free` box at the head of the file **only for a "streamable" file**, and
streamability is defined solely by `maxFileSize` — `MPEG4Writer.cpp:946-948`, verbatim:

```cpp
    mStreamableFile =
        (mMaxFileSizeLimitBytes != 0 &&
         mMaxFileSizeLimitBytes >= kMinStreamableFileSizeInBytes);
```

with `kMinStreamableFileSizeInBytes = 5 * 1024 * 1024` at `MPEG4Writer.cpp:68`, and the
reservation guarded at `MPEG4Writer.cpp:1030-1034`:

```cpp
    if (mStreamableFile) {
        // Reserve a 'free' box only for streamable file
        seekOrPostError(mFd, mFreeBoxOffset, SEEK_SET);
        writeInt32(mInMemoryCacheSize);
        write("free", 4);
```

`use-recording-session.ts:48` passes no `maxFileSize`, so `mMaxFileSizeLimitBytes` is 0,
`mStreamableFile` is **false**, no `free` box is reserved, and the `moov` would have been appended
to the end of the file at `reset()`. A killed recording is therefore `ftyp` + an unterminated
`mdat` and nothing else.

A normal player rejects this. There is no sample table, so there is no mapping from time to byte
offset, no codec configuration (`esds`), no sample rate, no channel count, no duration — and the
`mdat` length is wrong, so a parser walking the box tree cannot even find where the data ends.
The audio bytes are intact and the file is worthless to anything that reads MP4.

This applies identically to `3gp`: AOSP routes `OUTPUT_FORMAT_THREE_GPP` to the **same**
`MPEG4Writer` (see the `prepareInternal()` switch in [§3](#3-what-expo-audio-can-actually-emit-on-android)).
3GP is an ISO-BMFF derivative with the same `moov` requirement; it is not an escape.

### 2.3 Is there a repair path?

**On-device: nothing.** §8's stack contains no MP4 parser, and the platform offers none that
helps — `MediaExtractor` requires a parseable `moov` to open a file, and `MediaMuxer` writes
containers from decoded samples rather than reconstructing an index over existing ones. Rebuilding
a `moov` means parsing raw AAC frames out of a truncated `mdat` and synthesising `stbl` tables, in
JS, from scratch.

**Off-device:** `untrunc` is the known tool. Its README, verbatim:

> Restore a damaged (truncated) mp4, m4v, mov, 3gp video. Provided you have a similar not broken
> video.

and:

> You need both the broken video and an example working video (ideally from the same camera, if
> not the chances to fix it are slim).

The reference-file requirement is the catch. `untrunc` reconstructs the index by learning frame
structure from a **healthy file produced by the same encoder at the same settings**. Unpocketed
could in principle ship or generate such a reference — a short recording made with identical
`RecordingOptions` on the same device — but that is a bespoke MP4 reconstructor in the app, not a
library call.

> **UNVERIFIED:** whether `untrunc` handles audio-only `.m4a` reliably. Its README mentions
> "audio like m4a" among supported inputs, but it is a video-recovery tool and no audio-only
> success rate is documented. Treat its applicability as untested.

> **UNVERIFIED:** whether any Android media scanner, OEM gallery, or `ExoPlayer`/`media3`
> configuration tolerates a `moov`-less MP4. `media3` is already a transitive dependency via
> `expo-audio`'s player (`AudioUtils.kt:6`), so this is cheap to test and was not tested here.

---

## 3. What `expo-audio` can actually emit on Android

### The enums, verbatim

`AudioRecords.kt:61-69`:

```kotlin
enum class AndroidOutputFormat(val value: String) : Enumerable {
  DEFAULT("default"),
  THREE_GP("3gp"),
  MPEG_4("mpeg4"),
  AMR_NB("amrnb"),
  AMR_WB("amrwb"),
  AAC_ADTS("aac_adts"),
  MPEG2TS("mpeg2ts"),
  WEBM("webm");
```

`AudioRecords.kt:91-97`:

```kotlin
enum class AndroidAudioEncoder(val value: String) : Enumerable {
  DEFAULT("default"),
  AMR_NB("amr_nb"),
  AMR_WB("amr_wb"),
  AAC("aac"),
  HE_AAC("he_aac"),
  AAC_ELD("aac_eld");
```

Both are mirrored in TypeScript at `src/Audio.types.ts:316-324` and `:334`, so every value is
reachable from JS. The file extension is independent of the format: `AudioRecorder.kt:240` builds
the filename from `options.extension` alone —

```kotlin
val filename = "recording-${UUID.randomUUID()}${options.extension}"
```

— and `src/utils/options.ts:44-49` spreads `options.android` **after** the common options, so
`android.extension` overrides the top-level one. `RecordingPresets.LOW_QUALITY` already uses this
to emit `.3gp` on Android (`src/RecordingConstants.ts:96-100`).

### Which AOSP writer each format gets

From `StagefrightRecorder::prepareInternal()` (`StagefrightRecorder.cpp:1179-1206`), verbatim:

```cpp
case OUTPUT_FORMAT_DEFAULT:
case OUTPUT_FORMAT_THREE_GPP:
case OUTPUT_FORMAT_MPEG_4:
case OUTPUT_FORMAT_WEBM:
    status = setupMPEG4orWEBMRecording();
    break;
case OUTPUT_FORMAT_AMR_NB:
case OUTPUT_FORMAT_AMR_WB:
    status = setupAMRRecording();
    break;
case OUTPUT_FORMAT_AAC_ADIF:
case OUTPUT_FORMAT_AAC_ADTS:
    status = setupAACRecording();
    break;
case OUTPUT_FORMAT_RTP_AVP:
    status = setupRTPRecording();
    break;
case OUTPUT_FORMAT_MPEG2TS:
    status = setupMPEG2TSRecording();
    break;
case OUTPUT_FORMAT_OGG:
    status = setupOggRecording();
    break;
```

Note two absences. `OUTPUT_FORMAT_OGG` (11, Opus in Ogg) and `AudioEncoder.OPUS`/`VORBIS` exist
in the platform but **not** in `expo-audio`'s enums, so the Ogg/Opus path is unreachable without
patching. And `MediaRecorder` has **no PCM or WAV output format at all** — the `OutputFormat`
class runs `DEFAULT, THREE_GPP, MPEG_4, RAW_AMR/AMR_NB, AMR_WB, AAC_ADIF, AAC_ADTS,
OUTPUT_FORMAT_RTP_AVP, MPEG_2_TS, WEBM, HEIF, OGG` and nothing else. WAV is not an option on this
API surface in any configuration.

### Candidate-by-candidate

| `android.outputFormat` | Platform constant | AOSP writer | Finalises at stop? | Truncated file decodable? | Reachable from `expo-audio`? | Extension |
| --- | --- | --- | --- | --- | --- | --- |
| `mpeg4` (current) | `MPEG_4` = 2 | `MPEG4Writer` | **Yes** — `moov` + `mdat` size | **No** | Yes | `.m4a` |
| `3gp` | `THREE_GPP` = 1 | `MPEG4Writer` (same) | **Yes** | **No** | Yes | `.3gp` |
| `default` | `DEFAULT` = 0 | `MPEG4Writer` (same case) | **Yes** | **No** | Yes | — |
| `webm` | `WEBM` = 9 | `WebmWriter` | **Yes** — cues, seek head, segment size, duration | **No** | **No** — see below | `.webm` |
| `aac_adts` | `AAC_ADTS` = 6 | `AACWriter` | **No** | **Yes** | Yes, with `aac`/`he_aac`/`aac_eld` | `.aac` |
| `amrnb` | `AMR_NB` = 3 | `AMRWriter` | **No** | **Yes** | Yes, with `default` or `amr_nb` | `.amr` |
| `amrwb` | `AMR_WB` = 4 | `AMRWriter` | **No** | **Yes** | Yes, with `amr_wb` | `.amr` |
| `mpeg2ts` | `MPEG_2_TS` = 8 | `MPEG2TSWriter` | **No** | **Yes** (with a caveat) | Yes, API 26+, with AAC family | `.ts` |

#### `aac_adts` — the one that keeps the current codec

`AACWriter` writes self-describing frames and nothing else. From `AACWriter.cpp`, verbatim:

```cpp
// Each output AAC audio frame to the file contains
// 1. an ADTS header, followed by
// 2. the compressed audio data.
ssize_t dataLength = buffer->range_length();
uint8_t *data = (uint8_t *)buffer->data() + buffer->range_offset();
if (writeAdtsHeader(kAdtsHeaderLength + dataLength) != OK ||
    dataLength != write(mFd, data, dataLength)) {
    err = ERROR_IO;
}
```

Each 7-byte ADTS header carries its own syncword, profile, sample-rate index, channel
configuration and frame length. `AACWriter::reset()` stops the source and joins the writer
thread; the thread closes the fd. **No seek, no patch, no trailer, no index.** A file truncated
at an arbitrary byte is a valid ADTS stream plus at most one damaged trailing frame, and every
decoder resynchronises on the next syncword.

AOSP enforces the encoder pairing — `StagefrightRecorder.cpp:1455-1467`, verbatim:

```cpp
status_t StagefrightRecorder::setupAACRecording() {
    // FIXME:
    // Add support for OUTPUT_FORMAT_AAC_ADIF
    CHECK_EQ(mOutputFormat, OUTPUT_FORMAT_AAC_ADTS);

    CHECK(mAudioEncoder == AUDIO_ENCODER_AAC ||
          mAudioEncoder == AUDIO_ENCODER_HE_AAC ||
          mAudioEncoder == AUDIO_ENCODER_AAC_ELD);
    CHECK(mAudioSource != AUDIO_SOURCE_CNT);

    mWriter = new AACWriter(mOutputFd);
    return setupRawAudioRecording();
}
```

Those are `CHECK` macros, not `return BAD_VALUE` — a mismatch aborts the media server process
rather than returning an error, so a wrong pairing is a hard native crash, not an exception.
`expo-audio` passes the encoder through unvalidated (`AudioRecorder.kt:266-270`).

The codec is unchanged from today — AAC-LC at the same bit rate, in a different wrapper. §3.2's
"never destructively modified" is untouched, and §24's "unchanged original file" promise is as
satisfiable with `.aac` as with `.m4a`.

**Both providers ticket 04 selected accept it.** Research
[04](04-provider-selection.md#input-format-support--all-four-accept-the-recording-as-is) records
AssemblyAI's extension list as including `.aac`, `.amr` and `.3ga`, re-verified here against
[AssemblyAI's own FAQ](https://www.assemblyai.com/docs/faq/what-audio-and-video-file-types-are-supported-by-your-api)
(retrieved 2026-10-07), verbatim:

> .3ga, .8svx, .aac, .ac3, .aif, .aiff, .alac, .amr, .ape, .au, .dss, .flac, .flv, .m4a, .m4b,
> .m4p, .m4r, .mp3, .mpga, .ogg, .oga, .mogg, .opus, .qcp, .tta, .voc, .wav, .wma, .wv

Deepgram's [Supported Audio Formats](https://developers.deepgram.com/docs/supported-audio-formats)
(retrieved 2026-10-07) lists "MP3, MP4, MP2, AAC, WAV, FLAC, PCM, M4A, Ogg, Opus, WebM" and states
it handles "nearly all audio formats and encodings available". **AAC is named explicitly.**

Costs, stated as facts and not weighed: `.aac` carries no container metadata, so **duration is
not stored in the file** — it must be derived by counting frames or measured by a decoder, where
`.m4a` carries it in `mvhd`. The project already tolerates this: `storage.ts:60-76`
(`recoveredSidecar`) sets `durationMs: 0` and says "Duration cannot be recovered without decoding,
so it stays 0 until playback reports one." `MIME_TYPES` at `storage.ts:15-21` already maps
`aac: "audio/aac"`. Seeking in a raw ADTS stream is also approximate rather than exact, which
bears on §17's playback scrubbing.

> **UNVERIFIED:** whether `media3`/ExoPlayer, which backs `expo-audio`'s player, seeks accurately
> in a raw `.aac` ADTS file, and whether it reports a duration for one. Not tested.

#### `amrnb` / `amrwb` — truncation-tolerant, and already ruled out on quality

`AMRWriter` writes a magic header once — `AMRWriter.cpp:88`, verbatim:

```cpp
    const char *kHeader = isWide ? "#!AMR-WB\n" : "#!AMR\n";
```

— then raw frames (`AMRWriter.cpp:239`, a bare `write(mFd, ...)`), then closes the fd
(`AMRWriter.cpp:266`). `AMRWriter::reset()` (`:144`) stops the source and joins the thread. The
file contains **no `lseek` call at all**, so there is no seek, no patch and no index.
Truncation-tolerant for the same reason as ADTS.

The encoder pairing is checked properly here — `StagefrightRecorder.cpp:1480-1493`, verbatim:

```cpp
    if (mOutputFormat == OUTPUT_FORMAT_AMR_NB) {
        if (mAudioEncoder != AUDIO_ENCODER_DEFAULT &&
            mAudioEncoder != AUDIO_ENCODER_AMR_NB) {
            ALOGE("Invalid encoder %d used for AMRNB recording",
                    mAudioEncoder);
            return BAD_VALUE;
        }
    } else {  // mOutputFormat must be OUTPUT_FORMAT_AMR_WB
        if (mAudioEncoder != AUDIO_ENCODER_AMR_WB) {
            ALOGE("Invlaid encoder %d used for AMRWB recording",
                    mAudioEncoder);
            return BAD_VALUE;
        }
    }
```

Research [01](01-provider-upload-limits.md) already closed this door on §12 grounds: AMR-NB is a
narrowband telephony codec and shipping it fails §12's "at least comparable to the device's stock
recorder". AMR-WB is 16 kHz wideband and a less absurd option, but it is still a speech codec at
6.6–23.85 kbps and a quality regression from 96–128 kbps AAC-LC. Listed for completeness; the
quality argument is unchanged by anything in this document.

#### `mpeg2ts` — append-only, with one caveat

`MPEG2TSWriter::reset()` only stops its sources. No seek, no patch, no trailer, no index. PAT and
PMT are re-emitted periodically, verbatim from `MPEG2TSWriter::writeTS()`:

```cpp
if (mNumTSPacketsWritten >= mNumTSPacketsBeforeMeta) {
    writeProgramAssociationTable();
    writeProgramMap();
    mNumTSPacketsBeforeMeta = mNumTSPacketsWritten + 2500;
}
```

Repeating the program tables every 2500 packets is what makes a transport stream recoverable from
an arbitrary cut — the structure a reader needs reappears roughly every 470 KB. Audio-only with an
AAC-family encoder is explicitly permitted — `StagefrightRecorder.cpp:1578-1584`, verbatim:

```cpp
    if (mAudioSource != AUDIO_SOURCE_CNT) {
        if (mAudioEncoder != AUDIO_ENCODER_AAC &&
            mAudioEncoder != AUDIO_ENCODER_HE_AAC &&
            mAudioEncoder != AUDIO_ENCODER_AAC_ELD) {
            return ERROR_UNSUPPORTED;
        }
```

Two caveats. First, `MPEG2TSWriter` writes **through stdio buffering**. Its fd constructor wraps
the descriptor — `MPEG2TSWriter.cpp:447`, `mFile(fdopen(dup(fd), "wb"))` — and that is the
constructor `StagefrightRecorder` uses (`new MPEG2TSWriter(mOutputFd)`), so `internalWrite` takes
the `fwrite` branch at `MPEG2TSWriter.cpp:982-987`:

```cpp
ssize_t MPEG2TSWriter::internalWrite(const void *data, size_t size) {
    if (mFile != NULL) {
        return fwrite(data, 1, size, mFile);
    }

    return (*mWriteFunc)(mWriteCookie, data, size);
```

This is unlike
`MPEG4Writer`/`AACWriter`/`AMRWriter`'s raw `write(2)`. A SIGKILL therefore loses whatever sits in
the stdio buffer — typically a few KB, a fraction of a second. Second, **neither AssemblyAI's nor
Deepgram's documented format list mentions `.ts` or MPEG-2 transport streams.** Research
[01](01-provider-upload-limits.md) records Groq's and OpenAI's lists, which do not either. A
`.ts` recording would need re-containerising before upload — and §8's stack has no remuxer, the
same gap research 01 flagged for chunking.

Also note `AudioRecords.kt:71-88`: `mpeg2ts` silently degrades to `MediaRecorder.OutputFormat.DEFAULT`
below API 26, because the API-level guard returns early only on API 26+ and the `when` block's
`else` branch catches `MPEG2TS` otherwise. On an older device the app would get MP4 while asking
for TS, with no error.

#### `webm` — unreachable

`WebmWriter::addSource()` accepts only two audio codecs — `WebmWriter.cpp:460-471`, verbatim:

```cpp
    const char *vorbis = MEDIA_MIMETYPE_AUDIO_VORBIS;
    const char* opus = MEDIA_MIMETYPE_AUDIO_OPUS;
...
    } else if (!strncasecmp(mime, vorbis, strlen(vorbis)) ||
               !strncasecmp(mime, opus, strlen(opus))) {
...
        ALOGE("Track (%s) other than %s, %s, %s, or %s is not supported",
```

`expo-audio`'s `AndroidAudioEncoder` enum (`AudioRecords.kt:91-97`) exposes neither Vorbis nor
Opus. `StagefrightRecorder::setupAudioEncoder()` (`:2144-2156`) would let AAC through its own switch, but
`WebmWriter` then rejects the track. And WebM would not help anyway. `WebmWriter::reset()` (`WebmWriter.cpp:384-429`) writes the cues
element, then `::lseek`s back to patch the segment size (`:405-410`) and the segment duration
(`:412-419`), then writes a seek head at the segment start (`:421-429`). It is finalised at stop
exactly like MP4, and a killed file is missing all four. Foreclosed twice over.

### The other recording path: `AudioStream`

`expo-audio` also ships `AudioStream` (`AudioStream.kt`), exposed as a separate `Class` in
`AudioModule.kt:632`. It wraps `AudioRecord` directly and emits raw PCM buffers to JS as
`NativeArrayBuffer` (`AudioStream.kt:194-198`), bypassing `MediaRecorder` and containers entirely.
It writes **no file** — the app would own every byte, and therefore own encoding, framing and
durability itself.

It is also not integrated with the recording foreground service: `AudioStream` runs its capture
loop on `Dispatchers.IO` (`AudioStream.kt:43`) and never touches
`AudioRecordingServiceConnection`, so it has no `microphone` foreground service and nothing keeps
the process alive or the mic accessible once the app backgrounds. Recorded here for completeness;
it does not solve §13.

---

## 4. `RecordingOptions.maxFileSize`

### What it is

`AudioRecords.kt:42`, inside the `RecordingOptions` record:

```kotlin
  @Field val maxFileSize: Int?,
```

Applied once, at `AudioRecorder.kt:280-282`:

```kotlin
      options.maxFileSize?.let {
        setMaxFileSize(it.toLong())
      }
```

The TypeScript declaration (`src/Audio.types.ts:539-546`) is Android-only and its doc comment is
stale — it refers to `stopAndUnloadAsync()`, an `expo-av` method that does not exist in
`expo-audio`:

> The desired maximum file size in bytes, after which the recording will stop (but
> `stopAndUnloadAsync()` must still be called after this point).

### What the platform does

`MediaRecorder.setMaxFileSize(long)`'s javadoc, verbatim:

> Sets the maximum filesize (in bytes) of the recording session. Call this after setOutputFormat()
> but before prepare(). After recording reaches the specified filesize, a notification will be
> sent to the {@link android.media.MediaRecorder.OnInfoListener} with a "what" code of
> {@link #MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED} and recording will be stopped. **Stopping
> happens asynchronously, there is no guarantee that the recorder will have stopped by the time
> the listener is notified.**
>
> When using MPEG-4 container (`setOutputFormat(int)` with `OutputFormat#MPEG_4`), it is
> recommended to set maximum filesize that fits the use case. **Setting a larger than required
> filesize may result in a larger than needed output file because of space reserved for MOOV box
> expecting large movie data in this recording session. Unused space of MOOV box is turned into
> FREE box in the output file.**

So: **it stops. It does not rotate.** Rotation is a different API (`setNextOutputFile`), driven by
a different event (`MEDIA_RECORDER_INFO_MAX_FILESIZE_APPROACHING`, 802) — see
[§5](#5-is-segmented-capture-reachable-at-all).

The second paragraph is a side effect worth noting on its own: setting `maxFileSize` **to 5 MiB or
more** makes `MediaRecorder` pre-reserve `moov` space at the head of the file — that is the
"reserved free space at the beginning of a file" the `MPEG4Writer` comment in §1 refers to, and
the `mStreamableFile` test quoted in [§2.2](#22-so-is-the-file-playable) is the exact condition.
It does **not** make the file playable mid-recording: the reservation is a zero-filled `free` box
until `reset()` overwrites it. What it does change is the on-disk layout of a *killed* file, which
matters only to anyone writing a reconstructor.

### What this app would observe

`AudioRecorder` registers itself as the info listener (`AudioRecorder.kt:286`,
`setOnInfoListener(this@AudioRecorder)`), and `onInfo` handles exactly one code —
`AudioRecorder.kt:356-385`, verbatim:

```kotlin
  override fun onInfo(mr: MediaRecorder?, what: Int, extra: Int) {
    when (what) {
      MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED -> {
        val url = currentFileUrl()

        if (useForegroundService) {
          serviceConnection.recordingServiceBinder?.service?.unregisterRecorder(this)
          // Unbind the service connection
          serviceConnection.unbind()
        }

        try {
          recorder?.stop()
        } catch (_: RuntimeException) {
          // Ignore stop errors
        } finally {
          reset()
        }
        emit(
          RECORDING_STATUS_UPDATE,
          mapOf(
            "isFinished" to true,
            "hasError" to true,
            "error" to null,
            "url" to url
          )
        )
      }
    }
  }
```

Precisely what happens, in order:

1. The foreground service is torn down and unbound — so the notification disappears.
2. `recorder?.stop()` is called **explicitly**, in addition to the platform's own asynchronous
   stop. The file therefore **is** properly finalised, with a real `moov`. A `RuntimeException`
   from a double stop is swallowed.
3. `reset()` (`AudioRecorder.kt:211-222`) releases the `MediaRecorder`, nulls it, and clears
   `isRecording`, `isPaused`, `durationAlreadyRecorded`, `startTime` and `isPrepared`.
   `filePath` is **not** cleared, so `recorder.uri` still resolves.
4. One `recordingStatusUpdate` event is emitted.

Four defects in that event, all visible in the source above:

- **`hasError` is `true` on a successful, properly finalised stop.** A listener keying off
  `hasError` sees a failure where there was none.
- **`error` is `null`** alongside it — a message-less error. §32's error handling has nothing to
  show the user.
- **The `"id"` key is absent.** `stopRecording()`'s emit includes it (`AudioRecorder.kt:199`,
  `"id" to id`); this one does not, so `RecordingStatus.id` — declared non-optional at
  `src/Audio.types.ts:268` — arrives `undefined`. The listener is registered on the shared object
  (`src/ExpoAudio.ts:290`), so delivery still works; the payload is what is wrong.
- **There is no way to distinguish this from a real error**, because `onError`
  (`AudioRecorder.kt:339-354`) emits the same `hasError: true` shape and also omits `"id"`.

And one cross-cutting fact: `durationMillis` is not in this event at all. The app's `stop()`
reads duration from `recorder.getStatus().durationMillis` **before** calling `recorder.stop()`
(`use-recording-session.ts:116`, with the comment "the recorder's own counter is reset by
`stop()`"). On the `maxFileSize` path `reset()` has already zeroed `durationAlreadyRecorded` and
`startTime` before JS hears anything, so **the duration is unrecoverable** — `getStatus()` will
report 0.

### The ceiling

`maxFileSize` is `Int?` in Kotlin, not `Long?`, so the largest value expressible is
**2,147,483,647 bytes (~2.1 GB)**. At the project's measured ~96 kbps that is ~49 hours, well
past §34's two-hour target, so the ceiling does not bind in practice.

> **UNVERIFIED:** what happens when JS passes a number above `Int.MAX_VALUE`. The Expo Modules
> type converter would have to reject or truncate it; which, and with what error, was not
> established.

---

## 5. Is segmented capture reachable at all?

### `setNextOutputFile` exists on the platform and is not exposed

`MediaRecorder.setNextOutputFile(File)`'s javadoc, verbatim:

> Sets the next output file to be used when the maximum filesize is reached on the prior output
> {@link #setOutputFile} or {@link #setNextOutputFile}). File should be seekable. After setting
> the next output file, application should not use the file until {@link #stop}. **Application
> must call this after receiving on the {@link android.media.MediaRecorder.OnInfoListener} a
> "what" code of {@link #MEDIA_RECORDER_INFO_MAX_FILESIZE_APPROACHING} and before receiving a
> "what" code of {@link #MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED}.** The file is not used until
> switching to that output. Application will receive
> {@link #MEDIA_RECORDER_INFO_NEXT_OUTPUT_FILE_STARTED} when the next output file is used.
> Application will not be able to set a new output file if the previous one has not been used.
> Application is responsible for cleaning up unused files after {@link #stop} is called.

And the event that opens the window, `MEDIA_RECORDER_INFO_MAX_FILESIZE_APPROACHING` = 802,
verbatim:

> A maximum filesize had been setup and current recorded file size has reached 90% of the limit.
> This is sent once per file upon reaching/passing the 90% limit. To continue the recording,
> applicaiton should use {@link #setNextOutputFile} to set the next output file. Otherwise,
> recording will stop when reaching maximum file size.

`expo-audio@57.0.5` exposes **neither half of this mechanism**:

- `setNextOutputFile` appears nowhere in the package. `grep -rn "setNextOutputFile"` across
  `node_modules/expo-audio/` returns no hits — not in Kotlin, not in Swift, not in TypeScript.
- `AudioRecorder.onInfo` handles only code 801 (`AudioRecorder.kt:358`). Code **802 is not
  handled**, and nothing else in the package observes it. The one window Android permits the call
  in is never surfaced to JS.
- `setMaxDuration` is likewise absent from the package, so the duration-based variant
  (`MEDIA_RECORDER_INFO_MAX_DURATION_REACHED`, 800) is unreachable too — there is no
  `maxDuration` field in the `RecordingOptions` record at `AudioRecords.kt:35-46`.

So **gapless rotation is not achievable through `expo-audio`'s public API.** It needs a patch or a
fork. That is a flat statement about this version of the package, not a judgement.

### What stop/start segmentation would actually cost

The only route through the public API is repeated `stop()` → `prepareToRecordAsync()` → `record()`.
Three consequences, all traceable in source:

**1. A gap of unknown length.** `AudioModule.kt:603-606` exposes `stop` as an `AsyncFunction`, and
`AudioRecorder.stopRecording()` (`AudioRecorder.kt:164-209`) calls `MediaRecorder.stop()`
synchronously — which writes the entire `moov` for the segment just ended. Then
`prepareRecording()` (`AudioRecorder.kt:83-109`) constructs a **fresh `MediaRecorder`**, calls
`prepare()`, and `record()` calls `start()`. Every one of those is a real native operation. No
source consulted quantifies the total; it is a round trip through the media server, and
`MediaRecorder.stop()`'s own javadoc says the recorder "will have to configure it again as if it
has just been constructed."

> **UNVERIFIED — and the one number that decides question 1 of the ticket.** The stop-to-start
> gap must be **measured on target hardware**: time from `recorder.stop()` resolving to
> `recorder.record()` returning, at the project's actual `RecordingOptions`, for a segment of
> realistic length (the `moov` grows with the segment, so a 5-minute segment's `stop()` is slower
> than a 5-second one's). Estimating it from reasoning is not available.

**2. Backgrounded, each rotation tears down and restarts the microphone foreground service.**
This is the harder problem, and it is purely structural. `stopRecording()` calls
`unregisterRecorder` (`AudioRecorder.kt:170-172`), and `AudioRecordingService.unregisterRecorder`
(`AudioRecordingService.kt:160-169`) reads:

```kotlin
  fun unregisterRecorder(recorder: AudioRecorder) {
    synchronized(recorderLock) {
      activeRecorders.removeAll { it.get() == recorder || it.get() == null }

      if (activeRecorders.isEmpty()) {
        stopForegroundWithNotification()
        stopSelf()
      }
    }
  }
```

With one recorder — which is all Unpocketed has — the set empties on every stop, so the service
**stops itself**. The next segment's `prepareRecording()` then calls
`serviceConnection.bindWithService()` (`AudioRecorder.kt:97-99`), which runs
`startServiceAndBind(... ACTION_START_RECORDING)` (`AudioRecordingServiceConnection.kt:77`) and
lands in `startForegroundWithNotification()` → `startForeground(notificationId, notification,
ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)` (`AudioRecordingService.kt:116-137`).

That is **starting a `microphone` foreground service**, from a process in the background, once
per segment — the exact operation AGENTS.md records as forbidden by Android. Rotation while
backgrounded does not merely leave a gap in the audio; it repeatedly re-performs the operation
that makes background recording legal in the first place. `startForegroundWithNotification`
catches the exception and logs it (`AudioRecordingService.kt:130-136`), so the failure mode is a
JS console error and `isRunningForeground = false`, not a thrown promise.

> **UNVERIFIED:** whether the first `stopSelf()` + rebind cycle actually trips
> `ForegroundServiceStartNotAllowedException` in practice, or whether the service's own still-live
> binding keeps it in an allowed state. The source makes the call shape unambiguous; the system's
> verdict on it was not tested.

**3. Each segment lands at an unpredictable path.** `createRecordingFilePath`
(`AudioRecorder.kt:239-253`) mints a fresh UUID per prepare:

```kotlin
    val filename = "recording-${UUID.randomUUID()}${options.extension}"
```

There is no way to ask for a path. The app can only read `recorder.uri` (`AudioModule.kt:565-569`)
after prepare, which means JS must be running and must record each segment's path as it goes — and
a kill between prepare and the app noting the path leaves a file the app has never seen the name of.

### One source-level bug in the stop path, for completeness

`AudioRecordingService.stopRecordingAndService()` (`AudioRecordingService.kt:171-181`) iterates
`activeRecorders` while each `stopRecording()` call mutates that same set via `unregisterRecorder`.
With a single recorder this does not throw — the iterator's `next` pointer is already exhausted
when `hasNext()` is next consulted. With two or more simultaneous recorders it would raise
`ConcurrentModificationException`. **Unpocketed only ever has one recorder**, so this is noted and
not weighed.

---

## 6. The notification Stop button

### 6.1 The path, traced

The action is built in `AudioRecordingService.buildNotification()` (`AudioRecordingService.kt:78-114`):

```kotlin
    val stopIntent = Intent(this, AudioRecordingService::class.java).apply {
      action = ACTION_STOP_RECORDING
    }
    val stopPendingIntent = PendingIntent.getService(
      this,
      0,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
```

attached at `AudioRecordingService.kt:104-108` as `addAction(android.R.drawable.ic_delete, "Stop",
stopPendingIntent)`. It is a `getService` pending intent, so pressing it re-enters
`onStartCommand` (`AudioRecordingService.kt:44-56`):

```kotlin
      ACTION_STOP_RECORDING -> {
        stopRecordingAndService()
      }
```

and `stopRecordingAndService()` (`AudioRecordingService.kt:171-181`):

```kotlin
  private fun stopRecordingAndService() {
    synchronized(recorderLock) {
      activeRecorders.forEach { weakRef ->
        weakRef.get()?.stopRecording()
      }
      activeRecorders.clear()
    }

    stopForegroundWithNotification()
    stopSelf()
  }
```

**Yes — it calls native `stopRecording()` directly**, on the `AudioRecorder` instance, from the
service's `onStartCommand`. JS is not consulted, not awaited, and not required.

### 6.2 What that leaves behind

**The file is finalised correctly.** `stopRecording()` (`AudioRecorder.kt:164-209`) is the same
method `AudioModule.kt:603-606` exposes to JS as `stop`. It calls `recorder?.stop()`
(`AudioRecorder.kt:175`), which drives `MPEG4Writer::reset()` and writes the `moov` and the
`mdat` size. A file stopped from the notification is as playable as one stopped from the app's
own button. On a `RuntimeException` it sets `stopFailed` and omits `url` from the returned
`Bundle` (`AudioRecorder.kt:177-192`), but still calls `reset()` in the `finally`.

**An event is emitted** (`AudioRecorder.kt:194-206`):

```kotlin
    // Emit completion event on the main thread
    appContext?.mainQueue?.launch {
      emit(
        RECORDING_STATUS_UPDATE,
        mapOf(
          "id" to id,
          "isFinished" to true,
          "hasError" to stopFailed,
          "error" to stopError,
          "url" to if (stopFailed) null else url
        )
      )
    }
```

Note `appContext?` — if the `AppContext` has been collected the emit is silently skipped, and the
`Bundle` returned by `stopRecording()` goes to the service, which discards it.

**Whether JS hears it depends on JS being alive and subscribed. Today it is neither.** While the
microphone foreground service is running the process stays alive, so the React runtime normally
survives backgrounding and the emit has somewhere to land. But:

- **This app registers no listener.** The only subscription point is `useAudioRecorder`'s optional
  second argument (`src/ExpoAudio.ts:280-297`), and `use-recording-session.ts:48` calls
  `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` with one argument. `grep -rn
  "recordingStatusUpdate\|addListener"` across `src/` returns nothing. **Every**
  `recordingStatusUpdate` this package emits — notification stop, `maxFileSize`, `onError` — is
  currently dropped on the floor.
- After the stop, `status` in `use-recording-session.ts` stays `"recording"`, and the next press
  of the single toggle button runs `stop()` (`use-recording-session.ts:113-162`) against a
  recorder that has already been `reset()`. `recorder.getStatus().durationMillis` returns 0,
  `recorder.uri` still resolves (`filePath` is not cleared by `reset()`), and `recorder.stop()`
  re-enters `stopRecording()` with `recorder == null` — so `recorder?.stop()` is a no-op, no
  exception is thrown, and `persistRecording` moves a correctly finalised file with
  **`durationMs: 0`**.

So the answer to the ticket's question 4 is: **no, the app cannot trust that it witnessed every
stop** — and the failure is not a lost recording but a recording filed with a wrong duration and a
UI that was out of step until the user pressed the button again.

> **UNVERIFIED:** whether the React Native host survives the user swiping the app out of recents
> while the foreground service runs. The plugin declares the service with no `android:stopWithTask`
> attribute (`plugin/build/withAudio.js:72-78`), whose platform default is `false`, so the service
> is not stopped by task removal — but whether the activity's destruction tears down the JS runtime
> (and therefore fires `AudioModule`'s `OnDestroy`, `AudioModule.kt:334-351`, which calls
> `stopRecording()` on every recorder) was not established. This is the difference between a
> swipe-away producing a finalised file and producing an unplayable one.

### 6.3 In this build, the notification does not exist

The Stop button is unreachable today, for a reason independent of everything above.

`AudioRecorder.useForegroundService` (`AudioRecorder.kt:50`) defaults to `false` and is written in
exactly two places: at construction from `AudioModule.allowsBackgroundRecording`
(`AudioModule.kt:556`), and on every live recorder when `setAudioModeAsync` runs
(`AudioModule.kt:218-220`). `allowsBackgroundRecording` itself is a module field initialised
`false` at `AudioModule.kt:62` and assigned only from the incoming `AudioMode`
(`AudioModule.kt:216`).

`app.json` sets the **plugin's** `enableBackgroundRecording: true`, which is the manifest side —
it adds `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS` and the service declaration
(`plugin/build/withAudio.js:30`, `:39`, `:72-78`). It does **not** set the runtime flag. The only
call to `updateAudioMode` in the app is `use-playback.ts:63`, with
`{ interruptionMode: "doNotMix" }`; `AudioMode.allowsBackgroundRecording` defaults to `false` in
the Kotlin record (`AudioRecords.kt:29`), which `lib/audio-mode.ts:6-13` already documents.

Therefore, as of this commit: `useForegroundService` is `false`, no `AudioRecordingService` is
ever bound, **no notification is ever posted**, there is no Stop action to press — and
`OnActivityEntersBackground` (`AudioModule.kt:296-302`) **pauses** the recorder instead:

```kotlin
      if (!allowsBackgroundRecording) {
        recorders.values.forEach { recorder ->
          if (recorder.isRecording) {
            recorder.pauseRecording()
          }
        }
      }
```

This is PR5's work, not a defect — AGENTS.md places the runtime flag at PR5 deliberately. The
consequence for ticket 05 is that question 4's "who owns a stop that JS never saw" becomes live
**at the moment PR5 sets that flag**, and the listener it needs does not exist yet.

Related, and also unverified: `AudioRecordingServiceConnection.startBindingTimeout`
(`AudioRecordingServiceConnection.kt:39-48`) is defined and **never called** anywhere in the
package — `grep -rn "startBindingTimeout"` matches only its own declaration. This is
[expo#50706](https://github.com/expo/expo/issues/50706), already recorded in AGENTS.md, and it
means the `suspendCoroutine` in `bindWithService` can hang forever. `use-recording-session.ts:83-87`
already wraps `prepareToRecordAsync` in a 10 s JS timeout, which covers it — but note the timeout
fires on the JS side while the native binding attempt continues.

---

## 7. What JS can discover on relaunch

**Nothing, from `expo-audio`.** Every piece of recorder state is in-memory and dies with the
process:

- Recorders live in `private val recorders = ConcurrentHashMap<String, AudioRecorder>()`
  (`AudioModule.kt:55`), populated at construction (`AudioModule.kt:557`). The map is rebuilt
  empty on every process start.
- `AudioRecorder.id` is `UUID.randomUUID().toString()` (`AudioRecorder.kt:45`) — regenerated per
  instance, never persisted.
- `filePath` (`AudioRecorder.kt:39`) is assigned during `setRecordingOptions`
  (`AudioRecorder.kt:284`) from a path containing a **fresh random UUID**
  (`AudioRecorder.kt:240`). Nothing writes it to disk, to `SharedPreferences`, or anywhere else.
- There is no `getRecordings`, no `restoreRecorder`, no "was a recording in flight" query in
  `AudioModule.kt`'s definition. The `Class(AudioRecorder::class)` block
  (`AudioModule.kt:549-630`) exposes construction, prepare, record, pause, stop, status and input
  routing — nothing about recovery.
- `AudioRecorder.getAudioRecorderStatus()` (`AudioRecorder.kt:308-325`) reports on the instance it
  is called on. On a fresh instance it reports `canRecord: false`, `isRecording: false`,
  `durationMillis: 0` — which is indistinguishable from "nothing ever happened".

**The only evidence is the orphan file**, at a path the app must discover by listing a directory,
because the UUID in its name was never recorded anywhere that survived.

What is recoverable from an orphan, from the project's own code:

- `storage.ts:60-76` already implements exactly this shape for a different case — `recoveredSidecar`
  derives id, title ("Recovered recording"), `createdAt` from `file.creationTime ?? file.lastModified`,
  and `durationMs: 0`.
- But **it scans the wrong directory** — see [§8](#8-where-the-in-progress-file-lives).
- And for `mpeg4` output the orphan is unplayable, so "recover-and-finalise" (the ticket's question
  3) means reconstructing a `moov`, not moving a file. Only for the append-only formats in §3 does
  it reduce to a move.

A further wrinkle for any recovery scheme: a finished-but-unfiled recording and a killed-mid-capture
recording **sit in the same directory with the same filename pattern**, since `persistRecording`
(`storage.ts:114-145`) moves the file out only after `recorder.stop()` has returned. A crash between
`stop()` resolving and `source.move(destination)` completing leaves a *playable* orphan in cache;
a crash during capture leaves an *unplayable* one. Distinguishing them requires probing the file,
not reading its name.

---

## 8. Where the in-progress file lives

### The default is cache

`AudioRecords.kt:48-51`:

```kotlin
enum class RecordingDirectory(val value: String) : Enumerable {
  CACHE("cache"),
  DOCUMENT("document")
}
```

`AudioRecorder.kt:239-253`:

```kotlin
  private fun createRecordingFilePath(options: RecordingOptions): String {
    val filename = "recording-${UUID.randomUUID()}${options.extension}"
    val parentDirectory = when (options.directory ?: RecordingDirectory.CACHE) {
      RecordingDirectory.CACHE -> _appContext.cacheDirectory
      RecordingDirectory.DOCUMENT -> _appContext.persistentFilesDirectory
    }
    val directory = File(parentDirectory, "Audio")
```

`?: RecordingDirectory.CACHE` is the default, matching the TypeScript `@default 'cache'` at
`src/Audio.types.ts:386-394`. The two destinations resolve in `expo-modules-core`
(`AppDirectoriesService.kt:16-20`):

```kotlin
  open val cacheDirectory: File
    get() = context.cacheDir

  open val persistentFilesDirectory: File
    get() = context.filesDir
```

### Which one this project gets

**Cache.** `use-recording-session.ts:48` passes `RecordingPresets.HIGH_QUALITY` unchanged, and
that preset (`src/RecordingConstants.ts:69-89`) has no `directory` key. `createRecordingOptions`
(`src/utils/options.ts:44-49`) forwards `directory: options.directory` — i.e. `undefined` — so the
Kotlin elvis takes `CACHE`.

So the in-progress file is at **`<app>/cache/Audio/recording-<uuid>.m4a`**, i.e.
`/data/user/0/<package>/cache/Audio/`. It stays there for the whole recording and is moved to
`Paths.document/recordings/<id>.m4a` only by `persistRecording` (`storage.ts:114-145`), after
`recorder.stop()` has returned.

### Flagged: this is the directory the project already identified as unsafe

Three facts that only matter together:

1. **Android may evict it.** `expo-audio`'s own documentation
   (`src/Audio.types.ts:375-384`) says of `cache`: "a place to store files that can be deleted by
   the system when the device runs low on storage."
2. **The project already knows.** `storage.ts:5-11`, verbatim: "Keep original audio in
   Paths.document: Android may evict Paths.cache (§3.2)." That reasoning applies to stored audio;
   the in-progress file was outside its scope and is in the directory that comment warns about.
   For a two-hour recording the file reaches ~90 MB while sitting there (research
   [04](04-provider-selection.md#2-the-numbers-per-provider)), and low storage is precisely when a
   90 MB cache file becomes an attractive eviction target.
3. **`listPersistedRecordings()` would never find it.** `storage.ts:34-38` builds its directory as
   `new Directory(Paths.document, "recordings")`, and `storage.ts:152-177` lists only that. An
   orphan in `<cache>/Audio/` is invisible to the library, to §15's list, and to the reconcile in
   `features/library/reconcile.ts`.

The one-line change is `directory: 'document'` in the `RecordingOptions` passed at
`use-recording-session.ts:48`, which `createRecordingOptions` already forwards. That moves the
in-progress file to `<app>/files/Audio/` — still not the directory `listPersistedRecordings()`
scans, but no longer evictable. Stated as a fact about the option, not as a proposal.

> **UNVERIFIED:** how aggressively real Android devices and OEM skins actually evict app cache,
> and whether eviction can happen while a file is open for writing. No primary source establishing
> eviction policy for an open fd was found.

---

## 9. What each fact forecloses

Stated as constraints on the decision, not as a decision.

**Progressive writes foreclose "just flush more often."** There is no flush interval to tune and
no data sitting in the app. The audio is already on disk within about a second of being captured.
Any durability work has to address the container, not the write cadence.

**The `moov`-at-stop design forecloses incremental write-to-disk as a *mitigation* for the current
format.** Ticket 05's premise — "the mitigation is incremental write-to-disk" — is already
satisfied by `MediaRecorder` and does not help, because what is missing after a kill is the index,
not the samples. For `mpeg4` the only options are: change format, accept unplayable orphans, or
build a `moov` reconstructor.

**`setNextOutputFile`'s absence forecloses gapless segmentation without patching the package.**
Not "it is awkward" — the API is not bound, and the event that is the only legal moment to call it
is not handled. Segmentation through the public API means stop/start, with a gap of unmeasured
length and, while backgrounded, a microphone-foreground-service restart per segment that Android
is documented to forbid. Ticket 05's question 1 therefore has an asymmetry it did not have when
written: the single-file option costs a format change, and the segment option costs a package fork
or a native module.

**`maxFileSize` forecloses nothing and enables nothing useful here.** It stops the recorder at a
byte count, with a confusing event and a lost duration. It is not a rotation primitive. Its one
relevant side effect is that setting it changes the on-disk layout of a killed file by reserving
`moov` space at the head — which is worth knowing if anyone writes a reconstructor.

**ADTS forecloses nothing on the provider side.** AssemblyAI lists `.aac` explicitly; Deepgram
lists AAC. §21's "send original/correctly encoded audio" and §24's "unchanged original file" both
survive a container change, because the codec and bitstream are identical. What ADTS does
foreclose is in-file duration metadata and exact seeking — which touches §17's scrubbing and means
`durationMs` must come from measurement rather than from the container.

**`mpeg2ts` forecloses direct upload.** No candidate provider's documented format list includes
`.ts`, and §8's stack has no remuxer — the same gap research 01 flagged for chunking.

**`webm`, `ogg`/Opus and WAV are foreclosed outright.** WebM needs a Vorbis or Opus encoder
`expo-audio` does not expose, and finalises at stop anyway; `OutputFormat.OGG` is absent from
`expo-audio`'s enum; and `MediaRecorder` has no PCM or WAV output format in any Android version.
Raw PCM is reachable only through `AudioStream`, which writes no file and has no foreground
service.

**The absence of any recoverable state forecloses a clean §14 story that relies on the library.**
PR5 cannot ask `expo-audio` what was in flight. Recovery has to be a directory scan the app owns,
against a path the app chose — which makes `directory` and the output format joint prerequisites
for it, both settled when recording is built, exactly as the ticket says.

**The cache default forecloses trusting that the orphan is still there.** Whatever recovery PR5
promises, it is promising it about a file in a directory the project's own code already calls
evictable, and that the library's scan does not cover.

**The missing status listener forecloses the assumption behind question 4's premise.** The ticket
says §11 and §14 "must reconcile state on next foreground rather than assume JS witnessed every
stop." Today JS witnesses *no* stop it did not initiate, because no listener is subscribed at all.
That is one `useAudioRecorder` argument, and it has to exist before the notification does.

---

## Sources

### Primary — package source on disk (`expo-audio@57.0.5`)

Rooted at `/home/devon/Projects/UnPocketed/node_modules/expo-audio/`:

- `android/src/main/java/expo/modules/audio/AudioRecorder.kt`
- `android/src/main/java/expo/modules/audio/AudioModule.kt`
- `android/src/main/java/expo/modules/audio/AudioRecords.kt`
- `android/src/main/java/expo/modules/audio/AudioStream.kt`
- `android/src/main/java/expo/modules/audio/AudioUtils.kt`
- `android/src/main/java/expo/modules/audio/service/AudioRecordingService.kt`
- `android/src/main/java/expo/modules/audio/service/AudioRecordingServiceConnection.kt`
- `android/src/main/java/expo/modules/audio/service/BaseServiceConnection.kt`
- `src/Audio.types.ts`, `src/RecordingConstants.ts`, `src/ExpoAudio.ts`, `src/utils/options.ts`
- `plugin/build/withAudio.js`

And `/home/devon/Projects/UnPocketed/node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/services/AppDirectoriesService.kt`.

### Primary — AOSP, retrieved 2026-10-07

Fetched via the `mirrors.aliyun.com` mirror of `android.googlesource.com`, `master`. Every C++ and
Java quote in this document was **grepped out of a locally downloaded copy**, not taken from a
summary, which is where the line numbers come from:

- [`frameworks/base/media/java/android/media/MediaRecorder.java`](https://android.googlesource.com/platform/frameworks/base/+/master/media/java/android/media/MediaRecorder.java)
  — the javadoc the reference pages are generated from; source of every `MediaRecorder` quote here.
- [`frameworks/av/media/libstagefright/MPEG4Writer.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libstagefright/MPEG4Writer.cpp)
- [`frameworks/av/media/libmediaplayerservice/StagefrightRecorder.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libmediaplayerservice/StagefrightRecorder.cpp)
- [`frameworks/av/media/libstagefright/AACWriter.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libstagefright/AACWriter.cpp)
- [`frameworks/av/media/libstagefright/AMRWriter.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libstagefright/AMRWriter.cpp)
- [`frameworks/av/media/libstagefright/MPEG2TSWriter.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libstagefright/MPEG2TSWriter.cpp)
- [`frameworks/av/media/libstagefright/webm/WebmWriter.cpp`](https://android.googlesource.com/platform/frameworks/av/+/master/media/libstagefright/webm/WebmWriter.cpp)

### Other, retrieved 2026-10-07

- [`ponchio/untrunc`](https://github.com/ponchio/untrunc) — README
- [AssemblyAI — What audio and video file types are supported by your API?](https://www.assemblyai.com/docs/faq/what-audio-and-video-file-types-are-supported-by-your-api)
- [Deepgram — Supported Audio Formats](https://developers.deepgram.com/docs/supported-audio-formats)
- [expo/expo#50706](https://github.com/expo/expo/issues/50706) — `startBindingTimeout()` never called

### This repo

- `src/features/recording/use-recording-session.ts`, `storage.ts`
- `src/lib/audio-mode.ts`, `src/features/playback/use-playback.ts`
- `app.json`
- Prior research: [01](01-provider-upload-limits.md), [02](02-expo-audio-background-recording.md),
  [04](04-provider-selection.md)
