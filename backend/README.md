# KAISUNCELL inquiry integration (not yet active)
Current GitHub Pages contains the contact form and administrator UI only. No inquiry data is stored until a secure server is configured.

## Recommended components
Cloudflare Worker: API server; Cloudflare D1: private inquiry database (schema.sql); Cloudflare Access: administrator authentication; Turnstile and server-side rate limiting: spam protection.

## Endpoint contract
POST /api/inquiries (public): JSON {type,company,name,email,phone,subject,message}; returns {id} after server-side validation and spam protection.
GET /api/admin/inquiries?status=new (authenticated): returns {items:[{id,created_at,type,company,name,email,phone,subject,message,status}]}.
PATCH /api/admin/inquiries/:id (authenticated): accepts {status:"new"|"in_progress"|"done"}.

## Before launch
1. Deploy a Worker with private D1 database and migrate schema.sql.
2. Enforce identity authentication and authorization on every administrator API endpoint; no passwords, token secrets, or private data in GitHub Pages.
3. Add server-side payload validation, origin allowlist, rate limiting, spam verification, retention and data deletion rules.
4. Finalize the public privacy policy and data retention/consent language before accepting submissions.
5. Once verified, declare window.KAISUNCELL_INQUIRY_API and window.KAISUNCELL_ADMIN_API as the trusted Worker origin in the respective HTML pages before loading their scripts.
6. Test real POST, GET, PATCH, blocked unauthorized access, desktop and mobile.

The administrator UI is accessible as static markup; the data API must be private. Do not assume the path /admin is a security boundary.
