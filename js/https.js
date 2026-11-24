// http:// 로 들어오면 바로 https:// 로 옮김 (브라우저의 '주의 요함' 표시 방지)
// GitHub Pages의 Enforce HTTPS가 꺼져 있거나 반영 전일 때를 위한 안전장치. 내 컴퓨터에서 테스트할 때는 건너뜀
(function () {
  var h = location.hostname;
  if (location.protocol === 'http:' && h !== 'localhost' && h !== '127.0.0.1' && !/^192\.168\./.test(h)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
  }
})();
