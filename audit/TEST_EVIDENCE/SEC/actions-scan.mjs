import fs from "node:fs"; import path from "node:path";
const root = "D:/Omniroute/ARS Approval System";
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) { if (e.name!=="node_modules") walk(p);} else if (/.tsx?$/.test(e.name) && /^s*["']use server["']/m.test(fs.readFileSync(p,"utf8"))) files.push(p);} })(path.join(root,"app"));
const GUARDS = ["requireApiArea","getAdminActor","requireArea","getCurrentSession"];
const callRe = (g) => new RegExp("\\b" + g + "\\s*\\(");
const rows=[];
for (const f of files.sort()) {
  const src = fs.readFileSync(f,"utf8"); const lines = src.split("\n");
  const fns = [];
  const re = /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/;
  for (let i=0;i<lines.length;i++){ const m = lines[i].match(re); if(!m) continue; const name=m[3]||m[5]; const exported=!!(m[1]||m[4]);
    let depth=0, started=false, j=i, body=[]; for(;j<lines.length;j++){ body.push(lines[j]); for(const ch of lines[j]){ if(ch==="{"){depth++;started=true;} else if(ch==="}") depth--; } if(started&&depth<=0) break; }
    fns.push({name, exported, line:i+1, body: body.join("\n")}); }
  const guarded = new Set(GUARDS);
  for (let k=0;k<5;k++) for (const fn of fns) if ([...guarded].some(g=>g!==fn.name && callRe(g).test(fn.body))) guarded.add(fn.name);
  for (const fn of fns.filter(f=>f.exported)) {
    const calls = [...guarded].filter(g=>g!==fn.name && callRe(g).test(fn.body));
    const firstAwait = (fn.body.match(/await\s+([A-Za-z0-9_.]+)\s*\(/)||[])[1]||"";
    rows.push(`${path.relative(root,f).split(path.sep).join("/")}:${fn.line}\t${fn.name}\t${calls.length?calls.join(","):"NO-LOCAL-GUARD (first await: "+firstAwait+")"}`);
  }
}
console.log(rows.join("\n"));
