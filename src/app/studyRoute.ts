export interface StudyRoute { test:string; scale:string; question:number }
export function parseStudyLink(hash:string, search = ''):StudyRoute | null {
  let parts:string[] | undefined;
  if (hash.startsWith('#study/')) parts = hash.slice(7).split('/');
  else {
    const launch = new URLSearchParams(hash.slice(1));
    if (hash && !launch.has('tgWebAppData') && !launch.has('tgWebAppVersion') && !launch.has('tgWebAppStartParam')) return null;
    const start = new URLSearchParams(search).get('tgWebAppStartParam') ?? launch.get('tgWebAppStartParam') ??
      new URLSearchParams(launch.get('tgWebAppData') ?? '').get('start_param');
    if (start?.startsWith('study_')) parts = start.slice(6).split('_');
  }
  if (!parts || parts.length !== 3 || !/^(smol|smil|mmil)$/.test(parts[0]) || !/^[A-Za-z0-9]{1,3}$/.test(parts[1]) || !/^[1-9]\d{0,2}$/.test(parts[2])) return null;
  return {test:parts[0],scale:parts[1],question:Number(parts[2])};
}
export const studyHash = (route:StudyRoute) => `#study/${route.test}/${route.scale}/${route.question}`;
export interface StudyScale { id:string; code:string; title:string; count:number; first:number }
export interface StudyQuestion { number:number; text:string; answers:('Y'|'N')[] }
export interface StudyResponse { test:string; title:string; scale:StudyScale; scales:StudyScale[]; questions:StudyQuestion[] }
