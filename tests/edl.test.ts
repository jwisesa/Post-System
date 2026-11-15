import { expect, it } from "vitest";
import { framesToTc, parseEdl, pullListRows, shotName, tcToFrames, toEdl, vfxBreakdownRows } from "@/lib/edl/edl";
import { parseTimeline } from "@/lib/edl/xml";

const EDL = `TITLE: REEL_1_LOCK
FCM: NON-DROP FRAME

001  A001C003 V     C        01:00:10:00 01:00:12:00 01:00:00:00 01:00:02:00
* FROM CLIP NAME: 12-3-A
* SOURCE FILE: /Volumes/RAW/A001C003_240101_R1AB.mov
* LOC: 01:00:00:12 RED     VFX_010 wire removal
002  A002C001 A     C        02:00:00:00 02:00:05:00 01:00:02:00 01:00:07:00
* FROM CLIP NAME: audio only
003  B004C010 V2    D    024 00:00:00:10 00:00:03:10 01:00:02:00 01:00:05:00
M2   B004C010       048.0                00:00:00:10
 |C:ResolveColorBlue |M:VFX_020 |D:1
* some note
`;

it("parses video events with clip name, source file, locators and retime; skips audio", () => {
  const edl = parseEdl(EDL);
  expect(edl.title).toBe("REEL_1_LOCK");
  expect(edl.dropFrame).toBe(false);
  expect(edl.events.map((e) => e.num)).toEqual(["001", "003"]);
  expect(edl.events[0]).toMatchObject({ reel: "A001C003", clipName: "12-3-A", sourceFile: "A001C003_240101_R1AB.mov", locator: "VFX_010 wire removal", locatorColor: "RED", srcIn: "01:00:10:00" });
  expect(edl.events[1]).toMatchObject({ track: "V2", transition: "D024", locator: "VFX_020", locatorColor: "BLUE", retime: "048.0 fps", comments: ["some note"], clipName: "B004C010" });
});

it("converts timecode both ways and clamps below zero", () => {
  expect(tcToFrames("01:00:10:12", 24)).toBe(86652);
  expect(framesToTc(86652, 23.976)).toBe("01:00:10:12");
  expect(framesToTc(-5, 25)).toBe("00:00:00:00");
});

it("names shots from a pattern", () => {
  expect(shotName("PRJ_SC012_SH####", 2)).toBe("PRJ_SC012_SH0030");
});

it("builds a pull list with handles and a VFX breakdown", () => {
  const { events } = parseEdl(EDL);
  const pull = pullListRows(events, { fps: 24, handles: 12 });
  expect(pull[1].slice(6, 13)).toEqual(["01:00:10:00", "01:00:12:00", "01:00:09:12", "01:00:12:12", "48", "72", "12"]);
  // handles cannot push the pull-in before 00:00:00:00
  expect(pull[2].slice(8, 12)).toEqual(["00:00:00:00", "00:00:03:22", "72", "94"]);
  expect(pull[1][1]).toBe("VFX_010 wire removal");

  const vfx = vfxBreakdownRows(events, { fps: 24, handles: 0, pattern: "PRJ_SH###", start: 10, step: 10 });
  expect(vfx.slice(1).map((r) => [r[0], r[5], r[7]])).toEqual([["PRJ_SH010", "48", ""], ["PRJ_SH020", "72", "Y"]]);
});

const XMEML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="seq">
    <name>REEL_1 &amp; 2</name>
    <rate><timebase>24</timebase><ntsc>TRUE</ntsc></rate>
    <timecode><string>01:00:00:00</string><frame>86400</frame><displayformat>NDF</displayformat></timecode>
    <media><video>
      <track>
        <clipitem id="c1">
          <name>12-3-A</name><enabled>TRUE</enabled>
          <start>0</start><end>48</end><in>240</in><out>288</out>
          <file id="f1">
            <name>A001C003.mov</name><pathurl>file://localhost/Volumes/RAW/A001C003.mov</pathurl>
            <timecode><string>01:00:00:00</string><frame>86400</frame><reel><name>A001</name></reel></timecode>
          </file>
          <marker><name>VFX_010</name><comment>wire</comment><in>250</in><out>-1</out></marker>
        </clipitem>
        <transitionitem><start>36</start><end>60</end></transitionitem>
        <clipitem id="c2">
          <name>12-3-A again</name>
          <start>-1</start><end>120</end><in>300</in><out>372</out>
          <file id="f1"/>
          <filter><effect><name>Time Remap</name><parameter><parameterid>speed</parameterid><value>50</value></parameter></effect></filter>
        </clipitem>
      </track>
      <track>
        <clipitem id="c3"><name>off</name><enabled>FALSE</enabled><start>0</start><end>10</end><in>0</in><out>10</out></clipitem>
      </track>
    </video>
    <audio><track><clipitem id="a1"><name>sound</name><start>0</start><end>48</end><in>0</in><out>48</out></clipitem></track></audio>
    </media>
  </sequence>
