import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEdl, buildEvents, buildOtio, buildXmeml, parseFps, timecode, toFrames, xmlEscape,
} from "./handoff.mjs";

const FPS24 = parseFps("24");
const NTSC = parseFps("24000/1001");

function eventsFixture() {
  const manifest = {
    scenes: [
      {
        slug: "how_we_met", sourceAbs: "/media/take2.mp4", start: 0, end: 6.5,
        card: "How did you meet?", cardDuration: 2.5,
        reasoning: "clean take", expectEnding: "it was perfect",
      },
      {
        slug: "favorite_memory", sourceAbs: "/media/take3.mp4", start: 1, end: 7,
        reasoning: "single take", jcut: 1.0, card: "Favorite memory?", cardDuration: 2.5,
      },
    ],
  };
  return buildEvents(manifest, { cardPathFor: (s) => `/media/cards/${s.slug}.mp4` });
}

test("parseFps handles rational, integer, and detects NTSC", () => {
  assert.equal(FPS24.timebase, 24);
  assert.equal(FPS24.ntsc, false);
  assert.equal(NTSC.timebase, 24);
  assert.equal(NTSC.ntsc, true);
  assert.ok(Math.abs(NTSC.rate - 23.976) < 0.001);
  assert.throws(() => parseFps("0"));
});

test("timecode is non-drop HH:MM:SS:FF at the nominal timebase", () => {
  assert.equal(timecode(0, 24), "00:00:00:00");
  assert.equal(timecode(toFrames(6.5, 24), 24), "00:00:06:12");
  assert.equal(timecode(24 * 3600 + 24 * 60 + 25, 24), "01:01:01:01");
});

test("buildEvents flattens cards + scenes with running record times", () => {
  const events = eventsFixture();
  assert.equal(events.length, 4); // card, scene, card, scene
  assert.deepEqual(events.map((e) => e.kind), ["card", "scene", "card", "scene"]);
  assert.equal(events[0].recIn, 0);
  assert.equal(events[0].recOut, 2.5);
  assert.equal(events[1].recIn, 2.5);
  assert.equal(events[1].recOut, 9);
  assert.equal(events[3].recOut, 17.5); // 2.5 + 6.5 + 2.5 + 6 — J-cut does NOT trim the handoff
  assert.match(events[3].marker.comment, /intended J-cut/);
});

test("buildEvents can exclude cards", () => {
  const manifest = { scenes: [{ slug: "a", sourceAbs: "/m/a.mp4", start: 0, end: 2, card: "X" }] };
  const events = buildEvents(manifest, { cardPathFor: () => "/never", includeCards: false });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "scene");
});

test("EDL: header, one event block per clip, correct timecode math", () => {
  const edl = buildEdl(eventsFixture(), { title: "T", ...FPS24 });
  assert.match(edl, /^TITLE: T\nFCM: NON-DROP FRAME/);
  assert.equal((edl.match(/^\d{3} {2}AX/gm) ?? []).length, 4);
  assert.ok(edl.includes("00:00:02:12 00:00:09:00")); // scene 1 record in/out
  assert.ok(edl.includes("* FROM CLIP NAME: how_we_met"));
  assert.ok(edl.includes("* SOURCE FILE: /media/take2.mp4"));
});

test("xmeml: NTSC flag, file dedup by reference, sequence-level markers", () => {
  const xml = buildXmeml(eventsFixture(), { title: "T & Co", ...NTSC, width: 1280, height: 720 });
  assert.ok(xml.includes("<ntsc>TRUE</ntsc>"));
  assert.ok(xml.includes("<name>T &amp; Co</name>"));
  // Each unique path gets one full <file> def per media type; reuses are refs.
  assert.equal((xml.match(/<pathurl>/g) ?? []).length, 8); // 4 unique files × video+audio defs
  assert.equal((xml.match(/<marker>/g) ?? []).length, 2); // scenes only, sequence level
  assert.ok(xml.includes("<displayformat>NDF</displayformat>"));
  assert.ok(xml.includes("file:///media/take2.mp4"));
});

test("otio: golden-sample shape — Timeline/Stack/Track/Clip with rational times", () => {
  const otio = JSON.parse(buildOtio(eventsFixture(), { title: "T", rate: FPS24.rate, manifestPath: "edit.json" }));
  assert.equal(otio.OTIO_SCHEMA, "Timeline.1");
  assert.equal(otio.tracks.OTIO_SCHEMA, "Stack.1");
  const track = otio.tracks.children[0];
  assert.equal(track.OTIO_SCHEMA, "Track.1");
  assert.equal(track.kind, "Video");
  assert.equal(track.children.length, 4);
  const clip = track.children[1];
  assert.equal(clip.OTIO_SCHEMA, "Clip.1");
  assert.equal(clip.media_reference.OTIO_SCHEMA, "ExternalReference.1");
  assert.equal(clip.media_reference.target_url, "file:///media/take2.mp4");
  assert.deepEqual(clip.source_range.start_time, { OTIO_SCHEMA: "RationalTime.1", rate: 24, value: 0 });
  assert.equal(clip.source_range.duration.value, toFrames(6.5, 24));
  assert.equal(clip.markers[0].OTIO_SCHEMA, "Marker.2");
  assert.match(clip.markers[0].metadata.ripple.comment, /clean take/);
});

test("otio: clip markers sit in the clip's source_range space, not 0-based", () => {
  // OTIO spec: "The marked_range of a Marker on a Clip is in the Clip's time
  // frame (same as the Clip's source_range)". Scene 2 starts at src 1.0s, so
  // its head marker must be at frame 24 — matching source_range.start_time.
  const otio = JSON.parse(buildOtio(eventsFixture(), { title: "T", rate: FPS24.rate, manifestPath: "edit.json" }));
  const scene2 = otio.tracks.children[0].children[3];
  assert.equal(scene2.name, "favorite_memory");
  assert.equal(scene2.source_range.start_time.value, 24);
  assert.deepEqual(scene2.markers[0].marked_range.start_time, scene2.source_range.start_time);
});

test("xmlEscape covers the five", () => {
  assert.equal(xmlEscape(`<a & "b">'`), "&lt;a &amp; &quot;b&quot;&gt;&apos;");
});
