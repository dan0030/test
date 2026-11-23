// O-note 설정 파일
// Supabase 프로젝트의 URL과 anon(public) 키를 넣으면 계정 동기화 모드로 동작합니다.
// 비워두면 "체험 모드"(이 브라우저에만 저장)로 동작합니다.
// anon 키는 공개되어도 되는 키입니다. 데이터 보호는 DB의 RLS 정책이 담당합니다.
// 절대 service_role 키를 여기에 넣지 마세요!
// GitHub Actions 배포 시 저장소 Variables(SUPABASE_URL, SUPABASE_ANON_KEY)로 자동 주입됩니다.
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // GitHub 계정으로 로그인 버튼 표시 (Supabase에서 GitHub provider를 켠 경우 true)
  ENABLE_GITHUB_LOGIN: true,
};
