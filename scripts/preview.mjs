import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/preview/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!['.html','.js','.css','.svg'].includes(path.extname(file)))throw Error('Not found');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Goodneighbor preview: http://127.0.0.1:4173 (demo balances only)'));
