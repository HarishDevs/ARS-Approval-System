# Email provider comparison (read 14 Nov 2026)

## Constraint that decides most of this

**The app can't open outgoing SMTP connections on GoDaddy hosting** (VERIFIED for the hosting's own server on 465: `EACCES`). If that applies to all SMTP ports, any provider used **over SMTP** will be blocked the same way, and only providers with an **HTTPS API** (port 443, which works: Resend's API worked from live) are usable.

The v1.54.14 diagnostic checks this from the live server, by testing an outside SMTP provider on ports 587 and 2525. Until it has run, treat SMTP-only options as UNVERIFIED for this hosting.

Free tiers change. The figures below are as the providers' own pricing pages stated them on 14 Nov 2026; check again before choosing. Where a page couldn't be read, it says so.

| Provider | Free allowance | HTTPS API | SMTP | Card for free plan | Notes |
|---|---|---|---|---|---|
| **GoDaddy relay** (localhost / relay-hosting) | 500/day per sender, 500/hour per account (GoDaddy help 27150) | No | Port 25 only, no TLS, no sign-in | n/a (part of hosting) | Accepts our mail; **delivery not confirmed yet** |
| **GoDaddy hosting SMTP 465/587** (signed in) | Same limits | No | Yes | n/a | **Blocked from the app** (EACCES) |
| **Resend** (already integrated) | 3,000/month, **100/day** | Yes | Yes | Not stated | Today's quota is used up daily; paid plans raise it |
| **Brevo** | Page not readable on 14 Nov | Yes (API) | Yes (smtp-relay.brevo.com) | UNVERIFIED | Check the pricing page directly |
| **Amazon SES** | Pricing page: free-tier credits for 6 months; FAQ: 3,000 messages/month for 12 months (they disagree) | Yes | Yes | AWS account needed (UNVERIFIED for card) | Starts in **sandbox** (verified recipients only) until AWS approves production |
| **SMTP2GO** | 1,000/month | API not stated on pricing page | Yes | "No credit card required" | Daily cap not stated |
| **Mailjet** | 6,000/month, **200/day** | Yes (Send API) | Yes (25/465/587/2525) | "No credit card required" | 1,000 contacts on free |
| **MailerSend** | 500/month, 100 daily API requests | Yes | Yes | **Card required** | Account approval first |
| **Postmark** | 100/month | Yes | Yes | "No Credit Card Required" | Too small |
| **SendGrid** | 100/day for **60 days** (a trial) | Yes | Yes | No card for the trial | Not a lasting free plan |

## Recommendation

1. **Now:** keep Resend as the fallback (it delivers whenever today's quota isn't used up). Fix or confirm the GoDaddy relay with support. It's free and allows 500/day if it delivers.
2. **If the GoDaddy relay can't be made to deliver,** use an **HTTPS-API** provider:
   - **Mailjet** (free 200/day, 6,000/month, no card) or **Brevo** (check its current free daily allowance) for free use;
   - **Resend's paid plan** if the volume grows. It's already integrated: no code change, just a plan change.
   
   Adding Mailjet's or Brevo's HTTPS API is a small change to the one sender (a new provider next to `RESEND`): about a day of work with tests.
3. **Newsletters** (future) belong on a bulk platform (Brevo / Mailjet marketing), never on the transactional route and never on a Gmail/Workspace mailbox.

At about 100 emails an hour, no free plan carries a busy day on its own (Resend 100/day, Mailjet 200/day). Expect either the GoDaddy relay (500/day) or a paid plan for full volume.
