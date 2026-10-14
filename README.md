# Activity Discovery Platform

A mobile-first platform designed to turn *"I want to do this"* into *"I found the right people and we made a plan."* The platform enables users to state their interests, discover relevant activities nearby, create gatherings, coordinate participants with host approval, and communicate safely in activity-scoped groups.

---

## 1. Confirmed Technology Stack

| Component | Technology | Rationale & Status |
| :--- | :--- | :--- |
| **Mobile Client** | **Flutter & Dart** (Flutter 3.47.2 / Dart 3.13.2) | Android-first cross-platform client; modular feature-first architecture (`lib/core/`, `lib/features/auth`, `profile`, `activities`, `memberships`, `chat`, `notifications`). |
| **Backend API** | **Node.js, TypeScript, NestJS** (v12) | Modular monolith architecture exposing a versioned HTTPS REST API (`/api/v1`) with centralized exception filtering and environment validation. |
| **Database** | **PostgreSQL + PostGIS** | Relational data integrity, atomic capacity enforcement, and spatial indexing for distance-based discovery. |
| **Authentication** | **Supabase Auth** | Secure authentication handling; tokens verified server-side without exposing service-role keys to mobile. |
| **Real-time Chat** | **Socket.IO / WebSockets** | Activity-scoped group chat with server-side membership authorization. |
| **Push Notifications** | **Firebase Cloud Messaging (FCM)** | Asynchronous, retryable push delivery decoupled from database transactions. |

---

## 2. Workspace Structure

```
C:\AS app\
├── docs/                                 # Authoritative specification documents (preserved)
│   ├── SRS_v1.0.pdf
│   ├── System_Architecture_and_Database_Diagrams.pdf
│   ├── UML_Workflow_Diagrams.pdf
│   ├── UI_UX_Design.pdf
│   └── Development_and_Testing_Plan.pdf
├── mobile/                               # Flutter mobile application
│   ├── lib/
│   │   ├── core/                         # Shared theme, constants, presentation shell
│   │   └── features/                     # Feature modules (auth, profile, activities, memberships, chat, notifications)
│   ├── test/                             # Widget and unit tests
│   ├── pubspec.yaml                      # Flutter dependencies and assets
│   └── analysis_options.yaml             # Dart static analysis configuration
├── backend/                              # NestJS API application
│   ├── src/
│   │   ├── common/                       # Filters (HttpExceptionFilter), interceptors, pipes
│   │   ├── config/                       # Type-safe environment validation
│   │   ├── modules/                      # Health and feature module placeholders
│   │   ├── app.module.ts                 # Root application module
│   │   └── main.ts                       # Entry point (global prefix /api/v1, CORS, filters)
│   ├── test/                             # E2E test suite (vitest)
│   ├── package.json                      # Backend dependencies & npm scripts
│   ├── tsconfig.json                     # TypeScript configuration
│   └── .env.example                      # Safe placeholder environment configuration
├── .gitignore                            # Root gitignore (Flutter, Node, secrets, builds)
├── .env.example                          # Root environment variables template
└── README.md                             # Project documentation
```

---

## 3. Prerequisites

### Required Tools (Installed & Verified)
- **Flutter SDK**: `3.47.2` (channel stable)
- **Dart SDK**: `3.13.2`
- **Node.js**: `v24.17.0`
- **npm**: `11.13.0`
- **Git**: `2.55.0`

### Optional / Milestone-Specific Dependencies
- **PostgreSQL 15+ with PostGIS**: Required in Milestone 1 & 2 for persistent data and spatial queries.
- **Docker / Docker Desktop**: Optional; recommended for running local PostgreSQL with PostGIS (`postgis/postgis` container).
- **Android SDK & Device/Emulator**: Android SDK 37.0.0 is installed. To test on Android, accept licenses with `flutter doctor --android-licenses`.

---

## 4. Getting Started

### Backend Setup & Execution

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the application:
   ```bash
   npm run build
   ```

5. Start the backend in development mode:
   ```bash
   npm run start:dev
   ```

6. Verify the health endpoint:
   ```bash
   curl http://localhost:3000/api/v1/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "service": "activity-discovery-api",
     "version": "1.0.0",
     "timestamp": "...",
     "uptimeSeconds": 1
   }
   ```

### Mobile Application Setup & Execution

1. Navigate to the mobile directory:
   ```bash
   cd mobile
   ```

2. Resolve dependencies:
   ```bash
   flutter pub get
   ```

