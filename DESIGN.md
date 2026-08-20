# 매듭수학 디자인 시스템

> 이 문서는 모든 시각 결정의 단일 진실 공급원이다. 컴포넌트를 작성하거나 수정하기 전에 먼저 이 문서를 읽는다. 토큰에 없는 색·크기·간격을 쓰려면 먼저 이 문서를 확장한다.
>
> 방향: **"따뜻한 학습지"** — 종이 위에 잉크로 쓴 잘 정리된 교재. 차분하고, 격려하고, 오래 읽어도 편안한.
> 이 문서는 기존 코드(`assets/css/tokens.css`, `base.css`, `layout.css`, `components.css`)에서 시스템을 추출해 정리한 것이다.

## 1. Atmosphere & Identity

따뜻한 크림색 종이 위에 네이비 잉크로 정성껏 쓴 학습지. 화려한 그래픽이 아니라 잘 정돈된 한 장의 교재가 주는 차분함이 이 제품의 정체성이다. 오렌지는 지문 사이에서 "여기가 다음 걸음"을 알려주는 형광펜 역할만 한다.

시그니처는 두 가지다.

1. **웜 페이퍼 × 네이비 잉크** — 차가운 순백 대신 온기 있는 종이 톤. 지문을 오래 읽어도 눈이 편한 학습 교재의 질감.
2. **눌리는 촌감의 버튼** — 주요 버튼 아래 `0 4px 0` 하드 섀도우. 누르면 살짝 가라앉는 물리적 촉감으로, 학습의 매 행동이 "실제로 조작했다"는 감을 준다.

수학은 이미 긴장감을 주는 과목이다. 이 UI는 긴장을 더하지 않는다. 오답도 부끄럽지 않게, 정답은 조용히 축하하듯.

## 2. Color

단일 라이트 테마(다크 모드 없음 — 의도적 결정, P0 범위 문서 참조). 모든 색은 `tokens.css`의 변수를 통해서만 사용한다.

### 팔레트와 역할

| 역할 | 토큰 | 값 | 용도 |
|------|------|-----|-----|
| 배경/기본 | `--color-paper` | `#fffdf9` | 페이지 기본 배경 |
| 배경/따뜻 | `--color-cream` | `#fffaf2` | 히어로·영역 구분용 따뜻한 배경 |
| 서피스/카드 | `--color-surface` | `#ffffff` | 카드, 입력, 대화상자 |
| 서피스/채움 | `--color-surface-muted` | `#f6f1e9` | 입력 배경, 고스트 버튼 hover |
| 텍스트/기본 | `--color-ink` | `#20313a` | 본문, 제목 |
| 텍스트/보조 | `--color-ink-soft` | `#53636a` | 설명, 캡션 |
| 텍스트/흐림 | `--color-ink-muted` | `#5a6a71` | 비활성, 메타 정보 |
| 선/기본 | `--color-line` | `#e5ded2` | 카드 테두리, 구분선 |
| 선/강조 | `--color-line-strong` | `#cfc4b5` | 보조 버튼 테두리 |
| 구조/브랜드 | `--color-navy` | `#1f3a4d` | 헤더, 주요 CTA, 브랜드 마크, 강조 구조 |
| 구조/어두움 | `--color-navy-dark` | `#142b3c` | 주요 CTA hover |
| 구조/연함 | `--color-navy-soft` | `#e9f0f2` | 선택 상태 배경, 태그 |
| 강조/액션 | `--color-accent` | `#e27750` | 링크 강조, 아이콘, 진행 포인트 — 형광펜 |
| 강조/어두움 | `--color-accent-dark` | `#ad4d30` | 오렌지 계열 **텍스트는 항상 이 값** |
| 강조/연함 | `--color-accent-soft` | `#fbe9df` | 하이라이트 배경 |
| 성공 | `--color-success` | `#2b7562` | 정답, 숙련 진척 |
| 성공/연함 | `--color-success-soft` | `#e1f2eb` | 정답 피드백 배경 |
| 숙련 | `--color-gold` | `#c89436` | 숙련도 장식, 숙련 soft 배경 계열(채움·텍스트 금지) |
| 숙련/텍스트 | `--color-gold-deep` | `#6a4c20` | 골드 계열 **텍스트는 항상 이 값** |
| 숙련/연함 | `--color-gold-soft` | `#fff1cf` | 숙달 배경 |
| 경고 | `--color-warning` | `#8a6116` | 경고 텍스트(feedback.warning·storage-notice·noscript) |
| 경고/연함 | `--color-warning-soft` | `#fbf3df` | 경고 배경 |
| 오류 | `--color-danger` | `#a63e39` | 오답, 파괴적 행동 |
| 오류/진함 | `--color-danger-dark` | `#8b3733` | button-danger 기본 텍스트 |
| 오류/깊음 | `--color-danger-deep` | `#742522` | button-danger hover 텍스트 |
| 오류/연함 | `--color-danger-soft` | `#fbe5e1` | 오류 피드백 배경 |
| 정보 | `--color-info` | `#285b7c` | 안내 메시지 |
| 정보/연함 | `--color-info-soft` | `#e6f0f7` | 안내 배경 |
| 포커스 | `--color-focus` | `#0b6f77` | `:focus-visible` 링 전용 |

