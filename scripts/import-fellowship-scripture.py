"""Extract reviewed public-domain WEB source pages without changing their words."""
from html.parser import HTMLParser
from pathlib import Path
import argparse
import hashlib
import json
import re

SPECS = [
    ("psalm-22", "Psalm 22", "PSA022", 31, 1, 31),
    ("isaiah-52", "Isaiah 52", "ISA52", 15, 1, 15),
    ("isaiah-53", "Isaiah 53", "ISA53", 12, 1, 12),
    ("isaiah-54", "Isaiah 54", "ISA54", 17, 1, 17),
    ("matthew-27", "Matthew 27", "MAT27", 66, 1, 66),
    ("mark-15", "Mark 15", "MRK15", 47, 1, 47),
    ("luke-23", "Luke 23", "LUK23", 56, 1, 56),
    ("john-19", "John 19", "JHN19", 42, 1, 42),
    ("luke-22", "Luke 22:35–38", "LUK22", 71, 35, 38),
    ("acts-8", "Acts 8:26–40", "ACT08", 40, 26, 40),
    ("peter-2", "1 Peter 2:18–25", "1PE02", 25, 18, 25),
    ("matthew-8", "Matthew 8:14–17", "MAT08", 34, 14, 17),
    ("isaiah-41", "Isaiah 41:8–13", "ISA41", 29, 8, 13),
    ("isaiah-49", "Isaiah 49:1–7", "ISA49", 26, 1, 7),
]


class Source(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.verses = {}
        self.current = None
        self.skip = 0
        self.done = False
        self.notes = []
        self.note = None
        self.note_depth = 0
        self.superscription = ""
        self.heading_depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = a.get("class", "").split()
        if self.heading_depth:
            if tag not in ["br", "hr", "img", "meta", "link", "input"]:
                self.heading_depth += 1
            return
        if tag == "div" and "d" in classes and self.current is None:
            self.heading_depth = 1
            return
        if self.skip:
            if tag not in ["br", "hr", "img", "meta", "link", "input"]:
                self.skip += 1
            return
        if tag == "div" and "footnote" in classes:
            self.done = True
        if tag == "p" and any(c in classes for c in ["f", "x"]) and a.get("id", "").startswith("FN"):
            self.note = {"verse": 0, "text": "", "id": a["id"],
                         "kind": "cross-reference" if "x" in classes else "textual note"}
        if tag == "a" and "notebackref" in classes and self.note is not None:
            self.note["verse"] = int(a["href"].split("V")[-1])
        if tag == "span" and self.note_depth:
            self.note_depth += 1
        elif tag == "span" and "notemark" not in classes and self.note is not None:
            self.note_depth = 1
        if self.done:
            return
        if tag == "ul" and "tnav" in classes and self.current is not None:
            self.done = True
            return
        if tag == "span" and "verse" in classes and re.fullmatch(r"V[1-9][0-9]*", a.get("id", "")):
            self.current = int(a["id"][1:])
            if self.current in self.verses:
                raise ValueError("Duplicate publisher verse")
            self.verses[self.current] = ""
            self.skip = 1
        elif tag == "a" and any(c in classes for c in ["notemark", "fnref"]):
            self.skip = 1
        elif self.current is not None and tag in ["div", "p", "br"]:
            self.verses[self.current] += "\n"

    def handle_endtag(self, tag):
        if self.heading_depth:
            self.heading_depth -= 1
            return
        if self.skip:
            self.skip -= 1
            return
        if tag == "span" and self.note_depth:
            self.note_depth -= 1
            if not self.note_depth:
                self.note["text"] += " "
        if tag == "p" and self.note is not None:
            self.note["text"] = " ".join(self.note["text"].split())
            if not self.note["verse"] or not self.note["text"]:
                raise ValueError("Incomplete publisher footnote")
            self.notes.append(self.note)
            self.note = None

    def handle_data(self, value):
        if self.heading_depth:
            self.superscription += value
            return
        if self.skip:
            return
        if self.note_depth and self.note is not None:
            self.note["text"] += value
        elif not self.done and self.current is not None:
            self.verses[self.current] += value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    passages = []
    for key, title, name, count, first, last in SPECS:
        path = args.sources / (name + ".source.html")
        info = path.lstat()
        assert path.is_file() and not path.is_symlink() and info.st_blocks
        raw = path.read_bytes()
        assert b"World English Bible" in raw and b"Public Domain" in raw
        parsed = Source()
        parsed.feed(raw.decode("utf-8"))
        assert list(parsed.verses) == list(range(1, count + 1)), name
        verses = [{"verse": n, "text": "\n".join(" ".join(line.split()) for line in text.splitlines() if line.strip())}
                  for n, text in parsed.verses.items() if first <= n <= last]
        # WEB intentionally leaves Acts 8:37 out of the main text and prints
        # the TR reading in its footnote. Never fill it from another edition.
        empty = [v["verse"] for v in verses if not v["text"]]
        assert empty == ([37] if name == "ACT08" else []), (name, empty)
        if name == "ACT08":
            note = next(n for n in parsed.notes if n["verse"] == 37)
            assert note["text"].startswith("TR adds Philip said") and "Son of God" in note["text"]
        assert not any("So Dead Sea Scrolls" in v["text"] for v in verses)
        passages.append({"id": key, "title": title, "publisherUrl": "https://ebible.org/eng-web/" + name + ".htm",
                         "sourceSha256": hashlib.sha256(raw).hexdigest(), "sourceBytes": len(raw),
                         "superscription": " ".join(parsed.superscription.split()),
                         "extent": "Complete chapter" if first == 1 and last == count else "Selected context; complete chapter at publisher",
                         "verses": verses, "footnotes": [n for n in parsed.notes if first <= n["verse"] <= last]})
    assert passages[0]["verses"][0]["text"].startswith("My God, my God, why have you forsaken me?")
    assert passages[0]["verses"][-1]["verse"] == 31
    assert passages[0]["footnotes"][0]["verse"] == 16
    result = {"edition": "World English Bible Classic", "editionId": "eng-web",
              "rightsUrl": "https://ebible.org/eng-web/copyright.htm",
              "rightsNotice": "The publisher dedicates the World English Bible to the public domain. Its name identifies faithful copies. Scripture wording and publisher notes are kept separate from SoE commentary.",
              "passages": passages}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passages": len(passages), "verses": sum(len(p["verses"]) for p in passages), "output": str(args.output)}))


if __name__ == "__main__":
    main()
