# Smart Multi-Temple Prasadam Booking Portal
## Stage 1: Common Relational Database Architecture & ER Design

### 1. Executive Architectural Overview

This document specifies the logical and physical relational database architecture for the **Smart Multi-Temple Prasadam Booking Portal**. A single logical PostgreSQL database serves both the **Devotee Portal** (public/devotee web application) and the **Admin Portal** (temple administrators, counter staff, and main super-admins) exclusively through a unified, shared backend API service.

```
+------------------------------------+      +-----------------------------------+
|           Devotee Portal           |      |            Admin Portal           |
| (Browse, Book, Pay, QR, Track, AI) |      | (Temples, Items, Stock, Scans, BI)|
+------------------+-----------------+      +-----------------+-----------------+
                   |                                          |
                   |               HTTPS / REST / WS          |
                   +-------------------+  +-------------------+
                                       |  |
                                       v  v
                    +---------------------------------------+
                    |           Shared Backend API          |
                    | (Authentication, RBAC, Business Logic,|
                    |  Stock Mutex, Payment Webhook Handler)|
                    +-------------------+-------------------+
                                        |
                            Prisma ORM (Connection Pool)
                                        |
                                        v
                    +---------------------------------------+
                    |    Unified PostgreSQL 16+ Database    |
                    |   (ACID, FK Constraints, Zero-Loss)   |
                    +---------------------------------------+
```

#### Core Design Invariants:
1. **Single Common Logical Database**: Neither frontend connects directly to PostgreSQL. All read/write operations execute through the shared backend API with connection pooling (`PgBouncer`/Prisma engine).
2. **Strict Financial & Historical Immutability**: Prasadam prices and names change over time in temple catalogues. To protect financial auditability, booking items snapshot the name, SKU, and unit price at booking time. Booking and payment records never cascade-delete.
3. **Zero-Overselling Inventory Engine**: Real-time stock isolation using transactional row-level locking (`SELECT ... FOR UPDATE`), atomic inventory movements, and time-bounded reservations (`inventory_reservations`) with TTL to prevent race conditions during festival rushes.
4. **Role-Based Access Control (RBAC) & Temple Scoping**: Granular role assignments allowing global super-administrators (`MAIN_ADMIN`) and temple-scoped administrators (`TEMPLE_ADMIN`, `COUNTER_STAFF`). Admin access requests require explicit super-admin approval.
5. **Data Protection & PII Segregation**: Devotee contact snapshots and location verification data are stored with strict retention bounds. AI conversation logs are stripped of PII and governed by automated 30-day purge retention policies.

---

### 2. Entity-Relationship (ER) Diagram

The following Mermaid diagram outlines the entity schema, relationships, cardinality, and key constraints across all 6 core functional domains:

