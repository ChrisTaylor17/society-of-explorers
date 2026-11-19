"""Render a reviewed Archivist edit with the cached local media runtimes."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import subprocess
from textwrap import fill

ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / 'verification/web/scripts'
CONTENT = ROOT / 'content/clips'
EVIDENCE = ROOT / 'verification/web/evidence'
ENV = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'LANG') if key in os.environ}


def read(path, maximum=64 * 1024 * 1024):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or not info.st_blocks or not 0 < info.st_size <= maximum:
        raise ValueError(f'Unavailable resident source {path}')
    return path.read_bytes()


def timestamp(frame, fps):
    ms = frame * 1000 // fps
    minutes, remainder = divmod(ms, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f'00:{minutes:02}:{seconds:02}.{milliseconds:03}'


def caption_text(edit):
    cues = []
    end = 0
    for index, scene in enumerate(edit['scenes'], start=1):
        words = scene['transcript']
        if scene['start'] != end or scene['end'] <= end or not words.strip() or any(c in words for c in '<>\r\n'):
            raise ValueError('Caption intervals or text require review')
        cues.append(f"field-note-{index}\n{timestamp(end, edit['fps'])} --> "
                    f"{timestamp(scene['end'], edit['fps'])}\n{fill(words, width=44)}")
        end = scene['end']
    if end != edit['source']['outFrame'] - edit['source']['inFrame']:
        raise ValueError('The captions must cover the full retained frame range')
    return 'WEBVTT\n\n' + '\n\n'.join(cues) + '\n'


def render(run, clip):
    destination = EVIDENCE / run
    destination.mkdir(mode=0o700, exist_ok=False)
    edit_path = CONTENT / f'{clip}-edit.json'
    edit = json.loads(read(edit_path))
    filename = edit['source']['file']
    if not re.fullmatch(r'[a-z0-9-]+\.(?:mp4|m4v)', filename):
        raise ValueError('The edit must use a local publisher file')
    source = (EVIDENCE / 'source-media' if clip in {'which-height', 'new-species'} else CONTENT) / filename
    if sha256(read(source)).hexdigest() != edit['source']['sha256']:
        raise ValueError('The publisher file differs from the reviewed original')
    if (edit['width'], edit['height'], edit['fps']) != (720, 1280, 25) or edit['layout']['audio'] != 'silent' or not 800_000 <= edit['bitrate'] <= 1_300_000:
        raise ValueError('Unsupported render geometry or audio plan')
    source_fps = edit['source'].get('fps', edit['fps'])
    ntsc = edit['source'].get('ntsc', False)
    if type(ntsc) is not bool or (ntsc and source_fps != 30):
        raise ValueError('Unsupported NTSC timebase')
    source_clock = 1001 if ntsc else 1000
    first_presentation_frame = edit['source'].get('firstPresentationFrame', 0)
    if source_fps not in (25, 30) or type(first_presentation_frame) is not int or not 0 <= first_presentation_frame <= source_fps:
        raise ValueError('Unsupported original frame rate or presentation start')
    captions = caption_text(edit)
    renderer = TOOLS / 'reel-render-browser.mjs'
    av_source = TOOLS / 'reel-avfoundation.swift'
    guard = TOOLS / 'deny-build-network.cjs'
    pins = {str(path.relative_to(ROOT)): sha256(read(path)).hexdigest()
            for path in (edit_path, source, renderer, av_source, guard, Path(__file__).resolve())}
    av = destination / 'media-samples'
    packets = destination / 'source-samples.json'
    encoded = destination / 'encoded-samples.json'
    asset = destination / f'{clip}.mp4'
    checked = destination / 'encoded-readback.json'
    commands = [
        ['/usr/bin/swiftc', '-suppress-warnings', '-parse-as-library', '-module-cache-path', destination / 'swift-cache',
         av_source, '-o', av],
        [av, 'read', source, packets],
        ['node', '--require', guard, renderer, edit_path, packets, destination],
        [av, 'write', encoded, asset],
        [av, 'read', asset, checked],
    ]
    with (destination / 'render.log').open('xb') as log:
        for command in commands:
            subprocess.run(command, check=True, timeout=115, cwd=ROOT, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    source_packets = json.loads(read(packets))
    result = json.loads(read(checked))
    original_output = json.loads(read(encoded))
    expected = edit['source']['outFrame'] - edit['source']['inFrame']
    duration = expected * 1000 // edit['fps']
    if ((result['width'], result['height'], result['fps'], result['audioTracks'], result['durationMs']) != (720, 1280, 25, 0, duration)
            or len(result['samples']) != expected
            or any(sample['pts'] != i * 40_000 or sample['duration'] != 40_000 for i, sample in enumerate(result['samples']))
            or [sample['bytes'] for sample in result['samples']] != [sample['bytes'] for sample in original_output['samples']]):
        raise ValueError('The encoded MP4 does not match the rendered samples')
    timing = json.loads(read(destination / 'render-timing.json'))
    source_times = [round((first_presentation_frame + i * source_fps // edit['fps']) * 1000 * source_clock / source_fps)
                    for i in range(edit['source']['inFrame'], edit['source']['outFrame'])]
    if timing['sourceTimes'] != source_times:
        raise ValueError('The decoded source time mapping changed')
    vtt = destination / f'{clip}.vtt'
    vtt.write_text(captions, encoding='utf-8')
    for name, digest in pins.items():
        if sha256(read(ROOT / name)).hexdigest() != digest:
            raise ValueError(f'Render input changed during editing: {name}')
    source_start_ms = round(source_times[0] / 1000)
    report = {
        'status': 'RENDERED', 'inputs': pins, 'browser': timing['chromium'],
        'source': {key: source_packets[key] for key in ('width', 'height', 'fps', 'durationMs', 'audioTracks')},
        'asset': {key: result[key] for key in ('width', 'height', 'fps', 'durationMs', 'audioTracks')},
        'decodedSourceFrames': len(timing['sourceTimes']), 'outputFrames': len(result['samples']),
        'sourceStartMs': source_start_ms,
        'sourceEndMs': source_start_ms + duration,
        'outputSha256': sha256(read(asset, 4_000_000)).hexdigest(),
        'captionSha256': sha256(read(vtt)).hexdigest(),
        'sourceColor': timing['sourceColor'], 'codec': timing['encoder'],
    }
    (destination / 'render.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f"Rendered {expected} frames, {duration / 1000:.3f} seconds, one video track and zero audio tracks")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run')
    parser.add_argument('--clip', choices=['night-sky-traffic', 'telescope-first-tilt', 'which-height', 'new-species'], default='night-sky-traffic')
    args = parser.parse_args()
    if not re.fullmatch(r'reel-(?:paranal|elt|lava|isopod)-[a-z0-9-]{1,24}', args.run):
        parser.error('Choose a fresh Archivist evidence run name')
    render(args.run, args.clip)
