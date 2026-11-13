import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {protect} from './token-store.mjs';

// Run locally only after authorizing the permanent, teacher-scoped reader.
// The generated installer contains a token HASH, never the local bearer key.
const root=path.dirname(fileURLToPath(import.meta.url)),privateDir=path.join(root,'private');
const teacherId=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(teacherId||''))throw Error('Specify the authorized teacher id');
fs.mkdirSync(privateDir,{recursive:true});const keyPath=path.join(privateDir,'directory-token.dpapi');
const token=fs.existsSync(keyPath)?await protect(fs.readFileSync(keyPath,'utf8'),true):randomBytes(32).toString('base64url');
if(!fs.existsSync(keyPath))fs.writeFileSync(keyPath,await protect(token),{mode:0o600});
const files=Object.fromEntries(['directory-server.mjs','platform-directory.mjs','token-store.mjs'].map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
files['config.json']=JSON.stringify({dataDir:'/root/platform-data',teacherId,port:5713,tokenHash:createHash('sha256').update('Bearer '+token).digest('hex')});
const payload=gzipSync(Buffer.from(JSON.stringify(files))).toString('base64');
const installer=`import base64,gzip,json,subprocess,time,urllib.request,urllib.error
from pathlib import Path
files=json.loads(gzip.decompress(base64.b64decode('${payload}')))
target=Path('/root/.ivan100-reply-directory')
assert target.resolve()==target and set(files)=={'directory-server.mjs','platform-directory.mjs','token-store.mjs','config.json'}
target.mkdir(mode=0o700,exist_ok=True)
for name,value in files.items():
    p=target/name
    assert not p.is_symlink()
    p.write_text(value,encoding='utf-8');p.chmod(0o600)
for name in ['directory-server.mjs','platform-directory.mjs']:
    subprocess.run(['/usr/bin/node','--check',str(target/name)],check=True)
unit=Path('/etc/systemd/system/ivan100-reply-directory.service')
unit.write_text('''[Unit]
Description=IVAN100 scoped read-only reply directory
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/node /root/.ivan100-reply-directory/directory-server.mjs /root/.ivan100-reply-directory/config.json
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=/root/platform-data
PrivateTmp=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=192M
[Install]
WantedBy=multi-user.target
''')
include=Path('/etc/nginx/ivan100-reply-directory.conf')
include.write_text('''location = /api/reply-assistant/directory {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:5713;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Host $host;
    proxy_connect_timeout 2s;
    proxy_read_timeout 5s;
    client_max_body_size 1k;
    access_log off;
}
''')
site=Path('/etc/nginx/sites-available/ivan100.ru')
original=site.read_text();line='include /etc/nginx/ivan100-reply-directory.conf;'
if line not in original:
    needle='server_name ivan100.ru www.ivan100.ru;'
    assert original.count(needle)==2 or original.count(needle)==1
    backup=target/('nginx-before-'+str(int(time.time()))+'.conf')
    backup.write_text(original);backup.chmod(0o600)
    site.write_text(original.replace(needle,needle+'\\n    '+line,1))
try:
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','enable','--now','ivan100-reply-directory'],check=True)
    for attempt in range(15):
        try: urllib.request.urlopen('http://127.0.0.1:5713/api/reply-assistant/directory',timeout=2)
        except urllib.error.HTTPError as e:
            assert e.code==401
            break
        except OSError:
            time.sleep(0.3);continue
        raise RuntimeError('Directory must require authentication')
    else: raise RuntimeError('Directory did not start')
    subprocess.run(['systemctl','reload','nginx'],check=True)
    print('DIRECTORY_INSTALLED; unauthorized=401; platform_not_restarted')
except Exception:
    site.write_text(original)
    subprocess.run(['systemctl','stop','ivan100-reply-directory'])
    raise
`;
const command=`python3 -c "import base64;exec(base64.b64decode('${Buffer.from(installer).toString('base64')}'))"`;
fs.writeFileSync(path.join(privateDir,'directory-install-command.txt'),command,{mode:0o600});
console.log('Prepared teacher-scoped read-only directory installer; no plaintext token in installer.');