```mermaid
erDiagram
    %% ==========================================
    %% ACCOUNTS AND PERMISSIONS
    %% ==========================================
    users ||--o{ user_roles : has
    roles ||--o{ user_roles : assigns
    users ||--o{ admin_access_requests : submits
    users ||--o{ sessions : maintains
    users ||--o{ audit_logs : triggers
    
    users {
        uuid id PK
        string email UK
        string phone_number UK
        string password_hash
        string full_name
        string avatar_url
        string status "ACTIVE, SUSPENDED, DELETED"
        boolean is_email_verified
        boolean is_phone_verified
        timestamp created_at
        timestamp updated_at
    }

    roles {
        uuid id PK
        string name UK "DEVOTEE, COUNTER_STAFF, TEMPLE_ADMIN, MAIN_ADMIN, AUDITOR"
        string description
        jsonb permissions
        timestamp created_at
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        uuid temple_id FK "Nullable: null for MAIN_ADMIN, set for TEMPLE_ADMIN"
        uuid assigned_by FK
        timestamp assigned_at
    }

    admin_access_requests {
        uuid id PK
        uuid user_id FK
        uuid target_role_id FK
        uuid temple_id FK
        string justification
        string status "PENDING, APPROVED, REJECTED"
        uuid reviewed_by FK
        string rejection_reason
        timestamp reviewed_at
        timestamp created_at
    }

    sessions {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        string user_agent
        string ip_address
        boolean is_revoked
        timestamp expires_at
        timestamp created_at
    }

    %% ==========================================
    %% TEMPLES AND PUBLIC CONTENT
    %% ==========================================
    temples ||--o{ user_roles : scopes
    temples ||--o{ containers : organizes
    temples ||--o{ prasadam_items : offers
    temples ||--o{ pickup_counters : operates
    temples ||--o{ pickup_slots : schedules
    temples ||--o{ bookings : fulfills
    temples ||--o{ media_assets : owns

    temples {
        uuid id PK
        string slug UK
        string name
        string deity
        string description
        string contact_email
        string contact_phone
        string address_line1
        string city
        string state
        string postal_code
        decimal latitude
        decimal longitude
        boolean is_active
        boolean is_archived
        timestamp archived_at
        timestamp created_at
        timestamp updated_at
    }

    media_assets {
        uuid id PK
        uuid temple_id FK "Nullable"
        uuid uploaded_by FK
        string file_name
        string file_url
        string mime_type
        int file_size_bytes
        string alt_text
        string asset_type "BANNER, ITEM_THUMBNAIL, CONTAINER_COVER, GENERAL"
        timestamp created_at
    }

    containers ||--o{ container_items : includes
    containers {
        uuid id PK
        uuid temple_id FK
        string slug
        string title
        string description
        uuid cover_media_id FK
        string layout_type "GRID, CAROUSEL, FEATURED_BANNER"
        int display_order
        boolean is_published
        boolean is_archived
        timestamp published_at
        timestamp archived_at
        timestamp created_at
        timestamp updated_at
    }

    prasadam_items ||--o{ container_items : categorized_in
    prasadam_items ||--|| inventory : tracked_by
    prasadam_items ||--o{ booking_items : referenced_by
    prasadam_items {
        uuid id PK
        uuid temple_id FK
        string slug
        string name
        string description
        decimal price "Decimal(10,2)"
        string ingredients
        string allergens
        int shelf_life_hours
        boolean is_perishable
        int max_quantity_per_devotee
        int preparation_time_minutes
        uuid thumbnail_media_id FK
        int display_order
        string status "AVAILABLE, SOLD_OUT, DISCONTINUED, ARCHIVED"
        timestamp created_at
        timestamp updated_at
    }

    container_items {
        uuid id PK
        uuid container_id FK
        uuid prasadam_item_id FK
        int display_order
        boolean is_highlighted
        timestamp added_at
    }

    %% ==========================================
    %% INVENTORY AND RESERVATIONS
    %% ==========================================
    inventory ||--o{ inventory_movements : logs
    inventory ||--o{ inventory_reservations : reserves

    inventory {
        uuid id PK
        uuid prasadam_item_id FK UK
        uuid temple_id FK
        int quantity_available "CHECK >= 0"
        int quantity_reserved "CHECK >= 0"
        int low_stock_threshold
        int safety_buffer
        boolean is_unlimited
        int lock_version "Optimistic Lock"
        timestamp last_restocked_at
        timestamp updated_at
    }

    inventory_movements {
        uuid id PK
        uuid inventory_id FK
        string movement_type "RESTOCK, RESERVATION_HOLD, RESERVATION_RELEASE, ORDER_FULFILLMENT, SPOILAGE_WASTE, AUDIT_ADJUSTMENT"
        int quantity_change
        int quantity_before
        int quantity_after
        string reference_type "BOOKING, PURCHASE_BATCH, MANUAL"
        uuid reference_id
        string notes
        uuid initiated_by FK
        timestamp created_at
    }

    inventory_reservations {
        uuid id PK
        uuid inventory_id FK
        uuid booking_id FK
        int quantity
        string status "ACTIVE, COMMITTED, RELEASED_EXPIRED"
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    %% ==========================================
    %% BOOKING, PAYMENT, QR AND PICKUP
    %% ==========================================
    pickup_counters ||--o{ pickup_slots : hosts
    pickup_counters ||--o{ bookings : designated_for
    pickup_counters {
        uuid id PK
        uuid temple_id FK
        string counter_number
        string name
        string location_description
        boolean is_active
        timestamp created_at
    }

    pickup_slots ||--o{ bookings : scheduled_in
    pickup_slots ||--o{ booking_reschedules : from_slot
    pickup_slots ||--o{ booking_reschedules : to_slot
    pickup_slots {
        uuid id PK
        uuid temple_id FK
        uuid counter_id FK
        date slot_date
        time start_time
        time end_time
        int capacity
        int booked_count "CHECK <= capacity"
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    bookings ||--o{ booking_items : contains
    bookings ||--o{ payments : charged_by
    bookings ||--o{ booking_reschedules : tracks
    bookings ||--|| qr_tokens : validates_with
    bookings ||--o{ inventory_reservations : holds

    bookings {
        uuid id PK
        string booking_reference UK
        uuid devotee_id FK
        uuid temple_id FK
        uuid pickup_slot_id FK
        uuid pickup_counter_id FK
        string status "DRAFT, PENDING_PAYMENT, CONFIRMED, READY_FOR_PICKUP, COMPLETED, CANCELLED, RESCHEDULED, EXPIRED"
        decimal total_amount "Decimal(10,2)"
        string devotee_name_snapshot
        string devotee_phone_snapshot
        string special_instructions
        string cancellation_reason
        timestamp cancellation_requested_at
        timestamp created_at
        timestamp updated_at
    }

    booking_items {
        uuid id PK
        uuid booking_id FK
        uuid prasadam_item_id FK "RESTRICT delete"
        string item_name_snapshot
        string item_sku_snapshot
        decimal unit_price_snapshot "Decimal(10,2)"
        int quantity
        decimal line_total "Decimal(10,2)"
        timestamp created_at
    }

    booking_reschedules {
        uuid id PK
        uuid booking_id FK
        uuid previous_slot_id FK
        uuid new_slot_id FK
        string reason
        uuid requested_by FK
        timestamp created_at
    }

    payments ||--o{ refunds : debited_by
    payments {
        uuid id PK
        uuid booking_id FK
        string idempotency_key UK
        string gateway "RAZORPAY, STRIPE, UPI_INTENT"
        string gateway_order_id
        string gateway_payment_id
        string gateway_signature
        decimal amount "Decimal(10,2)"
        string currency
        string status "PENDING, SUCCESS, FAILED, REFUNDED"
        jsonb gateway_response_payload
        timestamp paid_at
        timestamp created_at
        timestamp updated_at
    }

    refunds {
        uuid id PK
        uuid payment_id FK
        string gateway_refund_id UK
        decimal amount "Decimal(10,2)"
        string reason
        string status "INITIATED, SUCCESS, FAILED"
        timestamp processed_at
        timestamp created_at
    }

    qr_tokens {
        uuid id PK
        uuid booking_id FK UK
        string token_hash UK
        string salt
        string short_code
        string status "ISSUED, SCANNED, EXPIRED, REVOKED"
        timestamp expires_at
        timestamp scanned_at
        uuid scanned_by FK
        timestamp created_at
    }

    %% ==========================================
    %% LOCATION, NOTIFICATIONS AND SUPPORT
    %% ==========================================
    users ||--o{ location_requests : requests
    users ||--o{ notifications : receives
    users ||--o{ support_tickets : opens
    support_tickets ||--o{ support_messages : has

    location_requests {
        uuid id PK
        uuid user_id FK
        string purpose "GEOFENCE_PICKUP_CHECK, NEARBY_TEMPLE_DISCOVERY"
        decimal latitude
        decimal longitude
        decimal accuracy_meters
        boolean is_within_geofence
        string ip_address
        timestamp requested_at
        timestamp expires_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        uuid temple_id FK "Nullable"
        string title
        string message
        string channel "IN_APP, SMS, WHATSAPP, EMAIL"
        string notification_type "BOOKING_CONFIRMATION, PICKUP_REMINDER, ADMIN_APPROVAL, STOCK_ALERT, SUPPORT_UPDATE"
        boolean is_read
        jsonb metadata
        timestamp sent_at
        timestamp read_at
    }

    support_tickets {
        uuid id PK
        string ticket_number UK
        uuid devotee_id FK
        uuid temple_id FK "Nullable"
        uuid booking_id FK "Nullable"
        string subject
        string category "BOOKING, PAYMENT, PRASADAM_QUALITY, PICKUP_ISSUE, GENERAL"
        string priority "LOW, MEDIUM, HIGH, CRITICAL"
        string status "OPEN, IN_PROGRESS, RESOLVED, CLOSED"
        uuid assigned_to FK
        timestamp resolved_at
        timestamp created_at
        timestamp updated_at
    }

    support_messages {
        uuid id PK
        uuid ticket_id FK
        uuid sender_id FK
        boolean is_staff
        string message_text
        uuid attachment_media_id FK
        boolean is_internal_note
        timestamp created_at
    }

    %% ==========================================
    %% AI ASSISTANT, AUDIT AND SETTINGS
    %% ==========================================
    users ||--o{ ai_conversations : engages
    ai_conversations ||--o{ ai_messages : exchanges

    ai_conversations {
        uuid id PK
        uuid user_id FK
        uuid temple_id FK "Nullable"
        string session_token
        string status "ACTIVE, ARCHIVED, EXPIRED"
        timestamp expires_at
        timestamp created_at
    }

    ai_messages {
        uuid id PK
        uuid conversation_id FK
        string role "USER, ASSISTANT, SYSTEM"
        string content
        int tokens_used
        timestamp created_at
    }

    audit_logs {
        uuid id PK
        uuid actor_id FK "Nullable for system actions"
        string actor_role
        string action "CREATE, UPDATE, DELETE, AUTHENTICATE, SCAN_QR, REFUND"
        string entity_name
        uuid entity_id
        jsonb previous_state
        jsonb new_state
        string ip_address
        string user_agent
        timestamp created_at
    }

    system_settings {
        uuid id PK
        string key UK
        jsonb value
        string description
        boolean is_public
        uuid updated_by FK
        timestamp updated_at
    }
```