### 규칙

- **오렌지 텍스트는 `--color-accent-dark`만 사용** — `#e27750`은 흰 배경 대비 3.0:1로 본문 크기(4.5:1 필요)에 실패한다. `#ad4d30`(약 5.4:1)만 텍스트에 허용. `#e27750`은 배경·아이콘·큰 텍스트(24px+ 또는 18.66px+ 굵게)에만.
- **골드 계열 텍스트는 `--color-gold-deep`만 사용** — `#c89436`·`#a96e1f`은 텍스트 금지(장식·진행바 채움 전용). 골드는 숙련도 전용. 경고 안내는 `warning` 쌍을 쓴다.
- **빨강은 오류·파괴적 행동에만.** 초록 계열은 성공·진척에만. 역할이 곧 색이다.
- 액센트(오렌지)는 화면의 관심 포인트에만 — 링크 강조, 진행 하이라이트, 아이콘 포인트. 페이지 전체의 5~10%를 넘지 않는다.
- 정답/오답을 색만으로 구분하지 않는다(아이콘 + 문구 병행 — 접근성 체크리스트 준수).
- 이 표에 없는 색을 쓰지 않는다. 새 역할이 필요하면 먼저 이 표에 추가한다.
- 토큰 파생색(보더 강조·반투명 오버레이)은 `color-mix(in srgb, var(--color-X) N%, ...)`로만 만든다(`badge-level`이 선례).

## 3. Typography

### 폰트 스택

- 본문·제목 공통: `"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, -apple-system, sans-serif` (`--font-sans`)
- 코드·수식 폴백: `ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace` (`--font-mono`)

단일 폰트 패밀리 — 계층은 크기와 무게로만 만든다. 이 원칙을 유지한다(폰트 추가는 이 문서를 먼저 수정해야 한다).

### 스케일

| 레벨 | 토큰 | 값 | 무게 | 사용 |
|------|------|-----|------|------|
| Display | `--text-3xl` | `clamp(2.375rem, 9vw, 4rem)` | 700~800 | 홈 히어로 제목 |
| H1 | `--text-2xl` | `clamp(1.75rem, 6vw, 2.5rem)` | 700~800 | 페이지 제목, 완료 화면 |
| H2 | `--text-xl` | `1.375rem` | 600~700 | 섹션 제목, 카드 군 제목 |
| H3 | `--text-lg` | `1.125rem` | 600 | 카드 제목, 문제 번호 |
| Body | `--text-md` | `1rem` | 400 | 기본 본문 (line-height 1.65) |
| Small | `--text-sm` | `0.875rem` | 400~500 | 보조 설명, 버튼 라벨 |
| Caption | `--text-xs` | `0.75rem` | 500~600 | 라벨, 메타, 배지 |