3. Run static analysis:
   ```bash
   flutter analyze
   ```

4. Launch the application (on connected Chrome, Windows desktop, or Android device):
   ```bash
   flutter run -d chrome
   ```
   *(Or target an Android device/emulator once licenses are accepted)*

---

## 5. Testing & Quality Verification

### Backend Tests & Quality Checks
Run from the `backend/` directory:
- **Unit Tests**: `npm test`
- **E2E Integration Tests**: `npm run test:e2e`
- **Code Formatting**: `npm run format`
- **Static Analysis / Linting**: `npm run lint`

### Mobile Tests & Quality Checks
Run from the `mobile/` directory:
- **Widget & Unit Tests**: `flutter test`
- **Code Formatting**: `dart format --output=none --set-exit-if-changed lib test`
- **Static Analysis**: `flutter analyze`
- **Bundle Verification**: `flutter build bundle`

---

## 6. Database & Migration Strategy (Roadmap for Milestone 1 & 2)

### Planned Database Schema
- **PostgreSQL** relational database with UTC timestamps, foreign keys, and unique constraints:
  - `users`: Managed alongside Supabase Auth (`auth_subject unique`).
  - `interests` & `user_interests`: Hierarchical category taxonomy and many-to-many user preferences.
  - `activities`: Scheduled activities with venue, capacity ($min \le max$), and status.
  - `activity_memberships`: Membership records with status (`requested`, `approved`, `rejected`, `left`) and `UNIQUE(activity_id, user_id)`.
  - `messages`: Activity-scoped group chat with server-side authorization.
  - `blocks` & `reports`: Safety and moderation entities.
  - `admin_audit_logs`: Immutable privileged action logging.

### Planned PostGIS Integration (Milestone 2)
- PostGIS `GEOGRAPHY(Point, 4326)` column on `activities` (`location_point`) with spatial GiST indexing (`CREATE INDEX idx_activities_location ON activities USING GIST(location_point)`).
- Bounded radius queries using `ST_DWithin` to find activities within a user's specified distance (e.g. 5 km, 10 km) without exposing exact coordinates of participants.

### Migration Management
- Database migrations will be managed using a typed ORM/migration runner (Prisma or TypeORM / Drizzle) introduced in Milestone 1.
- All migrations will be checked into source control with rollback procedures tested before deployment.
- **Core Security Rule**: Flutter will *never* connect directly to PostgreSQL. The NestJS backend remains the sole authoritative layer for database transactions and capacity enforcement.

---

## 7. Status & Milestones

- [x] **Milestone 0: Project Foundation** *(Completed)*
  - Flutter application shell, theme, and feature-first module structure.
  - NestJS modular monolith with `/api/v1/health` endpoint, global error filter, and environment validation.
  - Test suites, static analysis, and CI-ready configurations verified.
- [x] **Milestone 1: Identity & Onboarding** *(Completed)*
  - Supabase Auth integration, user profiles, interests taxonomy, secure JWT verification.
- [x] **Milestone 2: Activity Core & Discovery** *(Completed)*
  - Create/edit/cancel activities, details, filters, PostGIS radius search API (`ST_DWithin`).
- [x] **Milestone 3: Join Workflow & Concurrency Control** *(Completed)*
  - Atomic capacity locking, transactions (`FOR UPDATE`), host approval/rejection lifecycle.
- [x] **Milestone 4: Real-Time Chat & Real-Time Messaging** *(Completed)*
  - Socket.IO rooms, message pagination, deduplication, host & participant authorization.
- [x] **Milestone 5: Notifications & Activity Lifecycle** *(Completed)*
  - In-app notification center, FCM push integration, idempotent scheduled reminders.
- [x] **Milestone 6: Production Readiness, Security Audit & Deployment Preparation** *(Completed)*
  - Request ID tracing, sliding-window rate limiting, security headers, production logging, safe error masking.
  - Database pool shutdown hooks, liveness (`/health`) and readiness (`/health/ready`) probes.
  - Flutter Android release configuration, dynamic API URL, and permission declarations.
  - Full production deployment guide: [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md).
- [x] **Milestone 7: Real-Device QA, Integration Testing & Beta Release** *(Completed)*
  - 14-step automated end-to-end product journey verified.
  - In-flight double-tap prevention guards implemented across activity creation and join requests.
  - Android release signing configuration supporting local `key.properties` with safe debug fallback.
  - Verified Android Release APK (`53.2MB`) and App Bundle AAB (`51.6MB`) built cleanly with production defines.