---

### 3. Detailed Schema Specification & Relational Contract

#### 3.1 Accounts, RBAC, and Authentication
- **Multi-Tenant Scoping**: Role assignments in `user_roles` carry an optional `temple_id`. If `temple_id` is `NULL`, the role applies globally (e.g., `MAIN_ADMIN` managing the entire portal system). If populated, the privileges apply strictly to that temple (e.g., `TEMPLE_ADMIN` managing offerings for Tirupati or Madurai only, or `COUNTER_STAFF` scanning tokens at a specific counter).
- **Admin Approval Workflow**: When a devotee or staff member requests admin access, an `admin_access_requests` entry is created with status `PENDING`. Only users with `MAIN_ADMIN` role can execute approval transactions, which atomically change the request to `APPROVED` and insert a record into `user_roles`.
- **Session Revocation**: The `sessions` table tracks active JWT/session identifiers with client fingerprints (`ip_address`, `user_agent`). Explicit logout or security revoking instantly marks `is_revoked = true`, allowing microsecond session invalidation at the backend middleware without waiting for token expiration.

#### 3.2 Temples, Containers, and Public Content
- **Multi-Temple Isolation**: Every prasadam item, container, counter, and slot is foreign-keyed to `temples(id)`.
- **UI Container Architecture**: Dynamic homepage and temple pages organize offerings using `containers` (e.g., "Daily Special Prasadam", "Festival Specials", "Sweets & Savouries"). `container_items` provides a many-to-many relationship with `display_order` and `is_highlighted` flags, allowing the same laddu or pulihora to appear in multiple promotional blocks without duplicating the product record.
- **Media Assets**: The `media_assets` table normalizes image/document storage, tracking secure Cloud/S3 URLs, MIME types, dimensions, and asset categories (`BANNER`, `ITEM_THUMBNAIL`, `CONTAINER_COVER`).
- **Safe Archival Rules**: Temples and containers are never deleted via `DELETE` statements. Soft-archival columns (`is_archived`, `archived_at`) preserve foreign key integrity while excluding archived entities from devotee queries via standard database indexes (`WHERE is_archived = false AND is_active = true`).