### 규칙

- 본문은 `--text-sm`(14px) 아래로 내려가지 않는다.
- **문제 지문·개념 설명 본문은 `--text-md` 이상** — 학습 내용이 가장 큰 글씨여야 한다.
- 한글 본문 line-height는 `--leading-normal`(1.65)을 기본으로 한다. 제목은 `--leading-tight`(1.2).
- 제목이 4줄 이상 되면 레벨을 한 단계 내린다.
- 수식은 렌더러 도입 전까지 일반 텍스트 + `--font-mono`(코드 블록)로 표현한다.

## 4. Spacing & Layout

### 기본 단위

모든 간격은 **4px(0.25rem) 배수**에서 나온다. `--space-1`(4px)부터 `--space-20`(80px)까지.

| 토큰 | 값 | 대표 용도 |
|------|-----|----------|
| `--space-1`~`--space-2` | 4~8px | 아이콘-라벨 간격, 인라인 묶음 |
| `--space-3`~`--space-4` | 12~16px | 폼 필드 안쪽, 목록 항목 사이 |
| `--space-5`~`--space-6` | 20~24px | 카드 안쪽 여백(기본 16~24px) |
| `--space-8`~`--space-12` | 32~48px | 카드 사이, 섹션 내부 구분 |
| `--space-16`~`--space-20` | 64~80px | 페이지 수직 리듬, 히어로 여백 |

### 레이아웃 골격

- 전체 콘텐츠 폭: `--content-width: 74rem`
- 읽기 폭(학습 화면 본문): `--reading-width: 49rem`
- 헤더 높이: `--header-height: 4.5rem` (≥48rem에서 `5.25rem`)
- 최소 지원 폭: **320px** — 핵심 학습 흐름이 가로 스크롤 없이 동작해야 한다.
- 실측 브레이크포인트: `38rem`(모바일→태블릿), `48rem`(헤더), `52rem`(네비 전환), `64rem`·`68rem`(데스크톱 그리드), `72rem`(와이드)
- 표와 긴 수식만 개별 가로 스크롤을 허용한다.

## 5. Components

모두 `components.css`에 실존한다. 여기에 계약을 기록한다.

### Button
- **변형**: `primary`(네이비 솔리드 + `0 4px 0` 하드 섀도우), `secondary`(페이퍼 + 강조선 테두리), `ghost`(투명), `button-danger`(오류 계열), `--small`
- **상태**: hover(배경 어둡게 + `translateY(-1px)` 리프트), active(제자리 복귀 — 눌림 촉감), focus-visible, disabled(`opacity: 0.52`, 섀도 제거), `aria-busy`(스피너)
- **접근성**: 최소 높이 2.9rem(≈46px) — 44px 터치 타깃 충족. `--small`은 2.35rem, 밀집 UI에서만.
- **모션**: `--transition-fast`(140ms), transform만.

### Card
- 구조: `1px solid --color-line` + `--radius-md`(1rem) + `--shadow-xs`
- **깊이 전략은 라인 우선** — 카드의 경계는 선이 책임진다. 섀도우는 보조(§7).

### StatCard / UnitCard
- StatCard: 지표 라벨 + 값 + 단위 + 보조 문구(진행바 포함 변형)
- UnitCard: 단원 제목 + 커리큘럼 배지(framework/level) + 예상 시간 + 숙련 상태 + 진입 화살표
- 상태: 기본, hover(들뜀 + 화살표 이동), 숙련도별 배지(MasteryBadge)

### 학습 콘텐츠 4형제: TheoryBlock / Example / ProblemCard / HintBox
- 같은 블록 문법(내부 `> * + *` 스택 간격 `--space-4`, 문단 line-height 1.85 여유)
- ProblemCard: 번호 + 지문(`--text-md` 이상) + 답 입력 영역 + 행동 버튼 + 진행 표시
- HintBox: 힌트 본문은 지문보다 시각적으로 한 단계 낮게(보조 텍스트 톤)

