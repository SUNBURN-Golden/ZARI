# 디자인 기반 v0.1 검증 기록

## 범위

기준 커밋: `efc661940e08405e45d9df468346b3df21508a29`.
이번 변경은 디자인 문서·CSS 토큰·Node 검사 스크립트 등록이다. 실행 가능한 앱·화면 캡처·Figma 파일·외부 디자인 스킬 설치·CI·배포는 포함하지 않는다.

## 실제 실행

로컬 실행 환경: Node.js `v22.16.0`. 이 버전은 사용한 환경 기록이며 최신 권장 버전이라는 뜻이 아니다.

```sh
node --check scripts/check-design-tokens.mjs
node scripts/check-design-tokens.mjs --self-test
```

- 스크립트 문법 검사: 통과.
- 검사기 self-test: 10/10 통과. 흑백 21:1, 동일 색 1:1, 임계값 미만 사례, alias 해석, 순환·누락·비지원 색상·중복 토큰·미정의 참조·비지원 override 거절을 검사했다.
- 기본 토큰: 69개. 정의되지 않은 `var(--zari-...)` 참조 없음.
- 선언된 불투명 sRGB 색상 쌍: 30/30 통과. 텍스트 최소 4.5:1, 해당 비텍스트 쌍 최소 3:1과 비교했다. 판정 전에 반올림하지 않았다.
- 텍스트 쌍 중 최소: muted-on-subtle 약 4.695:1.
- 비텍스트 쌍 중 최소: control-on-subtle 약 3.395:1.
- 로컬 CSS 토큰화(tinycss2): 구문 토큰 오류 없음. 실제 브라우저의 렌더링·지원성·cascade 시험은 아니다.
- 변경한 Markdown의 상대 링크: 23개 경로 존재 확인. 앵커 내용과 외부 URL의 장기 유효성 검사는 아니다.
- 기존 README·AGENTS·구현 상태 문서: 수정 전 내용을 원격 Git blob SHA와 대조했다.
- 보존된 두 프롬프트: 로컬 SHA-256·Git blob SHA·바이트 수가 SOURCE_MANIFEST와 일치한다. 업로드 변경 목록에 포함하지 않는다.

## 통과가 의미하지 않는 것

전체 CSS 문법·테마의 완전성, 앱 빌드·Rust/WASM 연동, 실제 글꼴과 도면의 가독성, keyboard·스크린리더·모바일 동작, 애니메이션·성능, WCAG 전체 적합성, 사용자 시각 승인은 검증하지 않았다.

현재 baseline manifest는 `no-screens-captured`이며 항목이 0개다. React Aria·Motion·Impeccable·Storybook·Playwright는 미설치다. 공개 레퍼런스 문서를 읽은 것과 패키지 실행 검증을 구분한다.

## 이후 확인

실제 앱에서 토큰을 import하고 핵심 화면의 정상·오류·미확인·모바일 상태를 렌더링한 뒤 캡처·검토한다. 승인 근거가 있는 화면만 baseline으로 기록한다. 모든 업로드 완료 주장은 원격 branch와 tree의 실제 파일을 다시 읽은 결과로 보고한다.