#### 3.3 Zero-Overselling Inventory & Concurrency Protection
- **Separation of Stock States**: `inventory` maintains distinct columns:
  - `quantity_available`: Unreserved stock physically available for booking.
  - `quantity_reserved`: Stock locked in uncommitted checkout transactions.
  - `safety_buffer`: Guaranteed buffer reserved for on-site emergencies or VIP seva.
- **Transactional Stock Reservation**:
  1. Devotee starts checkout: The backend initiates a PostgreSQL transaction with `SELECT ... FOR UPDATE` on `inventory`.
  2. The system verifies `quantity_available >= requested_qty + safety_buffer`.
  3. The system decrements `quantity_available` by `requested_qty`, increments `quantity_reserved`, and writes an `inventory_reservations` row with an expiration timestamp (`expires_at = NOW() + INTERVAL '10 minutes'`).
  4. An audit record is logged in `inventory_movements`.
  5. Upon payment success: `quantity_reserved` decrements, reservation status switches to `COMMITTED`, and stock is converted to a confirmed booking.
  6. If payment fails or times out: A background worker releases expired reservations by incrementing `quantity_available` back.
- **PostgreSQL Constraints**: Check constraints (`CHECK (quantity_available >= 0)` and `CHECK (quantity_reserved >= 0)`) ensure that no race condition can ever force negative inventory.

