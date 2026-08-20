# 매듭수학

미국 중·고등 수학의 대표적인 학습 경로를 Common Core State Standards for Mathematics(CCSS-M)를 참조해 구성하고, Honors, College Board AP, IB Diploma Programme, 대학 초급(Post-AP/Dual Enrollment) 심화 과정을 연결한 정적 웹 서비스입니다. 서버와 데이터베이스 없이 HTML, CSS, JavaScript만 사용하며 학습 기록은 현재 브라우저에 저장됩니다.

## “미국 기준”의 의미

미국에는 교육부가 정한 단일 연방 교육과정이나 전 과목 국가 표준이 없습니다. 주와 지역 교육기관이 표준과 교육과정을 결정합니다. 이 프로젝트의 `CCSS-M` 표시는 **연방 교육과정**이라는 뜻이 아니라, 여러 주에서 공통 참조점으로 쓰이는 Common Core 수학 성취기준에 매핑했다는 뜻입니다. 실제 학교의 과목 순서, 학점, 졸업 요건, Honors 편성은 주·교육구·학교에 따라 다를 수 있습니다.

제공 범위는 다음과 같습니다.

- Middle School: Grade 6, 7, 8
- High School Core/Honors: Algebra I, Geometry, Algebra II, Precalculus
- College Board AP: AP Precalculus, AP Calculus AB, AP Calculus BC 확장, AP Statistics
- IB DP: Mathematics: Analysis and Approaches(AA) SL/HL, Applications and Interpretation(AI) SL/HL
- Post-AP / Dual Enrollment: Multivariable Calculus, Linear Algebra, Differential Equations, Discrete Mathematics

AP Statistics는 **2026–27학년도부터 적용되는 개정 5-unit 체계**를 기준으로 합니다. 종전 9-unit 자료와 단원 번호가 다를 수 있습니다.

## 로컬 실행

콘텐츠를 `fetch`로 불러오므로 `index.html`을 파일로 직접 열지 말고 간단한 정적 서버를 사용합니다.

```powershell
node scripts/serve.mjs
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다.

## 검사

별도 패키지 설치 없이 Node.js 20 이상에서 실행됩니다.

```powershell
npm test
```

검사는 하위 manifest를 재귀적으로 따라가며 모든 단원의 메타데이터, ID, 문제 구조, 선수개념 존재 여부와 순환, 과정별 최소 범위를 확인합니다. 오류 메시지에 표시된 파일과 필드를 먼저 수정하면 됩니다.

## 콘텐츠 구조와 공통 메타데이터

`content/middle/manifest.json`과 `content/high/manifest.json`이 진입점입니다. 각 manifest는 단원 파일을 담은 `units` 배열과 다른 manifest를 포함하는 `manifests` 배열을 함께 또는 따로 가질 수 있습니다. 모든 경로는 해당 manifest 파일을 기준으로 한 상대 경로입니다. 같은 하위 manifest나 같은 단원 경로를 여러 번 참조하면 한 번만 로드하며, manifest 순환 참조는 오류로 처리합니다.

모든 단원은 기존 필드에 더해 아래 메타데이터를 가져야 합니다.

| 필드 | 계약 |
|---|---|
| `framework` | `CCSS-M`, `College Board AP`, `IB DP`, `Dual Enrollment` 중 하나 |
| `level` | `Core`, `Honors`, `AP`, `IB SL`, `IB HL`, `Post-AP` 중 하나 |
| `standards` | 하나 이상의 비어 있지 않은 문자열 |
| `pathways` | 검색 가능한 학습 경로명 문자열 배열 |
| `sources` | 공식 근거를 가리키는 `https` URL 배열 |
| `aliases` | 이전 ID나 대체 과목·개념명 문자열 배열 |

카탈로그의 과정, 학년, 수준, 영역 필터는 실제 단원 데이터에서 선택지를 만들며, 검색은 제목·설명·별칭뿐 아니라 `standards`와 `pathways`도 포함합니다.

## GitHub Pages 배포

1. 저장소의 기본 브랜치를 `main`으로 설정합니다.
2. GitHub 저장소의 **Settings → Pages → Source**에서 **GitHub Actions**를 선택합니다.
3. `main`에 푸시하면 콘텐츠 검사 후 정적 파일이 자동 배포됩니다.

프로젝트 사이트의 하위 경로에서도 동작하도록 모든 브라우저 자산과 콘텐츠 경로는 상대경로를 사용합니다.

## 현재 제공하는 기능

- 학교급·과목·영역별 단원 탐색과 검색
- 개념, 공식, 예제, 단계별 연습문제
- 객관식·숫자·분수·좌표·벡터·집합 채점
- 단계별 힌트와 해설
- 브라우저 기반 진도·숙련도·복습 기록
- 학습 기록 JSON 내보내기와 가져오기
- 모바일 반응형 화면과 키보드 접근성

상세한 범위와 로드맵은 [PROJECT_PLAN.md](./PROJECT_PLAN.md)를 참고하세요.

## 공식 기준 자료

- [U.S. Department of Education — Federal Role in Education](https://www.ed.gov/about/ed-overview/federal-role-in-education): 교육과정과 요건은 주·지역의 책임이라는 설명
- [Common Core State Standards Initiative — Mathematics Standards](https://corestandards.org/mathematics-standards/): Grades 6–8 및 High School CCSS-M
- [College Board — AP Precalculus](https://apcentral.collegeboard.org/courses/ap-precalculus)
- [College Board — AP Calculus AB](https://apcentral.collegeboard.org/courses/ap-calculus-ab)
- [College Board — AP Calculus BC](https://apcentral.collegeboard.org/courses/ap-calculus-bc)
- [College Board — AP Statistics](https://apcentral.collegeboard.org/courses/ap-statistics)
- [College Board — AP Statistics Revisions](https://apcentral.collegeboard.org/courses/ap-statistics/future-revisions): 2026–27 적용 및 5-unit 통합 근거
- [International Baccalaureate — Diploma Programme Mathematics](https://www.ibo.org/programmes/diploma-programme/curriculum/mathematics/): AA/AI, SL/HL 공식 개요

Post-AP 과목은 미국 전역의 단일 표준이 없으므로 `Dual Enrollment`로 표시하고, 각 단원 `sources`에 사용한 대학 공개 강의계획서 또는 공개 교재의 정확한 URL을 기록합니다.
