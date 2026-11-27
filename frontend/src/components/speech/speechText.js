export const VOICE_PREVIEW_TEXT = 'Read at a comfortable pace. The sample contains 20 millilitres of water at 25 degrees Celsius.';

export function voiceLabel(voice) {
  const location = voice.localService === true ? 'Device-local' : voice.localService === false ? 'Remote' : 'Location unknown';
  return `${voice.name} (${voice.lang}) · ${location}`;
}
export function chooseSpeechVoice(voices, uri, locale = 'en-IN', allowRemote = false) {
  if (uri) {
    const voice = voices.find(item => item.voiceURI === uri);
    if (!voice) return {error:'Your selected voice is not available. Choose another voice in Settings.'};
    if (voice.localService !== true && !allowRemote) return {error:'This voice may send text to a remote speech service. Choose a device-local voice, or explicitly allow remote speech in Settings.'};
    return {voice};
  }
  const english = voices.filter(voice => voice.localService === true && /^en(?:[-_]|$)/i.test(voice.lang));
  english.sort((a,b) => (Number(b.lang.toLowerCase() === locale.toLowerCase())-Number(a.lang.toLowerCase() === locale.toLowerCase())) || Number(b.default)-Number(a.default));
  return english[0] ? {voice:english[0]} : {error:'No device-local English voice is available yet. Open Settings to refresh voices, install an English system voice, or explicitly select and allow a remote voice.'};
}

const UNITS = { mL:['millilitre','millilitres'], ml:['millilitre','millilitres'], mg:['milligram','milligrams'], kg:['kilogram','kilograms'], g:['gram','grams'], cm:['centimetre','centimetres'], mm:['millimetre','millimetres'], km:['kilometre','kilometres'], '°C':['degree Celsius','degrees Celsius'], '°F':['degree Fahrenheit','degrees Fahrenheit'], '%':['percent','percent'] };
export function spokenSentence(text) {
  return text.replace(/(\d+(?:[.,]\d+)*)\s*(mL|ml|mg|kg|cm|mm|km|g|°C|°F|%)(?=[\s.,;:!?)]|$)/g,(_,number,unit) => `${number} ${UNITS[unit][Number(number)===1?0:1]}`);
}
export function speechBatch(sentences, start, connected = false, maxLength = 600, offset = 0) {
  let text = ''; const ranges = []; let nextIndex = start, nextOffset = 0;
  for (let index = start; index < sentences.length; index += 1) {
    const item = sentences[index];
    if (index > start && (!connected || index-start >= 4 || item.chunkId !== sentences[start].chunkId || item.paragraphIndex !== sentences[start].paragraphIndex)) break;
    const spoken = spokenSentence(item.text).slice(index === start ? offset : 0);
    const separator = text && !/\s$/.test(text) ? ' ' : '';
    if (index > start && text.length + separator.length + spoken.length > maxLength) break;
    text += separator;
    let length = spoken.length;
    if (!text && length > maxLength) {
      const space = spoken.lastIndexOf(' ',maxLength);
      length = space > 0 ? space + 1 : maxLength;
      const last = spoken.charCodeAt(length - 1), next = spoken.charCodeAt(length);
      if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) length -= 1;
    }
    ranges.push({start:text.length,end:text.length+length,index}); text += spoken.slice(0,length);
    nextIndex = length < spoken.length ? index : index + 1;
    nextOffset = length < spoken.length ? (index===start?offset:0)+length : 0;
    if (nextOffset) break;
  }
  return {text,ranges,nextIndex,nextOffset};
}
export function boundarySentence(ranges, charIndex) {
  if (!Number.isInteger(charIndex) || charIndex < 0) return null;
  return ranges.find(range => charIndex >= range.start && charIndex < range.end)?.index ?? null;
}
