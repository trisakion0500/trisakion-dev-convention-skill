# trisakion-dev-convention-skill

개인 개발 컨벤션(SP/동시성/보안 설계 원칙)을 담은 Claude Code 스킬

## 다루는 범위

- 코드 스타일 (들여쓰기, 주석, Swagger 문서화)
- Git/커밋 규칙
- 테스트 태도
- SP/Function 작성 규약 (네이밍, 권한체크, 결과반환, 본문흐름, TOCTOU, 전역 테이블 잠금순서를 통한 데드락 방지)
- 동시성 · 멱등성 · 상태전이 3관점 레이스 컨디션 점검
- 로그 DB 물리 분리, 애플리케이션 로깅 원칙
- 코드 모듈화
- TypeScript 에러 처리 (ERROR_MAP + BusinessException)
- 의존성 버전 관리
- 문서 보안
- 협업 방식
- 보안 (S2S HMAC 인증, SQL Injection 방지, 비밀번호 저장, XSS/CSRF/httpOnly 쿠키)

## 설치

```bash
npx skills add trisakion0500/trisakion-dev-convention-skill --skill trisakion-dev-convention-skill --agent claude-code
```

프로젝트 루트에서 실행하면 `.claude/skills/trisakion-dev-convention-skill/`에 설치됩니다.

## 업데이트

이 저장소가 갱신된 뒤, 설치된 프로젝트에서:

```bash
npx skills update
```

## 적용 중인 프로젝트

- GM Platform
- Coupon Platform
