# KAISUNCELL /admin 배포 안내

현재 GitHub Pages는 정적 호스팅입니다. API를 실제 운영하려면 Cloudflare Workers + D1 DB를 배포해야 합니다.

1. Cloudflare에 로그인하고 backend 폴더에서 `npx wrangler d1 create kaisuncell`을 실행합니다.
2. 생성된 database_id를 backend/wrangler.toml에 기입합니다.
3. `npx wrangler d1 execute kaisuncell --remote --file=./schema.sql`을 실행합니다.
4. `npx wrangler secret put ADMIN_PASSWORD`와 `npx wrangler secret put SESSION_SECRET`으로 강력한 별도 비밀값을 등록합니다.
5. `npx wrangler deploy`를 실행합니다.
6. 배포된 workers.dev 주소를 루트 api-config.json의 apiBaseUrl에 기록합니다.

관리자: https://kaisuncell.com/admin/
기능: 관리자 비밀번호 로그인, 문의 열람/상태 변경, 오늘/7일/30일/누적 방문, 유입경로 및 인기 페이지.
주의: API 배포 전에는 실제 데이터 수집이 되지 않습니다. GitHub 공개 저장소에 고객 문의나 비밀번호를 저장하지 마세요.
Cloudflare WAF rate limiting과 D1 백업, 개인정보 보유기간/파기 정책을 별도로 설정하고 테스트 문의 및 방문 이벤트를 검증해야 합니다.