// Balance only top-level conjunctions in static application SQL. Clauses,
// nested expressions, literals and placeholder order remain byte-for-byte intact.
// D1 has a lower expression-depth cap than the default Node SQLite test adapter.
export function balanceSqlConjunction(sql:string):string{
 const terms:string[]=[];let depth=0,quote='',start=0;
 for(let i=0;i<sql.length;i++){const c=sql[i];if(quote){if(c===quote){if(sql[i+1]===quote)i++;else quote='';}continue;}if(c==="'"||c==='"'){quote=c;continue;}if(c==='(')depth++;else if(c===')')depth--;else if(depth===0&&sql.slice(i,i+5)===' AND '){terms.push(sql.slice(start,i));start=i+5;i+=4;}}
 terms.push(sql.slice(start));const combine=(left:number,right:number):string=>right-left===1?'('+terms[left]+')':'('+combine(left,(left+right)>>1)+' AND '+combine((left+right)>>1,right)+')';return combine(0,terms.length);
}
