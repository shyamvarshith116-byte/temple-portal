# Database Operations, Migration & Backup Practices
## Smart Multi-Temple Prasadam Booking Portal (PostgreSQL 16+)

### 1. Golden Rules of Database Operations

> [!CAUTION]
> **NEVER RESET OR DROP A PRODUCTION DATABASE**:
> Never execute `prisma migrate reset`, `prisma db push --force-reset`, or raw `DROP TABLE / DROP DATABASE` in staging or production.
> Financial records (`bookings`, `payments`, `booking_items`), audit trails (`audit_logs`), and customer requests must never be wiped.

---

### 2. Environment Configuration & Connection Management

The PostgreSQL connection string is strictly held on the shared backend service. Neither frontend web application has access to `DATABASE_URL`.

#### Connection String Configurations:

```bash
# Standard direct connection (Development)
DATABASE_URL="postgresql://postgres:your_secure_password@localhost:5432/temple_prasadam_portal?schema=public&sslmode=prefer"

# Production Connection with PgBouncer / Connection Pooler
DATABASE_URL="postgresql://temple_app_user:strong_password@db-pooler.internal:6543/temple_prasadam_portal?pgbouncer=true&connection_limit=50&sslmode=require"

# Direct URL for Prisma migrations (bypassing connection pooler)
DIRECT_URL="postgresql://temple_migrator:migrator_password@db-master.internal:5432/temple_prasadam_portal?sslmode=require"
```

---

### 3. Safe Migration Workflow

Prisma migrations follow a strict lifecycle from local development through staging to zero-downtime production rollout.

```
+--------------------------------------------------------------------------+
| 1. Local Development                                                     |
|    - Modify prisma/schema.prisma                                         |
|    - Run: npx prisma validate                                            |
|    - Run: npx prisma migrate dev --name <descriptive_name>              |
|    - Review generated SQL in prisma/migrations/                          |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+------------------------------------+-------------------------------------+
| 2. CI/CD Pipeline & Review                                               |
|    - Run: npx prisma validate                                            |
|    - Run: npx tsc --noEmit                                               |
|    - Run automated unit & integration tests                              |
|    - Peer review of migration SQL script                                 |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+------------------------------------+-------------------------------------+
| 3. Staging & Production Deployment                                       |
|    - Automated pre-migration snapshot / WAL backup                       |
|    - Run: npx prisma migrate deploy                                      |
|    - Verify database schema state: npx prisma migrate status             |
+--------------------------------------------------------------------------+
```

#### Safe Commands Reference:

| Goal | Environment | Recommended Command | Rationale |
| :--- | :--- | :--- | :--- |
| **Validate Schema** | Any | `npx prisma validate` | Checks syntax, relations, and types with 0 database contact |
| **Typecheck Project**| Any | `npx tsc --noEmit` | Verifies TypeScript compilation against generated Prisma types |
| **Create New Migration** | Local Dev Only | `npx prisma migrate dev --name add_slot_buffer` | Generates versioned migration SQL and applies to local DB |
| **Preview Migration SQL** | Any | `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.new.prisma --script` | Dry-run review of exact DDL statements before applying |
| **Check Migration Status** | Staging / Prod | `npx prisma migrate status` | Non-destructive check verifying which migrations have been applied |
| **Apply Pending Migrations** | Staging / Prod | `npx prisma migrate deploy` | Applies unapplied versioned migrations safely without prompting or dropping |
| **Seed Development DB** | Local Dev Only | `npm run prisma:seed` | Populates mock temples, staff, offerings, and test counters |

---

### 4. Least-Privilege Role-Based Database Accounts

PostgreSQL application accounts must strictly observe the principle of least privilege:

```sql
-- 1. Migration User (Full DDL permissions during deployment)
CREATE ROLE temple_migrator WITH LOGIN PASSWORD 'migrator_secure_pass';
GRANT CONNECT ON DATABASE temple_prasadam_portal TO temple_migrator;
GRANT ALL PRIVILEGES ON SCHEMA public TO temple_migrator;

-- 2. Application Runtime User (DML only, no DDL drops)
CREATE ROLE temple_app_user WITH LOGIN PASSWORD 'app_secure_pass';
GRANT CONNECT ON DATABASE temple_prasadam_portal TO temple_app_user;
GRANT USAGE ON SCHEMA public TO temple_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO temple_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO temple_app_user;

-- Ensure newly created tables inherit runtime permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO temple_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO temple_app_user;

-- 3. Read-Only Auditor / Analytics User
CREATE ROLE temple_readonly WITH LOGIN PASSWORD 'readonly_secure_pass';
GRANT CONNECT ON DATABASE temple_prasadam_portal TO temple_readonly;
GRANT USAGE ON SCHEMA public TO temple_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO temple_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO temple_readonly;
```

---

### 5. Automated Backup, Archival & Disaster Recovery Strategy

1. **Continuous Point-In-Time Recovery (PITR)**:
   - Enable PostgreSQL Write-Ahead Logging (WAL) archiving (e.g. `wal_level = replica`, `archive_mode = on`).
   - Store archived WAL segments in geographically redundant object storage (AWS S3 Glacier or Google Cloud Storage) with a 35-day retention window.
   - Recovery Point Objective (RPO): < 5 minutes.
2. **Daily Logical Backups**:
   - Automated nightly `pg_dump` with custom compressed format:
     ```bash
     pg_dump -h db-master.internal -U temple_migrator -F c -b -v -f "/backups/temple_prasadam_$(date +%Y%m%d_%H%M%S).dump" temple_prasadam_portal
     ```
   - Automated test restores executed weekly on an ephemeral staging database to verify backup integrity.
3. **Automated AI & Ephemeral Data Purge Job**:
   - Nightly scheduled job executing the 30-day retention purge:
     ```sql
     -- Remove expired ephemeral location checks
     DELETE FROM location_requests WHERE expires_at < NOW();

     -- Purge AI conversations older than 30 days
     DELETE FROM ai_messages WHERE conversation_id IN (
       SELECT id FROM ai_conversations WHERE created_at < NOW() - INTERVAL '30 days'
     );
     DELETE FROM ai_conversations WHERE created_at < NOW() - INTERVAL '30 days';
     ```
