// Display-only repair of rounding overlaps smaller than one 30fps frame.
// Text, audio, end times and original immutable project remain unchanged.
export function nonoverlappingCaptionBoundaries(cues){
 let end=0;return cues.map(c=>{let row=c;const overlap=end-c.start_seconds;
  if(Number.isFinite(c.start_seconds)&&Number.isFinite(c.end_seconds)&&overlap>0&&overlap<=1/30&&end<c.end_seconds)row={...c,start_seconds:end,boundary_adjustment:{schema:'subframe-caption-boundary-v1',original_start_seconds:c.start_seconds,adjusted_start_seconds:end,audio_changed:false}};
  end=c.end_seconds;return row;
 });
}