### ChoiceGroup / ChoiceList (객관식)
- `<label>` 전체가 클릭 영역, `:has(input:checked)`로 선택 상태 표현
- hover / focus-visible / checked 3상태 모두 시각적으로 구분
- 라디오/체크박스 자체는 화면에서 감추고 라벨 디자인으로 대체(커스텀 표시자)

### Feedback (채점 결과)
- 정답: success 계열 + 아이콘 + 문구 / 오답: danger 계열 + 아이콘 + 문구 — **색만이 아닌 아이콘·문구 병행 필수**
- 등장은 즉시(200ms 이하) — 채점 결과는 기다리게 하지 않는다.

### Field / FieldError / SearchInput / Dialog / Skeleton / State / EmptyState
- Field: 라벨 + 입력 + 힌트/오류(오류는 `aria-describedby`로 입력과 연결)
- Dialog: header/body/footer 3단, 닫기 버튼 포함
- Skeleton: 로딩 자리표시자, 콘텐츠 로드 중 깜빡임 없는 전환
- State: 오류/찾을 수 없음/완료 화면 — 안내 문구 + 다음 행동 버튼 필수
- EmptyState: 첫 방문 상태 — 마크 아이콘 + 제목 + 설명 + CTA

### ProgressBar
- `role="progressbar"` + `aria-valuenow/min/max` 필수. 채움은 success 계열.

## 6. Motion & Interaction

| 종류 | 값 | 용도 |
|------|-----|------|
| 빠름 | `--transition-fast: 140ms ease` | 버튼, 호버, 포커스 |
| 보통 | `--transition-normal: 220ms ease` | 패널, 피드백 전환, 진행바 채움(transform) |
| 스피너 | `700ms linear infinite` | `aria-busy` 로딩 표시 |
| Skeleton shimmer | `1.4s linear infinite` | 스켈레톤 로딩 자리표시자(reduced-motion에서 정지) |

### 규칙

- `transform`·`opacity`만 애니메이션한다. 레이아웃 속성(width/height/top)은 애니메이션하지 않는다.
- 모션은 **상태 변화에만** 존재한다 — 채점 결과, 로딩, 포커스, 눌림. 장식을 위한 모션 금지.
- 버튼의 `translateY(-1px)` 리프트는 "누를 수 있음"을 알리는 상호작용 신호다. 모든 클릭 가능 요소가 이 언어를 공유한다.
- `prefers-reduced-motion: reduce`에서 비필수 모션을 끈다(`base.css`에서 이미 구현됨 — 유지 필수).

## 7. Depth & Surface

전략: **mixed — 라인 우선, 섀도 보조, 주요 버튼만 하드 섀도우.**

| 수준 | 값 | 용도 |
|------|-----|------|
| 라인(1차 경계) | `1px solid --color-line` | 카드, 폼, 구분 — 경계의 기본 담당 |
| `--shadow-xs` | `0 1px 2px rgba(28,42,48,.05)` | 정지 상태 카드 |
| `--shadow-sm` | `0 5px 16px rgba(50,51,42,.07)` | 호버 카드, 드롭다운 |
| `--shadow-md` | `0 12px 30px rgba(50,51,42,.1)` | 대화상자, 고정 요소 |
| `--shadow-lg` | `0 22px 55px rgba(31,58,77,.14)` | 페이지 레벨 강조(거의 사용 안 함) |
| 하드 오프셋 | `0 4px 0 color-mix(in srgb, var(--color-navy-dark) 16%, transparent)` | **Primary 버튼 전용** — 눌림 촉감의 시그니처(hover 시 22%로 진해짐) |

- 모서리: `--radius-xs`(0.375rem, 인라인 코드·스켈레톤), `--radius-sm`(0.625rem, 버튼·입력), `--radius-md`(1rem, 카드), `--radius-lg`(1.5rem, 영역), `--radius-pill`(태그·배지)
- 섀도우로 카드를 띄우는 대신, 톤 차이(paper vs surface vs surface-muted)로 층을 만든다.

## 8. Accessibility Constraints & Accepted Debt

