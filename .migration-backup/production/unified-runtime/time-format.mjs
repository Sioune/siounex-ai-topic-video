// Shared filmstrip clock: round tenths before splitting so 59.96 rolls over.
export function formatFilmstripTime(seconds){
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Nonnegative finite timeline time required');
 const tenths=Math.round(seconds*10),minutes=Math.floor(tenths/600),remainder=tenths%600;
 return `${String(minutes).padStart(2,'0')}:${String(Math.floor(remainder/10)).padStart(2,'0')}.${remainder%10}`;
}