#### 3.4 Bookings, Payments, Pricing Snapshots, and QR Tokens
- **Historical Receipt Snapshotting**: The `booking_items` table stores immutable fields:
  - `item_name_snapshot` (e.g., "Special Tirupati Laddu (Big)")
  - `item_sku_snapshot`
  - `unit_price_snapshot` (`Decimal(10,2)`)
  - `line_total` (`Decimal(10,2)`)
  If a temple admin modifies the price of Tirupati Laddu from ₹50 to ₹75 next week, past receipts, payments, and financial tax records remain 100% accurate.
- **Foreign Key Deletion Invariant**: Relationships from `booking_items` to `prasadam_items` and `bookings` to `temples` enforce `onDelete: Restrict`. Deleting a prasadam item that has existing bookings is rejected by the database.
- **Payment Idempotency & Webhook Safety**: The `payments` table features a unique constraint on `idempotency_key`. Payment gateway webhooks (e.g., Razorpay/Stripe) provide event identifiers; any replay or duplicate callback fails gracefully without executing double credits or double booking completions.
- **Cryptographic QR Tokens**: `qr_tokens` stores `token_hash` (SHA-256 of the verifiable payload + salt) and `short_code`. Counter staff scan the QR code via the Admin Portal, matching the hash against the database in an atomic update (`status = SCANNED`, `scanned_at = NOW()`, `scanned_by = staff_id`). Once scanned, subsequent scans are immediately rejected as duplicate/already redeemed.
- **Pickup Slots & Capacity Throttling**: `pickup_slots` tracks `capacity` and `booked_count`. Booking confirmation increments `booked_count` with row locking, guarded by `CHECK (booked_count <= capacity)`. Rescheduling shifts bookings between slots via `booking_reschedules` history rows.

