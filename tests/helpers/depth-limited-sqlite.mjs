// Test-only D1 adapter. All SQL runs in one Python SQLite :memory: connection.
// Python exposes SQLite's real expression-depth limit; Node's core API does not.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

const RPC=String.raw`
import json
import sqlite3
import sys

sys.stdin.reconfigure(encoding="utf-8", errors="strict")
sys.stdout.reconfigure(encoding="utf-8", errors="strict")
connection = sqlite3.connect(":memory:", isolation_level=None)
connection.row_factory = sqlite3.Row

def statement(value):
    before = connection.total_changes
    cursor = connection.execute(value["sql"], value.get("args", []))
    rows = [dict(row) for row in cursor.fetchall()] if cursor.description else []
    return {
        "rows": rows,
        "changes": connection.total_changes - before,
        "last_row_id": cursor.lastrowid,
    }

def command(value):
    operation = value["op"]
    if operation == "limit":
        connection.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH, value["depth"])
        return {
            "expression_depth": connection.getlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH),
            "sqlite_version": sqlite3.sqlite_version,
            "database_file": connection.execute("PRAGMA database_list").fetchone()["file"],
        }
    if operation == "get-limit":
        return connection.getlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH)
    if operation == "script":
        connection.executescript(value["sql"])
        return True
    if operation == "statement":
        return statement(value)
    if operation == "batch":
        connection.execute("BEGIN")
        try:
            result = [statement(item) for item in value["statements"]]
            connection.execute("COMMIT")
            return result
        except BaseException:
            connection.execute("ROLLBACK")
            raise
    if operation == "close":
        connection.close()
        return True
    raise ValueError("Unknown synthetic SQLite RPC operation")

for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        result = command(request)
        response = {"id": request["id"], "result": result}
    except BaseException as error:
        response = {
            "id": request.get("id") if request else None,
            "error": {
                "message": str(error),
                "name": type(error).__name__,
                "sqlite_errorcode": getattr(error, "sqlite_errorcode", None),
                "sqlite_errorname": getattr(error, "sqlite_errorname", None),
            },
        }
    print(json.dumps(response, ensure_ascii=True, allow_nan=False), flush=True)
    if request and request.get("op") == "close":
        break
`;

export async function createDepthLimitedSqlite({depth=100,python=process.platform==='win32'?'python':'python3'}={}){
  if(!Number.isSafeInteger(depth)||depth<1)throw new Error('A finite positive SQLite expression depth is required');
  const child=spawn(python,['-u','-c',RPC],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map();let nextId=0,stderr='',ended=false,closing=false,closePromise=null;
  let resolveExit;
  const exited=new Promise(resolve=>{resolveExit=resolve});
  const rejectPending=error=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(error)}pending.clear()};
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000)});
  child.once('error',error=>{ended=true;rejectPending(error);resolveExit()});
  child.once('exit',(code,signal)=>{
    ended=true;
    rejectPending(new Error('Synthetic SQLite RPC exited: '+String(code??signal)+(stderr?'\n'+stderr:'')));
    resolveExit();
  });
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;
    try{message=JSON.parse(line)}catch(error){rejectPending(new Error('Invalid synthetic SQLite RPC response: '+error.message));return}
    const waiter=pending.get(message.id);if(!waiter)return;
    pending.delete(message.id);clearTimeout(waiter.timer);
    if(message.error){
      const error=Object.assign(new Error(message.error.message),{
        name:message.error.name||'Error',code:message.error.sqlite_errorname,
        sqlite_errorcode:message.error.sqlite_errorcode,
      });
      waiter.reject(error);
    }else waiter.resolve(message.result);
  });
  const call=(op,value={})=>{
    if(ended)return Promise.reject(new Error('Synthetic SQLite RPC is already closed'));
    const id=++nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(id);reject(new Error('Synthetic SQLite RPC did not complete '+op));
      },15000);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({id,op,...value})+'\n',error=>{
        if(!error)return;const waiter=pending.get(id);if(!waiter)return;
        pending.delete(id);clearTimeout(waiter.timer);waiter.reject(error);
      });
    });
  };
  const result=value=>({
    success:true,results:value.rows,
    meta:{changes:value.changes,last_row_id:value.last_row_id},
  });
  class Statement{
    constructor(sql,args=[]){this.sql=sql;this.args=args}
    bind(...args){return new Statement(this.sql,args)}
    async first(column){
      const response=await call('statement',{sql:this.sql,args:this.args});
      const row=response.rows[0]||null;
      return column===undefined?row:row?.[column]??null;
    }
    async all(){return result(await call('statement',{sql:this.sql,args:this.args}))}
    async run(){return result(await call('statement',{sql:this.sql,args:this.args}))}
  }
  const db={
    prepare:sql=>new Statement(sql),
    batch:async statements=>{
      if(statements.some(statement=>!(statement instanceof Statement)))throw new Error('Synthetic batch must contain statements from the same connection');
      const values=await call('batch',{statements:statements.map(({sql,args})=>({sql,args}))});
      return values.map(result);
    },
  };
  const close=()=>{
    if(closePromise)return closePromise;
    closing=true;
    closePromise=(async()=>{
      try{if(!ended)await call('close')}finally{
        child.stdin.end();
        if(!ended){
          const timeout=setTimeout(()=>child.kill(),3000);
          await exited;clearTimeout(timeout);
        }
        lines.close();
      }
    })();
    return closePromise;
  };
  try{
    const info=await call('limit',{depth});
    if(info.expression_depth!==depth||info.database_file!=='')throw new Error('Synthetic SQLite did not retain the requested in-memory depth limit');
    return {
      db,info,
      exec:sql=>call('script',{sql}),
      getExpressionDepth:()=>call('get-limit'),
      close,
    };
  }catch(error){if(!closing)await close().catch(()=>{});throw error}
}

