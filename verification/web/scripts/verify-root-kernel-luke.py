"""Verify the packaged Good Samaritan excerpt against the publisher's edition."""
import argparse
from hashlib import sha256
import html
import json
from pathlib import Path
import re
import runpy
from urllib.parse import urljoin
from zipfile import ZipFile

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[3]
OUT = ROOT / 'content/root-kernel/luke-good-samaritan.web-classic.json'
prior = runpy.run_path(str(SCRIPT.with_name('verify-root-kernel-philemon.py')))
resident_bytes, space = prior['resident_bytes'], prior['space']
ARCHIVE_SHA = prior['ARCHIVE_SHA']
MEMBER = '72-LUKeng-web.usfm'
MEMBER_SHA = '5764741dfbaf6d2fd946881e3ea14e03b000ab82111a680627b4f9fed1e61c4f'
PUBLISHER_URL = 'https://ebible.org/eng-web/LUK10.htm'
REFERENCES = {'Deuteronomy 6:5': 'DEU06.htm#V5', 'Leviticus 19:18': 'LEV19.htm#V18'}
VERSE = re.compile(r'\\v (\d+) (.+)')


def markup(text, verse, notes):
    cross_reference = r'\\x \+ \\xo 10:(\d+) \\xt ([^\\]+)\\x\*'
    for source, label in re.findall(cross_reference, text):
        if int(source) != verse or label not in REFERENCES:
            raise ValueError('Unexpected reference in the selected text')
        notes.append({'verse': verse, 'text': label, 'href': urljoin(PUBLISHER_URL, REFERENCES[label])})
    text = re.sub(cross_reference, '', text)
    text = re.sub(r'\\\+?w ([^|\\]+)\|strong="[^"]+"\\\+?w\*', r'\1', text)
    text = text.replace('\\wj ', '').replace('\\wj*', '')
    if '\\' in text:
        raise ValueError(f'Unexpected markup in verse {verse}')
    return space(text)


def from_usfm(raw):
    chapter = re.search(r'^\\c 10\s*\n(.*?)^\\c 11\b', raw.decode('utf-8-sig'), re.M | re.S)[1]
    groups, notes, selected = [[]], [], None
    for line in chapter.splitlines():
        line = line.rstrip()
        if match := VERSE.fullmatch(line):
            verse = int(match[1])
            if verse > 37:
                break
            if verse >= 25:
                selected = {'verse': verse, 'text': markup(match[2], verse, notes)}
                groups[-1].append(selected)
        elif selected and line == r'\p':
            groups.append([])
        elif selected and line.startswith(r'\p '):
            selected['text'] += '\n\n' + markup(line[3:], selected['verse'], notes)
        elif selected and line:
            raise ValueError('Unexpected continuation in the selected chapter')
    return [group for group in groups if group], notes


def from_publisher(page):
    groups, selected = [], None

    def text(fragment):
        return space(html.unescape(re.sub(r'<[^>]+>', '', fragment)))

    for paragraph in re.findall(r"<div class='p'>(.*?)</div>", page, re.S):
        paragraph = re.sub(r'<a href="#FN\d+" class="notemark">.*?</a>', '', paragraph, flags=re.S)
        parts = re.split(r'<span class="verse" id="V(\d+)">\d+&#160;</span>', paragraph)
        if selected and parts[0].strip():
            selected['text'] += ('\n\n' if len(parts) == 1 else ' ') + text(parts[0])
        group = []
        for i in range(1, len(parts), 2):
            verse = int(parts[i])
            if verse > 37:
                return groups, publisher_references(page)
            if verse >= 25:
                selected = {'verse': verse, 'text': text(parts[i + 1])}
                group.append(selected)
        if group:
            groups.append(group)
    raise ValueError('The selected chapter did not end at the expected boundary')


def publisher_references(page):
    return [{'verse': int(verse), 'text': html.unescape(label), 'href': urljoin(PUBLISHER_URL, href)}
            for verse, href, label in re.findall(
                r'class="notebackref" href="#V\d+">10:(\d+)</a>\s*<span class="xt"><a href=\'([^\']+)\'>([^<]+)</a></span>', page)
            if 25 <= int(verse) <= 37]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('publisher_html', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if sha256(resident_bytes(args.archive, 4_000_000)).hexdigest() != ARCHIVE_SHA:
        raise ValueError('The reviewed publisher archive changed')
    with ZipFile(args.archive) as archive:
        raw = archive.read(MEMBER)
    if sha256(raw).hexdigest() != MEMBER_SHA:
        raise ValueError('The reviewed Luke source changed')
    publisher = resident_bytes(args.publisher_html, 60_000)
    paragraphs, notes = from_usfm(raw)
    if (paragraphs, notes) != from_publisher(publisher.decode('utf-8-sig')):
        raise ValueError('The publisher page and source disagree')
    if [v['verse'] for group in paragraphs for v in group] != list(range(25, 38)) or len(notes) != 2:
        raise ValueError('Unexpected verse or publisher reference count')
    edition = {'edition': 'World English Bible Classic', 'editionId': 'eng-web', 'title': 'The Good Samaritan',
               'chapter': 10, 'publisherUrl': PUBLISHER_URL, 'rightsUrl': 'https://ebible.org/eng-web/webfaq.htm',
               'sourceMemberSha256': MEMBER_SHA, 'paragraphs': paragraphs, 'footnotes': notes}
    data = (json.dumps(edition, ensure_ascii=False, indent=2) + '\n').encode()
    if args.write:
        with OUT.open('xb') as file:
            file.write(data)
    if resident_bytes(OUT, 20_000) != data:
        raise ValueError('The packaged text differs from the reviewed passage')
    print(json.dumps({'status': 'PASS', 'verses': 13, 'publisherReferences': len(notes), 'archiveSha256': ARCHIVE_SHA,
                      'sourceMemberSha256': MEMBER_SHA, 'publisherHtmlSha256': sha256(publisher).hexdigest(),
                      'editionSha256': sha256(data).hexdigest(),
                      'sourcePin': sha256(json.dumps(edition, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
