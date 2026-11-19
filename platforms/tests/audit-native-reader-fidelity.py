"""Bounded source inventory only. Does not render HTML or attest native fidelity."""
import hashlib,json,os,stat
from pathlib import Path
from html.parser import HTMLParser
BOOKS=['republic','meditations','genealogy-of-morals','apology','odyssey','divine-comedy','hamlet','relativity']
ROOT=Path(__file__).resolve().parents[2]
def resident(p):
 s=os.lstat(p)
 assert stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode) and (not s.st_size or s.st_blocks),str(p)
 return s
hashes={}
def read(p):
 resident(p);b=p.read_bytes();hashes[str(p.relative_to(ROOT))]=hashlib.sha256(b).hexdigest();return b
class Images(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.inside=0;self.outside=0
 def handle_starttag(self,tag,attrs):
  indexed=any(active for _,active in self.stack) or 'data-reading-index' in dict(attrs)
  if tag=='img':
   if indexed:self.inside+=1
   else:self.outside+=1
  if tag not in ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']:self.stack.append((tag,indexed))
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
rows=[]
for book in BOOKS:
 base=ROOT/'content/great-books'/book
 manifest=json.loads(read(base/'manifest.json'));index=json.loads(read(base/'passages.json'));html=read(base/'reader.html');parser=Images();parser.feed(html.decode())
 assets=manifest['assets'];assetbytes=0
 for asset in assets:
  p=base/'assets'/asset['path'];s=resident(p);assert s.st_size==asset['bytes'],str(p);assetbytes+=s.st_size
 rows.append({'bookId':book,'blocks':len(index['blocks']),'tableBlocks':sum(b['reason']=='table' for b in index['blocks']),'nonTextBlocks':sum(b['reason']=='non_text' for b in index['blocks']),'imagesInsideIndexedBlocks':parser.inside,'imagesOutsideIndexedBlocks':parser.outside,'manifestAssets':len(assets),'residentAssetBytes':assetbytes,'readerBytes':len(html)})
result={'status':'INVENTORY_ONLY','scope':'Exact eight canonical source documents, passage indexes and manifests. Manifest assets checked only by regular resident file status and byte size, not content hash or rendering. No dependency traversal, download, native execution or fidelity acceptance.','books':rows,'totals':{k:sum(r[k] for r in rows) for k in rows[0] if k!='bookId'},'sourceHashes':hashes}
print(json.dumps(result,indent=2))
