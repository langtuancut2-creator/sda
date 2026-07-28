module.exports = function srtToAss(srtText, styleOptions = {}) {
  const fontName = styleOptions.fontName || 'Arial';
  const fontSize = styleOptions.fontSize || 48;
  const primaryColor = '&H00FFFFFF'; // White
  const outlineColor = '&H00000000'; // Black
  const backColor = '&H7F000000'; // Semi-transparent black

  let assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},-1,0,0,0,100,100,0,0,1,4,0,2,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const blocks = srtText.replace(/\r\n/g, '\n').split('\n\n').filter(Boolean);
  
  let events = '';
  
  function convertTime(srtTime) {
    // SRT: 00:00:01,000 -> ASS: 0:00:01.00
    const [hms, ms] = srtTime.split(',');
    const [h, m, s] = hms.split(':');
    const cs = Math.floor(parseInt(ms || '0', 10) / 10).toString().padStart(2, '0');
    return `${parseInt(h, 10)}:${m}:${s}.${cs}`;
  }

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (match) {
        const start = convertTime(match[1]);
        const end = convertTime(match[2]);
        
        // Escape {} and \ and newlines for ASS
        let text = lines.slice(2).join('\\N');
        // Simple escape, maybe just replace { } if they conflict with ASS override tags
        text = text.replace(/[{}]/g, ''); 
        
        events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
      }
    }
  }

  return assHeader + events;
};
