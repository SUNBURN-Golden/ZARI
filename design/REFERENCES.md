# 디자인 레퍼런스와 도구 상태

이 문서는 외부 설계 원칙과 구현 도구의 역할을 구분한다. 링크는 라이브 문서다. 이번 작업에서는 아래 공개 문서의 설명을 확인했지만, 라이브러리 설치·호환성·브라우저 동작·제품 효과를 검증하지 않았다. 설치된 버전은 없으며 floating main을 실행 기준으로 고정한 것도 아니다.

## 시각·작업 흐름

- [Apple WWDC25 — Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/): 공식 설명·전사에서 콘텐츠와 조작 영역의 관계, 배열·그룹화에 의한 위계, 화면 크기 간 연속성을 확인했다. ZARI는 이 원칙을 참고하되 Apple UI·에셋을 복제하지 않는다. 전체 제품 감사나 최신 OS 사용성 시험은 하지 않았다.
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/): 상위 레퍼런스. 이번 텍스트 접근에서는 JavaScript 안내만 반환되어 세부 페이지 내용을 재검증했다고 주장하지 않는다.
- IKEA PAX·BOAXEL, Elfa Planner·Classic 가이드는 [보존된 마스터프롬프트](../docs/MASTER_PROMPT_KO.md)의 레퍼런스를 따른다. 이번 변경에서 해당 플래너를 조작하지 않았다. 설계·구매 흐름을 참고하며 로고·이미지·소스·비공개 API를 가져오지 않는다.

## UI 동작·모션·화면 검증

| 프로젝트 | 공개 설명에서 확인한 범위 | ZARI 도입 상태 |
| --- | --- | --- |
| [React Aria](https://react-aria.adobe.com/) / [repo](https://github.com/adobe/react-spectrum) | 사용자 스타일을 적용하는 컴포넌트, 키보드·포커스·입력 동작 | 우선 후보, 미설치. 공간 solver를 대체하지 않음 |
| [Motion 접근성](https://motion.dev/docs/react-accessibility) / [repo](https://github.com/motiondivision/motion) | reducedMotion과 useReducedMotion 안내 | 선택적 후보, 미설치 |
| [Storybook](https://storybook.js.org/docs) / [repo](https://github.com/storybookjs/storybook) | 독립적인 컴포넌트 개발·문서·테스트 | 후속 후보, 미설치·미배포 |
| [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | 기준 스크린샷과 비교, 환경 차이에 대한 안내 | 후속 화면 검증 경로, 미실행 |

라이브러리 도입만으로 앱 전체 접근성이 보장되지 않는다. 실제 조합·스타일·도메인 편집기·키보드 경로를 시험해야 한다.

## AI 디자인 보조

- [Impeccable](https://github.com/pbakaus/impeccable): 디자인 작업을 지도하는 스킬/도구 후보. 외부 지침은 제안이며 DESIGN.md를 덮어쓰지 않는다. 현재 미설치, 실행·후킹 없음.
- [UI Skills](https://github.com/ibelick/ui-skills): 선택적 품질 검토 자료. 현재 미설치.
- [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines): 선택적 UI 검토 자료. 현재 미설치. 원격 규칙을 매 실행마다 자동 적용하지 않는다.

Taste Skill·UI UX Pro Max·Base UI 등 이전 대화의 다른 후보를 추가로 번들링하지 않는다. 필요하면 목적과 중복을 검토한 새 결정으로 다룬다.

어느 도구도 이번 변경에서 다운로드·vendoring·전역 설치하지 않았다. 실제 채택 시 commit 또는 버전, SPDX/라이선스 파일, 의존성, 실행 스크립트, 훅, 데이터 전송 범위, 업데이트·제거 방법을 기록한다. README의 설치 명령은 승인된 실행 명령이 아니다. 라이선스가 확인되지 않은 외부 에셋·폰트·스크린샷은 저장하지 않는다.

## 접근성 확인용 1차 자료

- [W3C Contrast Minimum — 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 보통 텍스트의 4.5:1 기준과 대비 계산.
- [W3C Non-text Contrast — 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 식별에 필요한 컨트롤·상태·그래픽의 인접 색상 대비 3:1. 장식선과 구분한다.
- [W3C Dragging Movements — 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): 드래그 없는 단일 포인터 대안.
- [W3C Reflow — 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): 좁은 너비·확대에서 정보와 기능의 재배치. 2차원 도면의 예외가 일반 패널의 가로 넘침을 정당화하지 않는다.

우리의 44/48px 컨트롤 목표, 초기 breakpoint와 모션 시간은 ZARI의 설계 제안이지 위 문서 전체를 그대로 옮긴 법적·인증 기준이 아니다. 토큰 일부의 통과를 WCAG 전체 준수라고 보고하지 않는다.
