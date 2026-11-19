"""Focused insertion invariants; no dependency imports or source mutation."""
import importlib.util
import stat
import unittest
from pathlib import Path
p=Path(__file__).with_name('generate-source-reader.py')
s=p.lstat()
assert stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_blocks
spec=importlib.util.spec_from_file_location('generator',p)
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class InsertionTests(unittest.TestCase):
    def test_exact_source_restoration_and_original_ids(self):
        source=b'<!doctype html><html><head><style>p{color:red}</style></head><body><p id="original" data-reading-index="0">First &amp; second</p><p data-reading-index="1"><br>Line\nTwo</p><a href="#original">Back</a></body></html>'
        result,overrides,resources=g.derive(source,2)
        self.assertEqual(overrides,{'0':'original'})
        self.assertEqual(resources,[])
        self.assertEqual(result.replace(g.VIEWPORT.encode(),b'').replace(b' id="soe-reading-position-1"',b''),source)
    def test_unicode_offsets_preserve_source(self):
        source='<html><head></head><body>界😀\n<p data-reading-index="0">Ἀπολογία</p></body></html>'.encode()
        result,_,_=g.derive(source,1)
        self.assertEqual(result.replace(g.VIEWPORT.encode(),b'').replace(b' id="soe-reading-position-0"',b''),source)
    def test_reserved_anchor_collision(self):
        with self.assertRaises(AssertionError):g.derive(b'<html><head></head><body><p id="soe-reading-position-0" data-reading-index="0">A</p></body></html>',1)
    def test_bad_coordinates_or_existing_viewport(self):
        for body in ['<p data-reading-index="1">A</p>','<p data-reading-index="00">A</p>','<p data-reading-index="0" data-reading-index="0">A</p>']:
            with self.assertRaises(AssertionError):g.derive(('<html><head></head><body>'+body+'</body></html>').encode(),1)
        with self.assertRaises(AssertionError):g.derive(b'<html><head><meta name="viewport"></head><body><p data-reading-index="0">A</p></body></html>',1)
    def test_active_or_unresolved_source(self):
        for extra in ['<script>bad()</script>','<iframe src="x"></iframe>','<p onclick="bad()">A</p>','<a href="https://other.invalid">Out</a>','<a href="#missing">Missing</a>']:
            with self.assertRaises(AssertionError):g.derive(('<html><head></head><body><p data-reading-index="0">A</p>'+extra+'</body></html>').encode(),1)

if __name__=='__main__':unittest.main()