### 제약 (준수 필수)

- **WCAG 2.2 AA** — 본문 텍스트 4.5:1, 큰 텍스트·UI 요소 3:1. 상대휘도 공식으로 계산한 검증 조합:
  - ink/paper ≈ 12:1 ✓, navy/paper ≈ 10:1 ✓, ink-soft/paper ≈ 6.1:1 ✓, accent-dark/white ≈ 5.4:1 ✓, accent/white = 3.0:1 — **본문 크기 텍스트 금지**
  - ink-muted(`#5a6a71`)/paper 5.53:1 ✓ · /surface 5.62:1 ✓ · /cream 5.41:1 ✓ · /surface-muted 5.00:1 ✓
  - danger(`#a63e39`)/danger-soft 5.16:1 ✓ · /paper 6.13:1 ✓
  - danger-dark(`#8b3733`)/danger-soft 6.46:1 ✓ · danger-deep(`#742522`)/danger-soft 8.57:1 ✓ · danger-deep/button-danger hover 배경(color-mix 18%) 6.66:1 ✓
  - warning(`#8a6116`)/warning-soft 4.99:1 ✓ · /paper 5.44:1 ✓
  - gold-deep(`#6a4c20`)/gold-soft 7.02:1 ✓
  - success(`#2b7562`)/success-soft 4.73:1 ✓ · /paper 5.41:1 ✓ · /mastered 배경(color-mix 10% surface) 4.79:1 ✓
  - accent-dark/gold-soft 4.83:1 ✓ (EmptyState 마크 — 큰 텍스트 3:1 기준) · ink-soft/surface-muted 5.56:1 ✓ (HintBox 중성화)
- 모든 인터랙티브 요소에 보이는 `:focus-visible` 링(`--color-focus`)
- 모든 기능을 키보드만으로 사용 가능(탐색, 답 제출, 그래프 조작 포함)
- 터치 타깃 최소 44px(버튼 기본 46.4px 충족)
- 정답/오답을 색만으로 구분하지 않음
- `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors`, `print` 대응 유지(`base.css`에 이미 구현 — 제거 금지)
- 320px 폭에서 가로 스크롤 없이 핵심 학습 가능
- SVG에는 제목·설명 제공, 채점 결과를 보조기술에 알림(`aria-live`)

### 승인된 부채 (Accepted Debt)

| 항목 | 위치 | 이유 | 해소 시점 |
|------|------|------|----------|
| `--color-focus`(#0b6f77)와 navy 계열의 식별성 | `tokens.css` | 포커스 링이 브랜드 네이비와 충분히 구분되는지 시각 검증 필요 | 스크린 리더·키보드 검수 시 |

해소 완료(2026-08 토큰 정리): `mint` 3토큰 → `success` 통합, `--font-display` 폐지(`--font-sans`로), 골드 비숙련 용도(hint-box·example·경고) → 중성/warning 토포로 이관.

새 부채는 받아들이는 순간 이 표에 기록한다. 조용히 받아들이지 않는다.

## 검증 체크리스트 (컴포넌트 구현 후)

- [ ] 모든 색이 §2 표의 토큰을 참조하는가 — `DESIGN.md` 밖의 raw hex가 없는가
- [ ] 폰트 크기가 §3 스케일에 있는가
- [ ] 간격이 §4 토큰에 매핑되는가 (`clamp()` 등 브라우저 메커니즘은 예외)
- [ ] 인터랙티브 요소가 hover/active/focus/disabled 상태를 모두 가지는가
- [ ] 깊이 표현이 §7 전략(라인 우선)을 따르는가
- [ ] 2회 이상 재사용된 컴포넌트가 §5에 문서화되어 있는가
- [ ] 모션이 §6 타이밍을 따르고 상태 변화에만 존재하는가
- [ ] §8 접근성 제약이 유지되는가 — 새 부채가 있다면 표에 기록했는가
- [ ] 빈 상태·긴 라벨·끊기지 않는 문자열에서도 무너지지 않는가 (375px에서 1열 리플로우)
