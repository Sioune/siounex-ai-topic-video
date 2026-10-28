// Convert an actually visible absolute day group to its conservative exclusive
// end, under the existing Asia/Shanghai owner policy. Creation-date groups and
// inferred relative labels cannot prove an updated-at inventory watermark.
export function studioDateGroupUpperBound({label,origin,scope,sort_field,sort_direction,sort_verified}={}){
 if(origin!=='https://app.heygen.com'||scope!=='all-projects'||sort_field!=='updated_at'||sort_direction!=='descending'||sort_verified!==true||typeof label!=='string')return null;
 const match=label.trim().match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/u);if(!match)return null;
 const [,rawYear,rawMonth,rawDay]=match,year=Number(rawYear),month=Number(rawMonth),day=Number(rawDay);if(year<1970||year>2199||month<1||month>12||day<1||day>31)return null;
 const actual=new Date(Date.UTC(year,month-1,day));if(actual.getUTCFullYear()!==year||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)return null;
 return new Date(Date.UTC(year,month-1,day+1)-8*3600000).toISOString();
}
