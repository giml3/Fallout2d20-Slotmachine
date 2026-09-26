import {readFile,readdir,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const manifest=JSON.parse(await readFile('module.json','utf8'));
for(const path of [...manifest.esmodules,...manifest.styles,manifest.license])await access(path);
for(const dir of ['scripts','preview'])for(const file of (await readdir(dir)).filter(f=>/\.(m?js)$/.test(f))){const check=spawnSync(process.execPath,['--check',`${dir}/${file}`],{encoding:'utf8'});if(check.status)throw Error(check.stderr);}
console.log('Manifest assets and JavaScript syntax checked.');
