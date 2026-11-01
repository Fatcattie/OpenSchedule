#!/usr/bin/env node
{let v=process.versions.node.split(".").map(Number);if(v[0]<18){console.error("Error: sentry requires Node.js 18 or later (found "+process.version+").\n\nEither upgrade Node.js, or install the standalone binary instead:\n  curl -fsSL https://cli.sentry.dev/install | bash\n");process.exit(1)}}
{let e=process.emit;process.emit=function(n,...a){return n==="warning"?!1:e.apply(this,[n,...a])}}
require('./index.cjs')._cli().catch(()=>{process.exitCode=1});
