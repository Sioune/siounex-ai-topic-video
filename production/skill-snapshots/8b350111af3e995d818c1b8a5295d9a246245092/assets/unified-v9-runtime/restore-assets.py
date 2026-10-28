"""Restore only pinned, already-materialized Library bytes. No network or credentials."""
import argparse,hashlib,json,os,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parent
index=json.loads((root/'media-resources.json').read_text(encoding='utf8'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def target(s):
    p=(root/s).resolve()
    if root not in p.parents:raise ValueError('Destination escapes package')
    p.parent.mkdir(parents=True,exist_ok=True)
    return p
a=argparse.ArgumentParser();a.add_argument('--master',required=True);a.add_argument('--media-bundle',required=True);args=a.parse_args()
master=pathlib.Path(args.master).resolve();bundle=pathlib.Path(args.media_bundle).resolve()
if sha(master)!=index['resources']['published_v9']['sha256'] or sha(bundle)!=index['resources']['legacy_media_bundle']['sha256']:raise ValueError('Pinned materialized bytes changed')
dest=target(index['resources']['published_v9']['local_path'])
if dest.exists():
    if sha(dest)!=sha(master):raise ValueError('Existing master conflicts; nothing overwritten')
else:
    try:os.link(master,dest)
    except OSError as exc:raise RuntimeError('Materialize the pinned master directly to media/published-v9.mp4 with the official Library helper. Cross-volume byte-copy is not a metadata-preserving substitute.') from exc
members=index['resources']['legacy_media_bundle']['members']
with zipfile.ZipFile(bundle) as z:
    for member in members:
        data=z.read(member['member'])
        if hashlib.sha256(data).hexdigest()!=member['sha256']:raise ValueError('Archive member hash mismatch')
        p=target(member['local_path'])
        if p.exists() and sha(p)!=member['sha256']:raise ValueError('Existing asset conflicts; nothing overwritten')
        if not p.exists():p.write_bytes(data)
report={'master_sha256':sha(dest),'master_same_inode_as_materialized_file':dest.stat().st_ino==master.stat().st_ino,'Library_id':index['resources']['published_v9']['library_file_id'],'file_id':index['resources']['published_v9']['file_id'],'version':index['resources']['published_v9']['version'],'archive_verified':True,'members_verified':len(members),'network_calls':0,'published_source_modified':False}
(root/'restore-receipt.local.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report))
