"""Seal private Waddle bucket bytes and compare an independent restore readback."""

import argparse
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
from tempfile import NamedTemporaryFile


INVENTORY_FORMAT = 'soe-voice-storage-inventory-v1'
REFERENCE_FORMAT = 'soe-voice-storage-reference-v1'
MAX_JSON_BYTES = 32 * 1024 * 1024
MAX_OBJECTS = 100_000
MAX_OBJECT_BYTES = 2**63 - 1


@contextmanager
def owned_directory(path):
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValueError('Private literal directory required')
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Owner-only directory required')
        yield descriptor
    finally:
        os.close(descriptor)


@contextmanager
def owned_file(directory, name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077
                or info.st_nlink != 1 or (info.st_size and not info.st_blocks)
                or getattr(info, 'st_flags', 0) & 0x40000000):
            raise ValueError('Private resident file required')
        yield stream, info
        current = os.fstat(stream.fileno())
        entry = os.stat(name, dir_fd=directory, follow_symlinks=False)
        attributes = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if any(getattr(info, field) != getattr(observed, field) for observed in (current, entry) for field in attributes):
            raise ValueError('File changed during comparison')


def unique_object(pairs):
    value = dict(pairs)
    if len(value) != len(pairs):
        raise ValueError('Duplicate JSON field')
    return value


def metadata_string(value):
    return value is None or (isinstance(value, str) and 0 < len(value) <= 512
                             and not any(ord(char) < 32 or ord(char) == 127 for char in value))


