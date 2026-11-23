// O-note 설정 파일
// SUPABASE_URL / SUPABASE_ANON_KEY 는 공개용(publishable) 값입니다. 데이터 보호는 DB의 RLS 정책이 담당합니다.
// 절대 service_role / secret 키를 여기에 넣지 마세요!
export const CONFIG = {
  SUPABASE_URL: 'https://nmegwwawnahbngbfpmtj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_cD4CzxobjRWY1g2kBSjZXw_AOGZAJrg',
  // GitHub 계정으로 로그인 버튼 표시 (Supabase에서 GitHub provider를 켠 뒤 true로 변경)
  ENABLE_GITHUB_LOGIN: false,
  // 개인정보 처리방침에 표시되는 운영자 문의처
  CONTACT: 'https://github.com/dan0030',
  POLICY_DATE: '2026년 11월 23일',
};
