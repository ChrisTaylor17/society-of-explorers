"""Check the first Root Kernel reading against the pinned archive and publisher page."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import stat
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'content/root-kernel/philemon.web-classic.json'
ARCHIVE_SHA = '05b0440bd8994dd4da7cc53dd8167a759ed7c09617e4a562c64eb9b3343589c8'
MEMBER = '87-PHMeng-web.usfm'
MEMBER_SHA = '9c9148cf45eee6558410a74f58804de3793eb5d26c394e291634a47fb9b50a47'
PUBLISHER_URL = 'https://ebible.org/eng-web/PHM01.htm'


def resident_bytes(path, limit):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or not info.st_blocks or not 0 < info.st_size <= limit:
        raise ValueError(f'Expected a bounded resident file: {path}')
    return path.read_bytes()


def digest(content):
    return hashlib.sha256(content).hexdigest()


def space(text):
    return ' '.join(text.split())


def from_usfm(raw):
    paragraphs, notes = [], []
    title = None
    for line in raw.decode('utf-8-sig').splitlines():
        line = line.rstrip()
        if line.startswith(r'\mt1 '):
            title = line[5:]
        elif line == r'\p':
            paragraphs.append([])
        elif match := re.fullmatch(r'\\v (\d+) (.+)', line):
            number, verse = int(match[1]), match[2]
            for note in re.finditer(r'\\f \+ \\fr (1:\d+) \\ft ([^\\]+)\\f\*', verse):
                if note[1] != f'1:{number}':
                    raise ValueError('Publisher footnote points to another verse')
                notes.append({'verse': number, 'text': space(note[2])})
            verse = re.sub(r'\\f \+ \\fr 1:\d+ \\ft [^\\]+\\f\*', '', verse)
            verse = re.sub(r'\\w ([^|\\]+)\|strong="[^"]+"\\w\*', r'\1', verse)
            if '\\' in verse or not paragraphs:
                raise ValueError(f'Unexpected source markup in verse {number}')
            paragraphs[-1].append({'verse': number, 'text': space(verse)})
        elif line and not re.match(r'\\(?:id PHM |ide UTF-8$|h Philemon$|toc[123] |c 1$)', line):
            raise ValueError('Unexpected book or chapter structure in pinned USFM')
    if title != 'Paul’s Letter to Philemon' or [v['verse'] for p in paragraphs for v in p] != list(range(1, 26)):
        raise ValueError('Wrong book title or verse sequence')
    return title, paragraphs, notes


def from_publisher(page):
    def text(fragment):
        return space(html.unescape(re.sub(r'<[^>]+>', '', fragment)))

    result = []
    for paragraph in re.findall(r"<div class='p'>(.*?)</div>", page, re.S):
        paragraph = re.sub(r'<a href="#FN\d+" class="notemark">.*?</a>', '', paragraph, flags=re.S)
        parts = re.split(r'<span class="verse" id="V(\d+)">\d+&#160;</span>', paragraph)
        if parts[0].strip():
            raise ValueError('Unexpected publisher paragraph before verse')
        result.append([{'verse': int(parts[i]), 'text': text(parts[i + 1])} for i in range(1, len(parts), 2)])
    notes = [
        {'verse': int(number), 'text': text(note)}
        for number, note in re.findall(r'class="notebackref" href="#V\d+">1:(\d+)</a>\s*<span class="ft">(.*?)</span>', page, re.S)
    ]
    return result, notes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('publisher_html', type=Path)
    parser.add_argument('--write', action='store_true', help='Create the checked edition file once')
    args = parser.parse_args()
    if digest(resident_bytes(args.archive, 4_000_000)) != ARCHIVE_SHA:
        raise ValueError('Different edition archive; review the new source before importing')
    with ZipFile(args.archive) as archive:
        raw = archive.read(MEMBER)
    if digest(raw) != MEMBER_SHA:
        raise ValueError('Philemon source hash mismatch')
    title, paragraphs, notes = from_usfm(raw)
    publisher = resident_bytes(args.publisher_html, 60_000)
    if (paragraphs, notes) != from_publisher(publisher.decode('utf-8-sig')):
        raise ValueError('Publisher’s rendered verses or notes differ from the USFM projection')
    edition = {
        'edition': 'World English Bible Classic',
        'editionId': 'eng-web',
        'title': title,
        'chapter': 1,
        'publisherUrl': PUBLISHER_URL,
        'rightsUrl': 'https://ebible.org/eng-web/webfaq.htm',
        'sourceMemberSha256': MEMBER_SHA,
        'paragraphs': paragraphs,
        'footnotes': notes,
    }
    data = (json.dumps(edition, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if args.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with OUT.open('xb') as file:
            file.write(data)
    if resident_bytes(OUT, 20_000) != data:
        raise ValueError('Packaged edition differs from the verified source projection')
    print(json.dumps({
        'status': 'PASS', 'verses': sum(map(len, paragraphs)), 'paragraphs': len(paragraphs),
        'publisherFootnotes': len(notes), 'archiveSha256': ARCHIVE_SHA, 'sourceMemberSha256': MEMBER_SHA,
        'publisherHtmlSha256': digest(publisher), 'editionSha256': digest(data),
    }, indent=2))


if __name__ == '__main__':
    main()