def load_manifest(path, *, reference=False):
    with owned_directory(path.parent) as directory, owned_file(directory, path.name) as (stream, info):
        if not 0 < info.st_size <= MAX_JSON_BYTES:
            raise ValueError('Manifest size')
        manifest = json.loads(stream.read(MAX_JSON_BYTES + 1), object_pairs_hook=unique_object)
    if (not isinstance(manifest, dict) or set(manifest) != {'format', 'bucket', 'hasVersionHistory', 'objects'}
            or manifest['format'] != (REFERENCE_FORMAT if reference else INVENTORY_FORMAT)
            or manifest['hasVersionHistory'] is not False):
        raise ValueError('Unknown or versioned inventory')
    bucket = manifest['bucket']
    if (not isinstance(bucket, dict) or set(bucket) != {'id', 'public', 'fileSizeLimit', 'allowedMimeTypes'}
            or bucket['id'] != 'waddles' or type(bucket['public']) is not bool):
        raise ValueError('Unexpected bucket')
    limit, mimes = bucket['fileSizeLimit'], bucket['allowedMimeTypes']
    if limit is not None and (type(limit) is not int or not 0 <= limit <= MAX_OBJECT_BYTES):
        raise ValueError('Bucket size limit')
    if mimes is not None:
        if not isinstance(mimes, list) or not all(isinstance(mime, str) and metadata_string(mime) for mime in mimes):
            raise ValueError('Bucket MIME settings')
        bucket['allowedMimeTypes'] = sorted(set(mimes))

    objects = manifest['objects']
    if not isinstance(objects, list) or len(objects) > MAX_OBJECTS:
        raise ValueError('Unexpected object count')
    fields = {'key', 'bytes', 'contentType', 'contentEncoding'} | ({'sha256'} if reference else set())
    by_key = {}
    for item in objects:
        if not isinstance(item, dict) or set(item) != fields:
            raise ValueError('Object shape')
        key, size = item['key'], item['bytes']
        if not isinstance(key, str) or not 0 < len(key.encode('utf-8')) <= 1024 or '\x00' in key or key in by_key:
            raise ValueError('Object key')
        if type(size) is not int or not 0 <= size <= MAX_OBJECT_BYTES:
            raise ValueError('Missing or invalid provider byte size')
        if not all(metadata_string(item[field]) for field in ('contentType', 'contentEncoding')):
            raise ValueError('Invalid object metadata')
        if reference and (not isinstance(item['sha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', item['sha256'])):
            raise ValueError('Invalid content digest')
        by_key[key] = item
    return bucket, by_key


def object_leaf(key):
    return sha256(key.encode('utf-8')).hexdigest() + '.blob'


def read_objects(directory, objects):
    files = {object_leaf(key): key for key in objects}
    if len(files) != len(objects):
        raise ValueError('Object filename collision')
    digests = {}
    with owned_directory(directory) as descriptor:
        found = set(os.listdir(descriptor))
        wrong_lengths = 0
        for leaf in found & files.keys():
            key = files[leaf]
            with owned_file(descriptor, leaf) as (stream, info):
                if info.st_size != objects[key]['bytes']:
                    wrong_lengths += 1
                    continue
                content = sha256()
                total = 0
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    total += len(chunk)
                    if total > info.st_size:
                        raise ValueError('File grew during comparison')
                    content.update(chunk)
                if total != info.st_size:
                    raise ValueError('File changed during comparison')
                digests[key] = content.hexdigest()
        if found != set(os.listdir(descriptor)):
            raise ValueError('Object set changed during comparison')
    return digests, {'missingFiles': len(files.keys() - found), 'unexpectedFiles': len(found - files.keys()),
                     'wrongFileLengths': wrong_lengths}


def write_reference(path, bucket, objects, digests):
    value = {'format': REFERENCE_FORMAT, 'bucket': bucket, 'hasVersionHistory': False,
             'objects': [{**objects[key], 'sha256': digests[key]} for key in sorted(objects)]}
    data = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    if len(data) > MAX_JSON_BYTES:
        raise ValueError('Reference size')
    with owned_directory(path.parent) as directory:
        with NamedTemporaryFile(dir=path.parent, prefix='.voice-reference-', delete=False) as stream:
            name = Path(stream.name).name
            try:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
                os.link(name, path.name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
            finally:
                os.unlink(name, dir_fd=directory)
        os.fsync(directory)


def run(args):
    bucket, objects = load_manifest(args.inventory)
    if args.mode == 'seal':
        digests, differences = read_objects(args.objects, objects)
        if any(differences.values()):
            return {'status': 'MISMATCH', **differences}
        write_reference(args.reference, bucket, objects, digests)
        return {'status': 'SEALED', 'objectsVerified': len(digests)}

    expected_bucket, expected = load_manifest(args.reference, reference=True)
    digests, differences = read_objects(args.objects, objects)
    common = expected.keys() & objects.keys()
    differences.update(
        missingObjects=len(expected.keys() - objects.keys()),
        unexpectedObjects=len(objects.keys() - expected.keys()),
        changedMetadata=sum(any(expected[key][field] != objects[key][field]
                                for field in ('bytes', 'contentType', 'contentEncoding')) for key in common),
        changedContent=sum(expected[key]['sha256'] != digests[key] for key in common & digests.keys()),
        bucketSettingsChanged=any(bucket[field] != expected_bucket[field] for field in ('fileSizeLimit', 'allowedMimeTypes')),
        restoredBucketPublic=bucket['public'],
    )
    return {'status': 'MISMATCH' if any(differences.values()) else 'MATCH', 'objectsCompared': len(common), **differences}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('seal', 'check'))
    parser.add_argument('--inventory', type=Path, required=True)
    parser.add_argument('--objects', type=Path, required=True)
    parser.add_argument('--reference', type=Path, required=True)
    try:
        report = run(parser.parse_args())
    except (OSError, ValueError, RecursionError, RuntimeError):
        report = {'status': 'UNAVAILABLE', 'check': 'private_storage_evidence_invalid'}
    print(json.dumps({**report, 'productionCleared': False}, indent=2))
    return 0 if report['status'] in {'SEALED', 'MATCH'} else 1


if __name__ == '__main__':
    raise SystemExit(main())
