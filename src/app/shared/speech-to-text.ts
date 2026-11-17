/** ข้อความ error ของ Syncfusion SpeechToText / Web Speech API เป็นภาษาไทย */
export function speechErrorMessageTh(error?: string | null): string {
  switch (error) {
    case 'not-allowed':
      return 'ไม่อนุญาตใช้ไมโครโฟน — อนุญาตสิทธิ์ในเบราว์เซอร์แล้วลองใหม่';
    case 'no-speech':
      return 'ไม่ได้ยินเสียงพูด ลองพูดอีกครั้ง';
    case 'audio-capture':
      return 'ไม่พบไมโครโฟนหรืออุปกรณ์เสียง';
    case 'network':
      return 'เครือข่ายมีปัญหาขณะรู้จำเสียง';
    case 'service-not-allowed':
      return 'บริการรู้จำเสียงไม่พร้อมใช้งาน';
    case 'aborted':
      return 'ยกเลิกการฟังแล้ว';
    case 'unsupported-browser':
      return 'เบราว์เซอร์นี้ไม่รองรับ Speech-to-Text (แนะนำ Chrome / Edge)';
    default:
      return 'รู้จำเสียงไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
}

export const defaultThaiSpeechButtonSettings = {
  content: 'พูด',
  stopContent: 'หยุด',
  iconCss: 'e-icons e-audio',
  stopIconCss: 'e-icons e-pause',
  isPrimary: false,
};

export function mergeSpeechTranscript(base: string, spoken: string): string {
  const b = base.trim();
  const s = spoken.trim();
  if (!s) {
    return b;
  }
  if (!b) {
    return s;
  }
  return `${b} ${s}`;
}
