<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

For Milestone 1, set `DATABASE_URL` and `SUPABASE_URL` plus `SUPABASE_ANON_KEY` in `.env`.
The API verifies Supabase access tokens with Supabase Auth; an optional legacy HS256
`SUPABASE_JWT_SECRET` can be configured for local cryptographic verification. The Flutter
app only receives the Supabase publishable/anon key and never a service-role key.

Milestone 2 uses the existing `profiles` and `interests` tables and adds `activities`
with migration `002_create_activities.sql`. PostgreSQL must have PostGIS available
because the migration enables it and stores an optional public meeting point as
`GEOGRAPHY(Point, 4326)`. Configure the database URL for a PostgreSQL instance where
the role can create PostGIS extensions, then apply migrations and seed interests:

Apply the checked-in PostgreSQL migration and seed the curated interest list with:

```bash
npm run db:migrate
npm run db:seed
```

The mobile app reads configuration from Dart defines, for example:

```bash
flutter run --dart-define=SUPABASE_URL=https://your-project.supabase.co --dart-define=SUPABASE_ANON_KEY=your-publishable-key --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

## Activities API

All activity endpoints require `Authorization: Bearer <Supabase access token>`.
The host profile is resolved from the verified token; client-provided host IDs are
not accepted. `maxParticipants` is the total activity capacity and includes the host.
An activity capacity of 6 therefore leaves at most 5 future guest places.

- `POST /api/v1/activities` creates a public or invite-only scheduled activity.
- `GET /api/v1/activities` lists public scheduled activities, ordered by start time
  and activity ID. Supports `categoryId`, `from`, `to`, `location`, and pagination
  (`limit` up to 50, `offset` up to 10000). Optional spatial filtering accepts
  `latitude`, `longitude`, and `radiusKm` together.
- `GET /api/v1/activities/:id` returns details. Invite-only activities are hidden
  from non-host users until a later invitation workflow exists.
- `PATCH /api/v1/activities/:id` updates an activity owned by the caller.
- `PATCH /api/v1/activities/:id/cancel` marks an owned activity as cancelled.

Activity endpoints require a completed user profile. The client sends activity
date/time values as ISO 8601 timestamps. Location coordinates are optional and are
never returned in public activity responses; venue/address text remains visible as
the selected meeting point.

## Join requests and participants API

Membership endpoints require the same verified Supabase bearer token. The user
profile is resolved from the token subject on the server; request bodies never
select the requester or the host.

- `POST /api/v1/activities/:id/join` creates a `requested` membership for
  approval activities or immediately creates an `approved` membership for
  auto-join activities.
- `GET /api/v1/memberships/me` lists the caller's requests and memberships.
- `GET /api/v1/activities/:id/membership` returns the caller's state, or
  `{ "status": "none" }` when they have no membership.
- `DELETE /api/v1/activities/:id/membership` withdraws a pending request or
  leaves an approved activity.
- `GET /api/v1/activities/:id/requests` is host-only and returns pending
  requesters' display names and avatar URLs.
- `POST /api/v1/activities/:activityId/requests/:membershipId/approve` and
  `/reject` are host-only and accept only a pending request.
- `GET /api/v1/activities/:id/participants` returns the host and approved
  participants only to the host or an approved participant.

`activity_memberships` has one row per activity/user. Rejected, withdrawn, or
left memberships can be resubmitted by transitioning that same row back to
`requested`; a removed membership cannot be reactivated. Pending and approved
memberships cannot be duplicated. The host is represented
by `activities.host_user_id`, not a guest membership row, and capacity counts
`1 + approved guest memberships`. New joins and host approvals lock the activity
row in a transaction, recheck status, start time, and capacity, and then update
the membership. Activity edits use the same lock and cannot lower the maximum
below the confirmed participant total. Pending requests do not consume places.

For local database verification, configure `DATABASE_URL` in `backend/.env` for
a reachable PostgreSQL instance with PostGIS enabled and a role permitted to
apply the checked-in migrations. Then run `npm run db:migrate` from `backend/`
and verify `003_create_activity_memberships.sql` is listed in
`schema_migrations`. Use a known development database only. The migration
runner applies forward migrations and does not run down migrations. The down
migration is available for a deliberate, separately reviewed rollback. The
configured database could not be reached during Milestone 3 verification
(`ENOTFOUND`), so the migration was not applied.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