#### 3.5 Location, Notifications, and Customer Care
- **Devotee Privacy & Ephemeral Location**: `location_requests` records geo-coordinates strictly for distance discovery or geofenced counter proximity checks. Records carry an expiration timestamp (`expires_at`) and are partitioned or cleaned up via retention policies.
- **Support Workflow**: `support_tickets` links devotees, temples, and bookings with strict enum state machines (`OPEN` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`). Staff responses and internal notes (`is_internal_note = true`) enable seamless customer care.

#### 3.6 AI Assistant Context & Retention Policy
- **Privacy by Design**: Devotees conversing with the AI assistant have sessions logged in `ai_conversations` and `ai_messages`.
- **Zero-PII Storage**: The AI system prompt strictly forbids storing card numbers, bank details, or passwords in chat context.
- **Automated Retention**: An automated database retention job executes nightly:
  ```sql
  DELETE FROM ai_messages 
  WHERE conversation_id IN (
    SELECT id FROM ai_conversations WHERE created_at < NOW() - INTERVAL '30 days'
  );
  DELETE FROM ai_conversations WHERE created_at < NOW() - INTERVAL '30 days';
  ```

---

### 4. Database Integrity, Data Types, and Indexing Strategy

| Entity Area | Column / Relation | Data Type | Constraint / Rule |
| :--- | :--- | :--- | :--- |
| **All Entities** | `id` | `UUID` | Primary Key, `gen_random_uuid()` default |
| **Financial Values** | `price`, `amount`, `total_amount` | `Decimal(10,2)` | Stored as exact fixed-point decimals, never float |
| **Temporal Data** | `*_at`, `created_at`, `updated_at` | `TIMESTAMPTZ` | Always stored in UTC; formatted to temple timezone at presentation layer |
| **User Identity** | `users.email`, `users.phone_number` | `VARCHAR(255)` | Lowercased, `UNIQUE` index |
| **Booking Ref** | `bookings.booking_reference` | `VARCHAR(32)` | `UNIQUE` index, human-readable format (e.g. `BK-20261019-XXXX`) |
| **Idempotency** | `payments.idempotency_key` | `VARCHAR(128)` | `UNIQUE` index |
| **Stock Security** | `inventory.quantity_available` | `INTEGER` | `CHECK (quantity_available >= 0)` |
| **Stock Locks** | `inventory.quantity_reserved` | `INTEGER` | `CHECK (quantity_reserved >= 0)` |
| **Slot Throttling** | `pickup_slots.booked_count` | `INTEGER` | `CHECK (booked_count <= capacity)` |
| **Soft Delete** | `temples`, `containers`, `items` | `BOOLEAN`, `TIMESTAMPTZ` | Soft delete flags (`is_archived`), no cascading drops |

#### High-Performance Indexes Planned:
1. `CREATE INDEX idx_temples_slug ON temples(slug) WHERE is_archived = false;`
2. `CREATE INDEX idx_prasadam_temple_status ON prasadam_items(temple_id, status) WHERE status = 'AVAILABLE';`
3. `CREATE INDEX idx_containers_temple_order ON containers(temple_id, display_order) WHERE is_published = true;`
4. `CREATE INDEX idx_bookings_devotee_created ON bookings(devotee_id, created_at DESC);`
5. `CREATE INDEX idx_bookings_reference ON bookings(booking_reference);`
6. `CREATE INDEX idx_pickup_slots_lookup ON pickup_slots(temple_id, slot_date, counter_id);`
7. `CREATE INDEX idx_qr_tokens_hash ON qr_tokens(token_hash);`
8. `CREATE INDEX idx_inventory_reservations_exp ON inventory_reservations(expires_at) WHERE status = 'ACTIVE';`
9. `CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);`
10. `CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);`

---

### 5. Summary of Stage 1 Deliverable & Verification

This architecture fully answers all aspects of Prompt 4 Section 1 (Main Requirement), Section 2 (Core Schema), Section 3 (Relationships), Section 4 (Data Integrity and Security), and Section 6 (Integration Contract).

**Ready to proceed to Stage 2: Create the Prisma Schema (`prisma/schema.prisma`).**
