// 주소 정리: 브라우저의 '주의 요함' 표시를 막기 위해 항상 https://www.o-note.net 으로 열리게 함
//  - o-note.net(www 없음)으로 들어오면 www.o-note.net 으로 이동 (보안 인증서는 www 주소에 발급됨)
//  - http:// 로 들어오면 https:// 로 이동
// GitHub Pages 설정이 반영되기 전을 위한 안전장치. 내 컴퓨터에서 테스트할 때는 건너뜀
(function () {
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h)) return;
  var host = h === 'o-note.net' ? 'www.o-note.net' : location.host;
  if (location.protocol === 'http:' || host !== location.host) {
    location.replace('https://' + host + location.pathname + location.search + location.hash);
  }
})();