</xmeml>`;

it("reads FCP7 XML: file timecode, shared file ids, transition edges, markers, retime", () => {
  const edl = parseTimeline(XMEML);
  expect(edl).toMatchObject({ title: "REEL_1 & 2", fps: "23.976", dropFrame: false });
  expect(edl.events).toHaveLength(2);
  expect(edl.events[0]).toMatchObject({ num: "001", reel: "A001", clipName: "12-3-A", sourceFile: "A001C003.mov", track: "V1", srcIn: "01:00:10:00", srcOut: "01:00:12:00", recIn: "01:00:00:00", recOut: "01:00:02:00", locator: "VFX_010" });
  expect(edl.events[1]).toMatchObject({ reel: "A001", srcIn: "01:00:12:12", srcOut: "01:00:15:12", recIn: "01:00:02:00", recOut: "01:00:05:00", retime: "50%" });
});

const fcpxml = (tcStart: string, o1: string, o2: string) => `<?xml version="1.0"?>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/25s"/>
    <asset id="a1" name="A001C003" start="3600s" duration="100s" hasVideo="1"><media-rep kind="original-media" src="file:///Volumes/RAW/A001%20C003.mov"/></asset>
    <asset id="a2" name="B004C010" start="0s" hasVideo="1" src="file:///Volumes/RAW/B004C010.mov"/>
    <asset id="a3" name="music" hasVideo="0" src="file:///music.wav"/>
  </resources>
  <library><event><project name="CUT_v3">
    <sequence format="r1" tcStart="${tcStart}" tcFormat="NDF">
      <spine>
        <asset-clip name="12-3-A" ref="a1" offset="${o1}" start="3610s" duration="2s">
          <marker start="3611s" duration="1/25s" value="VFX_010"/>
          <asset-clip name="overlay" ref="a2" lane="1" offset="3611s" start="4/25s" duration="1s"/>
          <asset-clip name="music" ref="a3" lane="-1" offset="3610s" duration="2s"/>
        </asset-clip>
        <gap name="Gap" offset="${o2}" start="3600s" duration="3s"/>
      </spine>
    </sequence>
  </project></event></library>
</fcpxml>`;

it("reads FCPXML: rational times, connected clips, markers; offsets zero-based or in the tcStart domain", () => {
  for (const edl of [parseTimeline(fcpxml("3600s", "0s", "2s")), parseTimeline(fcpxml("3600s", "3600s", "3602s"))]) {
    expect(edl).toMatchObject({ title: "CUT_v3", fps: "25" });
    expect(edl.events).toHaveLength(2);
    expect(edl.events[0]).toMatchObject({ reel: "A001C003", clipName: "12-3-A", sourceFile: "A001 C003.mov", track: "V1", srcIn: "01:00:10:00", srcOut: "01:00:12:00", recIn: "01:00:00:00", recOut: "01:00:02:00", locator: "VFX_010" });
    expect(edl.events[1]).toMatchObject({ reel: "B004C010", track: "V2", srcIn: "00:00:00:04", srcOut: "00:00:01:04", recIn: "01:00:01:00", recOut: "01:00:02:00" });
  }
});

it("still reads an EDL and rejects unknown XML", () => {
  expect(parseTimeline(EDL).events).toHaveLength(2);
  expect(() => parseTimeline("<html></html>")).toThrow();
});

it("writes an EDL that reads back: record kept without handles, relaid from 01:00:00:00 with handles", () => {
  const { events } = parseEdl(EDL);
  const same = parseEdl(toEdl("CUT", events, { fps: 24, handles: 0, pattern: "PRJ_SH###" }));
  expect(same.title).toBe("CUT");
  expect(same.events.map((e) => [e.reel, e.clipName, e.sourceFile, e.srcIn, e.srcOut, e.recIn, e.recOut, e.locator, e.locatorColor, e.retime])).toEqual([
    ["A001C003", "12-3-A", "A001C003_240101_R1AB.mov", "01:00:10:00", "01:00:12:00", "01:00:00:00", "01:00:02:00", "PRJ_SH010", "RED", ""],
    ["B004C010", "B004C010", "", "00:00:00:10", "00:00:03:10", "01:00:02:00", "01:00:05:00", "PRJ_SH020", "BLUE", "048.0 fps"],
  ]);

  const pull = parseEdl(toEdl("CUT", events, { fps: 24, handles: 12 })).events;
  expect(pull.map((e) => [e.srcIn, e.srcOut, e.recIn, e.recOut])).toEqual([
    ["01:00:09:12", "01:00:12:12", "01:00:00:00", "01:00:03:00"],
    ["00:00:00:00", "00:00:03:22", "01:00:03:00", "01:00:06:22"],
  ]);
});
